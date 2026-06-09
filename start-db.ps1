# PowerShell script to start the local PostgreSQL 16 server
$pgBin = "C:\Users\Administrator\pgsql\bin"
$pgData = "C:\Users\Administrator\pgsql\data"
$logFile = "C:\Users\Administrator\pgsql\data\server.log"

if (-not (Test-Path "$pgData")) {
    Write-Host "Initializing PostgreSQL data directory..."
    & "$pgBin\initdb.exe" -D "$pgData" -U belle -A trust -E UTF8 --no-locale
}

Write-Host "Starting PostgreSQL on localhost:5432..."
Start-Process "$pgBin\postgres.exe" -ArgumentList "-D `"$pgData`"" -WindowStyle Hidden
Start-Sleep -Seconds 2

if (Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue) {
    Write-Host "PostgreSQL is running on localhost:5432" -ForegroundColor Green
} else {
    Write-Host "Failed to start PostgreSQL. Check $logFile" -ForegroundColor Red
}
