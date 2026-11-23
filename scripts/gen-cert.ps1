# Generate a self-signed TLS certificate for local demo / intranet use.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\gen-cert.ps1
#   npm run cert
#   (bash users: bash scripts/gen-cert.sh)
#
# Output: deploy/nginx/certs/server.crt + server.key
# NOTE: deploy/nginx/certs/ is gitignored. Never commit the private key.
#
# This script is intentionally ASCII-only: Windows PowerShell 5.1 reads .ps1 files
# using the ANSI code page, so non-ASCII literals can break parsing on some systems.

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root 'deploy\nginx\certs'
$crt     = Join-Path $certDir 'server.crt'
$key     = Join-Path $certDir 'server.key'

# Locate openssl. On Windows it usually ships with Git for Windows.
$openssl = $null
$candidates = @()

$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    $gitRoot = Split-Path (Split-Path $git.Source -Parent) -Parent
    $candidates += (Join-Path $gitRoot 'usr\bin\openssl.exe')
}
$candidates += 'C:\Program Files\Git\usr\bin\openssl.exe'
$candidates += 'C:\Program Files\OpenSSL-Win64\bin\openssl.exe'
$onPath = Get-Command openssl -ErrorAction SilentlyContinue
if ($onPath) { $candidates += $onPath.Source }

foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $openssl = $c; break }
}

if (-not $openssl) {
    Write-Host 'ERROR: openssl not found.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Options:'
    Write-Host '  1) Install Git for Windows (bundles openssl at <Git>\usr\bin\openssl.exe)'
    Write-Host '  2) Install OpenSSL for Windows and add it to PATH'
    Write-Host '  3) Generate with Docker:'
    Write-Host '     docker run --rm -v "<repo>\deploy\nginx\certs:/certs" alpine/openssl \'
    Write-Host '       req -x509 -nodes -newkey rsa:2048 -keyout /certs/server.key \'
    Write-Host '       -out /certs/server.crt -days 365 -subj /CN=localhost'
    exit 1
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if ((Test-Path $crt) -and (Test-Path $key)) {
    Write-Host 'Certificate already exists, skipped:' -ForegroundColor Yellow
    Write-Host "  $crt"
    Write-Host "  $key"
    Write-Host 'Delete them first if you want to regenerate.'
    exit 0
}

Write-Host "Using openssl: $openssl" -ForegroundColor Cyan

# SAN entries are required for browsers/curl to accept the cert for localhost.
& $openssl req -x509 -nodes -newkey rsa:2048 `
    -keyout $key -out $crt -days 365 `
    -subj '/C=CN/ST=Local/L=Local/O=Sangzi Dev/CN=localhost' `
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $crt)) {
    Write-Host "ERROR: certificate generation failed (openssl exit code $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

Write-Host 'Certificate generated:' -ForegroundColor Green
Write-Host "  $crt"
Write-Host "  $key"
Write-Host ''
Write-Host 'This is a self-signed cert; browsers will warn about it. That is expected.'
