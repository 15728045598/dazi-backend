# 本地 Windows + MySQL 8.4 一键初始化
# 用法: cd backend 后执行: powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-windows.ps1
$ErrorActionPreference = "Stop"
$MysqlBin = "C:\Program Files\MySQL\MySQL Server 8.4\bin"
if (-not (Test-Path "$MysqlBin\mysql.exe")) {
  Write-Host "未找到 $MysqlBin\mysql.exe，请修改脚本中的 MySQL 安装路径。"
  exit 1
}
$mysql = "$MysqlBin\mysql.exe"

Write-Host "创建数据库与用户 dazai ..."
& $mysql -u root -e "CREATE DATABASE IF NOT EXISTS dazai_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
& $mysql -u root -e "CREATE USER IF NOT EXISTS 'dazai'@'localhost' IDENTIFIED BY 'dazai_pass_2024';"
& $mysql -u root -e "GRANT ALL PRIVILEGES ON dazai_prod.* TO 'dazai'@'localhost'; FLUSH PRIVILEGES;"

$backendRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $backendRoot

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "已从 .env.example 复制 .env，请检查 DATABASE_URL。"
}

Write-Host "执行 Prisma 迁移与种子..."
npx prisma migrate deploy
npx prisma db seed
Write-Host "完成。启动后端: npm run start:dev"
