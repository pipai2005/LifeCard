#!/usr/bin/env bash
# 知识笔记本 — macOS / Linux 启动脚本
#
# 说明：与 start.bat 不同，这里可以放心使用中文 —— bash 全程按 UTF-8 处理文本，
# 不存在 cmd.exe 那种「按 GBK 误读批处理文件」的问题。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  [错误] 没有检测到 Node.js"
  echo "  请先安装：https://nodejs.org/  （下载 LTS 版本即可）"
  echo ""
  exit 1
fi

echo ""
echo "  =========================================================="
echo "   知识笔记本"
echo "  =========================================================="
echo ""
echo "    Node.js  : $(command -v node)"
echo "    Node 版本: $(node -v)"
echo "    访问地址 : http://127.0.0.1:4321"
echo ""
echo "    浏览器会自动打开；若没有，请手动访问上面的地址。"
echo "    保持本窗口开启，按 Ctrl + C 停止服务。"
echo ""

# --open 让服务启动后自动打开默认浏览器
exec node server.js --open
