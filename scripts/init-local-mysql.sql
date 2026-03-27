-- 本地 MySQL 8.4 初始化（搭子项目）
-- 建议在命令行执行（PowerShell 可用下方 scripts 目录里的 ps1）
CREATE DATABASE IF NOT EXISTS dazai_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dazai'@'localhost' IDENTIFIED BY 'dazai_pass_2024';
GRANT ALL PRIVILEGES ON dazai_prod.* TO 'dazai'@'localhost';
FLUSH PRIVILEGES;
