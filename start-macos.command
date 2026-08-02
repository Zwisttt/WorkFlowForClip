#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT" || exit 1

"$PROJECT_ROOT/scripts/bootstrap-macos.sh"
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  printf '\nMatrixFlow 启动失败，请保留上面的错误信息。\n'
  read -r -p '按回车键关闭窗口…' _
fi
exit "$STATUS"
