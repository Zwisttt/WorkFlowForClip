"""MatrixFlow Jianying/CapCut desktop export worker."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path


def load_automation_modules():
    try:
        import pyautogui
        import pyperclip
    except ImportError as exc:
        raise RuntimeError(
            "缺少剪映自动化依赖，请安装：python -m pip install pyautogui pyperclip"
        ) from exc
    return pyautogui, pyperclip


def emit(event: str, **payload):
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def capture(delay: float):
    pyautogui, _ = load_automation_modules()
    time.sleep(max(0.1, delay))
    point = pyautogui.position()
    emit("captured", x=int(point.x), y=int(point.y))


def paste(text: str, pyautogui, pyperclip):
    pyperclip.copy(text)
    modifier = "command" if sys.platform == "darwin" else "ctrl"
    pyautogui.hotkey(modifier, "v")


def export_one(payload_path: str):
    pyautogui, pyperclip = load_automation_modules()
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    coordinates = payload["coordinates"]
    draft_name = payload["draftName"]
    pause = max(0.1, float(payload.get("stepPauseSeconds", 1)))
    open_wait = max(1, float(payload.get("openWaitSeconds", 8)))
    export_wait = max(1, float(payload.get("exportWaitSeconds", 60)))
    home_wait = max(1, float(payload.get("homeWaitSeconds", 5)))
    pyautogui.PAUSE = 0.15

    def click(key: str):
        point = coordinates[key]
        pyautogui.click(int(point["x"]), int(point["y"]))
        time.sleep(pause)

    emit("progress", stage="search", message=f"搜索草稿：{draft_name}")
    click("search")
    modifier = "command" if sys.platform == "darwin" else "ctrl"
    pyautogui.hotkey(modifier, "a")
    paste(draft_name, pyautogui, pyperclip)
    pyautogui.press("enter")
    time.sleep(pause)
    click("result")

    emit("progress", stage="open", message=f"正在打开《{draft_name}》")
    time.sleep(open_wait)
    click("export")
    click("confirm")

    emit("progress", stage="export", message=f"正在导出《{draft_name}》")
    time.sleep(export_wait)
    click("close")
    click("home")
    time.sleep(home_wait)
    emit("completed", message=f"《{draft_name}》导出操作完成")


def main():
    if len(sys.argv) < 2:
        raise RuntimeError("缺少 worker 命令")
    command = sys.argv[1]
    if command == "check":
        load_automation_modules()
        emit("ready", platform=sys.platform)
    elif command == "capture":
        capture(float(sys.argv[2] if len(sys.argv) > 2 else 3))
    elif command == "export-one":
        export_one(sys.argv[2])
    else:
        raise RuntimeError(f"未知命令：{command}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        emit("error", message=str(exc))
        raise
