#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_ROOT="$PROJECT_ROOT/.matrixflow-bootstrap"

step() {
  printf '\n==> %s\n' "$1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

refresh_homebrew_path() {
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_command_line_tools() {
  if xcode-select -p >/dev/null 2>&1; then
    printf '[跳过] Xcode Command Line Tools 已安装\n'
    return
  fi

  step '正在请求安装 Xcode Command Line Tools'
  xcode-select --install >/dev/null 2>&1 || true
  printf '请在系统弹窗中完成安装，本窗口会自动继续等待。\n'
  until xcode-select -p >/dev/null 2>&1; do
    sleep 5
  done
}

ensure_homebrew() {
  refresh_homebrew_path
  if has_command brew; then
    printf '[跳过] Homebrew 已安装：%s\n' "$(brew --version | head -n 1)"
    return
  fi

  step '正在安装 Homebrew'
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  refresh_homebrew_path
  if ! has_command brew; then
    printf 'Homebrew 安装完成但尚未进入 PATH，请关闭本窗口后再次双击 start-macos.command。\n' >&2
    exit 1
  fi
}

node_is_supported() {
  if ! has_command node; then return 1; fi
  local major
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  [ "$major" -ge 18 ]
}

install_brew_package_if_missing() {
  local command_name="$1"
  local formula="$2"
  local display_name="$3"
  if has_command "$command_name"; then
    printf '[跳过] %s 已安装\n' "$display_name"
  else
    step "正在安装 $display_name"
    brew install "$formula"
  fi
}

install_python_dependencies() {
  if python3 -c 'import pyautogui, pyperclip' >/dev/null 2>&1; then
    printf '[跳过] Python 自动化依赖已安装\n'
    return
  fi

  step '正在安装剪映自动导出 Python 依赖'
  local requirements="$PROJECT_ROOT/electron/automation/python/requirements.txt"
  if ! python3 -m pip install --user --break-system-packages --disable-pip-version-check -r "$requirements"; then
    python3 -m pip install --user --disable-pip-version-check -r "$requirements"
  fi
  python3 -c 'import pyautogui, pyperclip'
}

cd "$PROJECT_ROOT"
mkdir -p "$STATE_ROOT"

printf 'MatrixFlow macOS 一键启动\n'
printf '项目目录：%s\n' "$PROJECT_ROOT"

ensure_command_line_tools
ensure_homebrew

if node_is_supported; then
  printf '[跳过] Node.js 已安装：%s\n' "$(node --version)"
else
  step '正在安装 Node.js LTS'
  brew install node
  hash -r
fi

if ! node_is_supported || ! has_command npm; then
  printf 'Node.js/npm 安装后仍不可用，请关闭本窗口后重新运行。\n' >&2
  exit 1
fi
printf '[通过] npm：%s\n' "$(npm --version)"

if has_command python3 && python3 -m pip --version >/dev/null 2>&1; then
  printf '[跳过] Python 3 已安装：%s\n' "$(python3 --version)"
else
  step '正在安装 Python 3'
  brew install python
  hash -r
fi
install_brew_package_if_missing ffmpeg ffmpeg 'FFmpeg'
install_python_dependencies

if [ ! -f package-lock.json ]; then
  printf '项目缺少 package-lock.json，请确认项目文件完整。\n' >&2
  exit 1
fi

LOCK_HASH="$(shasum -a 256 package-lock.json | awk '{print $1}')"
NPM_MARKER="$STATE_ROOT/npm-lock.sha256"
SAVED_NPM_HASH="$(test -f "$NPM_MARKER" && tr -d '[:space:]' < "$NPM_MARKER" || true)"
if [ ! -x node_modules/.bin/electron ] || [ "$SAVED_NPM_HASH" != "$LOCK_HASH" ]; then
  step '正在安装/更新 Node.js 项目依赖'
  npm ci
  printf '%s\n' "$LOCK_HASH" > "$NPM_MARKER"
else
  printf '[跳过] Node.js 项目依赖已安装且版本未变化\n'
fi

PATCHRIGHT_MARKER="$STATE_ROOT/patchright-lock.sha256"
SAVED_PATCHRIGHT_HASH="$(test -f "$PATCHRIGHT_MARKER" && tr -d '[:space:]' < "$PATCHRIGHT_MARKER" || true)"
if [ "$SAVED_PATCHRIGHT_HASH" != "$LOCK_HASH" ]; then
  step '正在检查并安装 Patchright Chrome'
  npx patchright install chrome
  printf '%s\n' "$LOCK_HASH" > "$PATCHRIGHT_MARKER"
else
  printf '[跳过] Patchright Chrome 已完成安装检查\n'
fi

if [ ! -d /Applications/VideoFusion-macOS.app ]; then
  printf '[提醒] 未在 /Applications 找到剪映专业版；MatrixFlow 可以启动，但自动剪辑导出前需要安装剪映。\n'
fi

step '环境检查完成，正在启动 MatrixFlow'
printf '请使用自动打开的桌面窗口，不要在浏览器中打开 localhost:5173。\n'
npm run dev
