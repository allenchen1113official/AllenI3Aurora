#!/bin/bash
# 常看 YouTube 重點筆記 · Mac mini 一次性安裝（在「終端機」執行；可重跑）
#   bash "$HOME/Library/CloudStorage/GoogleDrive-allenchen1113.official@gmail.com/我的雲端硬碟/AllenI3Aurora/notes/youtube/_engine/install.sh"
# 安裝：yt-dlp、ffmpeg、uv（Homebrew）；mlx-whisper（uv tool, Python 3.12）；
#       FunASR＋modelscope＋OpenCC＋torch（~/.ytnotes/funasr-venv, Python 3.11）；
#       launchd 每 15 分鐘跑一次 `ytnotes.py run`（處理佇列＋每天 06:00 後掃常看頻道）。
# 第一次會下載模型：whisper-large-v3-turbo 約 1.6 GB、FunASR 約 2 GB。
set -euo pipefail
ENGINE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$ENGINE")"
HOMEY="$HOME/.ytnotes"
mkdir -p "$HOMEY/tmp" "$ROOT/_inbox" "$ROOT/詞庫" "$ROOT/notes"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

echo "== 1/5 Homebrew 套件 =="
command -v brew >/dev/null || { echo "請先安裝 Homebrew：https://brew.sh"; exit 1; }
brew install yt-dlp ffmpeg uv || brew upgrade yt-dlp ffmpeg uv || true

echo "== 2/5 mlx-whisper（英文、判斷語言、中文第二意見）=="
uv tool install mlx-whisper --python 3.12 || uv tool upgrade mlx-whisper

echo "== 3/5 FunASR 虛擬環境（中文）=="
[ -x "$HOMEY/funasr-venv/bin/python" ] || uv venv "$HOMEY/funasr-venv" --python 3.11
uv pip install --python "$HOMEY/funasr-venv/bin/python" -U funasr modelscope opencc-python-reimplemented torch torchaudio

echo "== 4/5 預先下載模型（第一次較久）=="
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=3" -ac 1 -ar 16000 "$HOMEY/tmp/warm.wav"
"$HOMEY/funasr-venv/bin/python" "$ENGINE/funasr_run.py" "$HOMEY/tmp/warm.wav" "$HOMEY/tmp/warm.json" >/dev/null 2>&1 || echo "（FunASR 預熱有警告，可忽略；首次實跑時會再下載）"
mlx_whisper "$HOMEY/tmp/warm.wav" --model mlx-community/whisper-large-v3-turbo --output-format json --output-dir "$HOMEY/tmp" --verbose False >/dev/null 2>&1 || true
rm -f "$HOMEY/tmp/warm."*

echo "== 5/5 launchd 排程（每 15 分鐘）=="
PY="$(uv python find 3.12)"
PLIST="$HOME/Library/LaunchAgents/official.allen.ytnotes.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>official.allen.ytnotes</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$ENGINE/ytnotes.py</string><string>run</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin</string>
    <key>YTNOTES_ROOT</key><string>$ROOT</string>
  </dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$HOMEY/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOMEY/launchd.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/official.allen.ytnotes" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

{
  echo "安裝時間：$(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M')（台北）"
  echo "yt-dlp $(yt-dlp --version)"; ffmpeg -version | head -1; uv --version
  echo "mlx-whisper：$(command -v mlx_whisper)"
  echo "FunASR venv：$HOMEY/funasr-venv（$("$HOMEY/funasr-venv/bin/python" -c 'import funasr,torch;print("funasr",funasr.__version__,"torch",torch.__version__)' 2>/dev/null)）"
  echo "launchd：${PLIST}（Python ${PY}）"
} | tee "$ENGINE/versions.txt"
echo "完成。若 macOS 跳出「要取用 Google Drive 中的檔案」請按允許。"
echo "測試：\"$PY\" \"$ENGINE/ytnotes.py\" draft https://www.youtube.com/watch?v=<影片ID>"
