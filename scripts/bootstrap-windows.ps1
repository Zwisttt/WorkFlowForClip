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
    throw "$Command 执行失败，退出码：$LASTEXITCODE"
  }
}

function Install-WingetPackage([string]$Id, [string]$DisplayName) {
  if (-not (Test-Command 'winget.exe')) {
    throw "缺少 $DisplayName，且系统没有 winget。请先从 Microsoft Store 安装“应用安装程序”。"
  }

  Write-Step "正在安装 $DisplayName"
  Invoke-Checked 'winget.exe' @(
    'install',
    '--id', $Id,
    '--exact',
    '--accept-package-agreements',
    '--accept-source-agreements'
  )
  Refresh-ProcessPath
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

  Write-Host "MatrixFlow Windows 一键启动" -ForegroundColor Green
  Write-Host "项目目录：$ProjectRoot"

  if (Test-Node) {
    Write-Host "[跳过] Node.js 已安装：$(& node.exe --version)" -ForegroundColor DarkGreen
  } else {
    Install-WingetPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    if (-not (Test-Node)) {
      throw 'Node.js 安装后仍不可用，请重启 Windows 后再次双击 start-windows.bat。'
    }
  }

  if (-not (Test-Command 'npm.cmd')) {
    throw 'npm 不可用。请重新安装 Node.js LTS，并确认安装程序已将 Node.js 加入 PATH。'
  }
  Write-Host "[通过] npm：$(& npm.cmd --version)" -ForegroundColor DarkGreen

  $python = Find-Python
  if ($null -eq $python) {
    Install-WingetPackage 'Python.Python.3.12' 'Python 3.12'
    $python = Find-Python
  }
  if ($null -eq $python) {
    throw 'Python 3 安装后仍不可用，请重启 Windows 后再次双击 start-windows.bat。'
  }
  $pythonCommand = [string]$python.Command
  $pythonPrefix = [string[]]$python.Prefix
  $pythonVersion = & $pythonCommand @pythonPrefix --version
  Write-Host "[通过] $pythonVersion" -ForegroundColor DarkGreen

  if (Test-Command 'ffmpeg.exe') {
    Write-Host '[跳过] FFmpeg 已安装' -ForegroundColor DarkGreen
  } else {
    Install-WingetPackage 'Gyan.FFmpeg' 'FFmpeg'
    if (-not (Test-Command 'ffmpeg.exe')) {
      Write-Warning 'FFmpeg 已安装但当前进程尚未识别；不影响启动，重启 Windows 后即可使用视频缩略图功能。'
    }
  }

  $lockFile = Join-Path $ProjectRoot 'package-lock.json'
  if (-not (Test-Path $lockFile)) {
    throw '项目缺少 package-lock.json，请确认 GitHub 仓库拉取完整。'
  }

  $lockHash = (Get-FileHash $lockFile -Algorithm SHA256).Hash
  $npmMarker = Join-Path $StateRoot 'npm-lock.sha256'
  $electronCommand = Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd'
  $savedNpmHash = if (Test-Path $npmMarker) { (Get-Content $npmMarker -Raw).Trim() } else { '' }

  if ((-not (Test-Path $electronCommand)) -or $savedNpmHash -ne $lockHash) {
    Write-Step '正在安装/更新 Node.js 项目依赖'
    Invoke-Checked 'npm.cmd' @('ci')
    Set-Content -Path $npmMarker -Value $lockHash -Encoding ASCII
  } else {
    Write-Host '[跳过] Node.js 项目依赖已安装且版本未变化' -ForegroundColor DarkGreen
  }

  $pythonCheckArgs = $pythonPrefix + @('-c', 'import pyautogui, pyperclip')
  & $pythonCommand @pythonCheckArgs *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Step '正在安装剪映自动导出 Python 依赖'
    $requirements = Join-Path $ProjectRoot 'electron\automation\python\requirements.txt'
    $pipArgs = $pythonPrefix + @(
      '-m', 'pip', 'install',
      '--disable-pip-version-check',
      '-r', $requirements
    )
    Invoke-Checked $pythonCommand $pipArgs
  } else {
    Write-Host '[跳过] Python 自动化依赖已安装' -ForegroundColor DarkGreen
  }

  $patchrightMarker = Join-Path $StateRoot 'patchright-lock.sha256'
  $savedPatchrightHash = if (Test-Path $patchrightMarker) {
    (Get-Content $patchrightMarker -Raw).Trim()
  } else {
    ''
  }
  if ($savedPatchrightHash -ne $lockHash) {
    Write-Step '正在检查并安装 Patchright Chrome'
    Invoke-Checked 'npx.cmd' @('patchright', 'install', 'chrome')
    Set-Content -Path $patchrightMarker -Value $lockHash -Encoding ASCII
  } else {
    Write-Host '[跳过] Patchright Chrome 已完成安装检查' -ForegroundColor DarkGreen
  }

  $jianyingCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'JianyingPro\JianyingPro.exe'),
    (Join-Path $env:LOCALAPPDATA 'JianyingPro\Apps')
  )
  if (-not ($jianyingCandidates | Where-Object { Test-Path $_ })) {
    Write-Warning '未找到剪映专业版；MatrixFlow 可以启动，但自动剪辑导出前需要先安装剪映专业版。'
  }

  Write-Step '环境检查完成，正在启动 MatrixFlow'
  Write-Host '请使用自动打开的桌面窗口，不要在浏览器中打开 localhost:5173。' -ForegroundColor Yellow
  Invoke-Checked 'npm.cmd' @('run', 'dev')
} catch {
  Write-Host ""
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "请保留本窗口并根据上面的具体步骤处理。" -ForegroundColor Yellow
  exit 1
}
