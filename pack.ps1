# 智能书签管理器 - 打包脚本 (Windows PowerShell)
$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$zipName = "chrome-url-analysis-v$version.zip"

$items = @("manifest.json", "icons", "newtab", "popup", "options", "background")
if (Test-Path $zipName) { Remove-Item $zipName }
Compress-Archive -Path $items -DestinationPath $zipName
Write-Host "已生成: $zipName"
