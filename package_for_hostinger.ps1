Write-Host "Packaging WebCheck for Hostinger..." -ForegroundColor Cyan
php (Join-Path $PSScriptRoot "build_hostinger_zip.php")
