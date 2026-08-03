param()

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'MatrixFlow\bootstrap'

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code: $LASTEXITCODE"
  }
}

function Install-WingetPackage([string]$Id, [string]$DisplayName) {
  if (-not (Test-Command 'winget.exe')) {
    throw "$DisplayName is missing and winget is unavailable. Install App Installer from Microsoft Store first."
  }

  Write-Step "Installing $DisplayName"
  Invoke-Checked 'winget.exe' @(
    'install',
    '--id', $Id,
    '--exact',
    '--accept-package-agreements',
    '--accept-source-agreements'
  )
  Refresh-ProcessPath
}

function Test-VisualStudioCppBuildTools {
  $vswhereCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe')
  )
  $vswhere = $vswhereCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($null -eq $vswhere) { return $false }

  $installationPath = & $vswhere -latest -products * `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath
  return -not [string]::IsNullOrWhiteSpace($installationPath)
}

function Install-VisualStudioCppBuildTools {
  if (Test-VisualStudioCppBuildTools) { return }

  $installer = Join-Path $StateRoot 'vs_BuildTools.exe'
  Write-Step 'Downloading Visual Studio 2022 Build Tools'
  try {
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' `
      -OutFile $installer -UseBasicParsing
  } catch {
    throw "Unable to download Visual Studio Build Tools: $($_.Exception.Message)"
  }

  Write-Step 'Installing Visual Studio C++ Build Tools (administrator approval may be required)'
  $process = Start-Process -FilePath $installer -Verb RunAs -Wait -PassThru -ArgumentList @(
    '--quiet', '--wait', '--norestart', '--nocache',
    '--add', 'Microsoft.VisualStudio.Workload.VCTools',
    '--includeRecommended'
  )
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "Visual Studio Build Tools installation failed with exit code: $($process.ExitCode)"
  }
  $detected = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    if (Test-VisualStudioCppBuildTools) {
      $detected = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $detected) {
    throw 'Visual Studio C++ Build Tools were not detected within 60 seconds after installation.'
  }
  if ($process.ExitCode -eq 3010) {
    Write-Warning 'Visual Studio Build Tools installed successfully. A restart is recommended.'
  }
}

function Test-Node {
  if (-not (Test-Command 'node.exe')) { return $false }
  try {
    $version = (& node.exe --version).Trim().TrimStart('v')
    $major = [int]($version.Split('.')[0])
    return $major -ge 18
  } catch {
    return $false
  }
}

function Find-Python {
  if (Test-Command 'py.exe') {
    & py.exe -3 --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return @{ Command = 'py.exe'; Prefix = @('-3') }
    }
  }
  if (Test-Command 'python.exe') {
    & python.exe --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return @{ Command = 'python.exe'; Prefix = @() }
    }
  }
  return $null
}

