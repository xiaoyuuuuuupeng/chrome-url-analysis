#!/bin/bash
# 智能书签管理器 - 打包脚本 (macOS / Linux)
version=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
zipName="chrome-url-analysis-v${version}.zip"

zip -r "$zipName" manifest.json icons newtab popup options background \
  -x "*.git*" -x "*.DS_Store" -x "icons/make-icons.js"

echo "已生成: $zipName"
