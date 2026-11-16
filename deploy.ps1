<#
  ClipMill one-click deployment for Windows (Docker Desktop).

    .\deploy.ps1                 build and start on port 8080
    $env:CLIPMILL_PORT=9000; .\deploy.ps1
    .\deploy.ps1 -Action down    stop and remove
    .\deploy.ps1 -Action logs    follow logs
#>
param(
  [ValidateSet("up", "down", "logs")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Port = if ($env:CLIPMILL_PORT) { $env:CLIPMILL_PORT } else { "8080" }
$Name = "clipmill"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "未找到 docker，请先安装 Docker Desktop。" -ForegroundColor Red
  exit 1
}

switch ($Action) {
  "down" {
    docker rm -f $Name 2>$null | Out-Null
    Write-Host "ClipMill 已停止。"
  }
  "logs" {
    docker logs -f $Name
  }
  default {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
      Write-Host "docker compose 不可用，改用 docker build / run。" -ForegroundColor Yellow
      docker build -t clipmill:latest .
      docker rm -f $Name 2>$null | Out-Null
      docker run -d --name $Name --restart unless-stopped -p "${Port}:80" clipmill:latest
    }
    Write-Host ""
    Write-Host "ClipMill 已启动：http://localhost:$Port" -ForegroundColor Green
    Write-Host "提示：导出视频依赖 WebCodecs，请通过 HTTPS 或 localhost 访问。"
  }
}
