# 生产模式一键启动：构建前端 → 写入示例数据（仅首次）→ 启动单端口服务
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if (-not (Test-Path 'web/dist/index.html')) {
        Write-Host "==> 构建前端" -ForegroundColor Cyan
        npm --prefix web run build
    }
    else {
        Write-Host "==> 前端产物已存在，跳过构建（如需重建请删除 web/dist）" -ForegroundColor DarkGray
    }

    Write-Host "==> 准备示例数据" -ForegroundColor Cyan
    node server/src/seed.js

    Write-Host "==> 启动服务（生产模式，单端口 3001）" -ForegroundColor Cyan
    $env:NODE_ENV = 'production'
    node server/src/index.js
}
finally {
    Pop-Location
}
