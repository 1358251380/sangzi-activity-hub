# 跑完全部测试 + 自检
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    node scripts/verify.mjs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
