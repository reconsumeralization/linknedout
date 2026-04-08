#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy current repo to Vercel production (requires one-time login).

.EXAMPLE
  $env:VERCEL_TOKEN = "..."   # optional; or rely on `vercel login` cache
  .\scripts\vercel-prod-deploy.ps1
#>
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Error "npx not found. Install Node.js and pnpm first."
}

if ($env:VERCEL_TOKEN) {
  npx --yes vercel deploy --prod --yes --token $env:VERCEL_TOKEN
} else {
  npx --yes vercel deploy --prod --yes
}
