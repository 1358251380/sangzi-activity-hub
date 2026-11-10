# 安装依赖（后端 + 前端）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    Write-Host "==> 安装后端依赖" -ForegroundColor Cyan
    npm --prefix server install --no-audit --no-fund

    Write-Host "==> 安装前端依赖" -ForegroundColor Cyan
    npm --prefix web install --no-audit --no-fund

    Write-Host ""
    Write-Host "依赖安装完成。" -ForegroundColor Green
    Write-Host "下一步：npm run seed    # 写入示例数据" -ForegroundColor Yellow
    Write-Host "然后：  npm run dev     # 启动开发模式" -ForegroundColor Yellow
}
finally {
    Pop-Location
}