try {
  Set-Location $ProjectRoot
  New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

  Write-Host "MatrixFlow Windows launcher" -ForegroundColor Green
  Write-Host "Project directory: $ProjectRoot"

  if (Test-Node) {
    Write-Host "[Skip] Node.js already installed: $(& node.exe --version)" -ForegroundColor DarkGreen
  } else {
    Install-WingetPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    if (-not (Test-Node)) {
      throw 'Node.js is still unavailable after installation. Restart Windows and run start-windows.bat again.'
    }
  }

  if (-not (Test-Command 'npm.cmd')) {
    throw 'npm is unavailable. Reinstall Node.js LTS and make sure the installer adds Node.js to PATH.'
  }
  Write-Host "[OK] npm: $(& npm.cmd --version)" -ForegroundColor DarkGreen

  $python = Find-Python
  if ($null -eq $python) {
    Install-WingetPackage 'Python.Python.3.12' 'Python 3.12'
    $python = Find-Python
  }
  if ($null -eq $python) {
    throw 'Python 3 is still unavailable after installation. Restart Windows and run start-windows.bat again.'
  }
  $pythonCommand = [string]$python.Command
  $pythonPrefix = [string[]]$python.Prefix
  $pythonVersion = & $pythonCommand @pythonPrefix --version
  Write-Host "[OK] $pythonVersion" -ForegroundColor DarkGreen

  if (Test-Command 'ffmpeg.exe') {
    Write-Host '[Skip] FFmpeg already installed' -ForegroundColor DarkGreen
  } elseif (Test-Command 'winget.exe') {
    try {
      Install-WingetPackage 'Gyan.FFmpeg' 'FFmpeg'
      if (-not (Test-Command 'ffmpeg.exe')) {
        Write-Warning 'FFmpeg was installed but is not visible to this process yet. Restart Windows to enable video thumbnails.'
      }
    } catch {
      Write-Warning "FFmpeg installation was skipped: $($_.Exception.Message)"
    }
  } else {
    Write-Warning 'FFmpeg and winget are unavailable. Continuing without video thumbnail support.'
  }

  $lockFile = Join-Path $ProjectRoot 'package-lock.json'
  if (-not (Test-Path $lockFile)) {
    throw 'package-lock.json is missing. Ensure the GitHub repository was cloned completely.'
  }

  $lockHash = (Get-FileHash $lockFile -Algorithm SHA256).Hash
  $npmMarker = Join-Path $StateRoot 'npm-lock.sha256'
  $electronCommand = Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd'
  $savedNpmHash = if (Test-Path $npmMarker) { (Get-Content $npmMarker -Raw).Trim() } else { '' }

  if ((-not (Test-Path $electronCommand)) -or $savedNpmHash -ne $lockHash) {
    Write-Step 'Installing or updating Node.js dependencies'
    Invoke-Checked 'npm.cmd' @('ci', '--legacy-peer-deps')
    Set-Content -Path $npmMarker -Value $lockHash -Encoding ASCII
  } else {
    Write-Host '[Skip] Node.js dependencies are installed and unchanged' -ForegroundColor DarkGreen
  }

  $electronVersion = (& node.exe -p "require('./node_modules/electron/package.json').version").Trim()
  $nativeFingerprint = "$lockHash-electron-$electronVersion"
  $nativeMarker = Join-Path $StateRoot 'native-modules.sha256'
  $savedNativeFingerprint = if (Test-Path $nativeMarker) {
    (Get-Content $nativeMarker -Raw).Trim()
  } else {
    ''
  }
  $nativeModuleWorks = $false
  if (Test-Path $electronCommand) {
    $previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
    try {
      $env:ELECTRON_RUN_AS_NODE = '1'
      & $electronCommand '-e' "require('better-sqlite3')" *> $null
      $nativeModuleWorks = $LASTEXITCODE -eq 0
    } finally {
      $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode
    }
  }
  if ($savedNativeFingerprint -ne $nativeFingerprint -or -not $nativeModuleWorks) {
    Install-VisualStudioCppBuildTools
    Write-Step "Rebuilding the database native module for Electron $electronVersion"
    Invoke-Checked 'npx.cmd' @('electron-rebuild', '--force', '--which-module', 'better-sqlite3')
    $previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
    try {
      $env:ELECTRON_RUN_AS_NODE = '1'
      Invoke-Checked $electronCommand @('-e', "require('better-sqlite3'); console.log('[OK] Electron database module is available')")
    } finally {
      $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode
    }
    Set-Content -Path $nativeMarker -Value $nativeFingerprint -Encoding ASCII
  } else {
    Write-Host '[Skip] Electron database native module matches the current version' -ForegroundColor DarkGreen
  }

  $pythonCheckArgs = $pythonPrefix + @('-c', 'import pyautogui, pyperclip')
  & $pythonCommand @pythonCheckArgs *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Step 'Installing Python dependencies for automated export'
    $requirements = Join-Path $ProjectRoot 'electron\automation\python\requirements.txt'
    $pipArgs = $pythonPrefix + @(
      '-m', 'pip', 'install',
      '--disable-pip-version-check',
      '-r', $requirements
    )
    Invoke-Checked $pythonCommand $pipArgs
  } else {
    Write-Host '[Skip] Python automation dependencies already installed' -ForegroundColor DarkGreen
  }

  $patchrightMarker = Join-Path $StateRoot 'patchright-lock.sha256'
  $savedPatchrightHash = if (Test-Path $patchrightMarker) {
    (Get-Content $patchrightMarker -Raw).Trim()
  } else {
    ''
  }
  if ($savedPatchrightHash -ne $lockHash) {
    Write-Step 'Checking and installing Patchright Chrome'
    Invoke-Checked 'npx.cmd' @('patchright', 'install', 'chrome')
    Set-Content -Path $patchrightMarker -Value $lockHash -Encoding ASCII
  } else {
    Write-Host '[Skip] Patchright Chrome installation already checked' -ForegroundColor DarkGreen
  }

  $jianyingCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'JianyingPro\JianyingPro.exe'),
    (Join-Path $env:LOCALAPPDATA 'JianyingPro\Apps')
  )
  if (-not ($jianyingCandidates | Where-Object { Test-Path $_ })) {
    Write-Warning 'Jianying Pro was not found. MatrixFlow can start, but install it before automated editing and export.'
  }

  Write-Step 'Environment checks complete. Starting MatrixFlow'
  Write-Host 'Building and launching in desktop mode; the first build may take several minutes.' -ForegroundColor Yellow
  Invoke-Checked 'npm.cmd' @('start')
} catch {
  Write-Host ""
  Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Keep this window open and follow the detailed message above." -ForegroundColor Yellow
  exit 1
}
