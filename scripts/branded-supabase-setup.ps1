# branded-supabase-setup.ps1
# Populates branded-supabase/ with the official Supabase Docker self-hosting setup.
# Run from the LinkedOut repo root: .\scripts\branded-supabase-setup.ps1

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BrandedDir = Join-Path $RepoRoot "branded-supabase"
$CloneDir = Join-Path $RepoRoot "supabase-docker-clone"

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install it, then rerun this script."
  }
}

function Get-CloneDefaultBranch {
  param([string]$RepositoryPath)

  Push-Location $RepositoryPath
  try {
    $originHead = git symbolic-ref --quiet refs/remotes/origin/HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $originHead) {
      return Split-Path -Leaf $originHead.Trim()
    }
  } finally {
    Pop-Location
  }

  return "master"
}

function Copy-DirectoryContents {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  Get-ChildItem -LiteralPath $SourcePath -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $DestinationPath -Recurse -Force
  }
}

Write-Host "[branded-supabase] Setting up branded Supabase in: $BrandedDir" -ForegroundColor Cyan

Ensure-Command "git"
Ensure-Command "docker"

# Clone Supabase repo (docker folder only via sparse checkout)
if (Test-Path $CloneDir) {
  Write-Host "[branded-supabase] Using existing clone at $CloneDir" -ForegroundColor Yellow
  Push-Location $CloneDir
  try {
    git fetch origin
    $DefaultBranch = Get-CloneDefaultBranch -RepositoryPath $CloneDir
    git checkout $DefaultBranch
    git pull --ff-only
  } finally {
    Pop-Location
  }
} else {
  Write-Host "[branded-supabase] Cloning Supabase (docker only)..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $CloneDir -Force | Out-Null
  git clone --filter=blob:none --no-checkout https://github.com/supabase/supabase $CloneDir
  Push-Location $CloneDir
  try {
    git sparse-checkout set --cone docker
    $DefaultBranch = Get-CloneDefaultBranch -RepositoryPath $CloneDir
    git checkout $DefaultBranch
  } finally {
    Pop-Location
  }
}

$DockerSrc = Join-Path $CloneDir "docker"
if (-not (Test-Path $DockerSrc)) {
  throw "Expected directory not found: $DockerSrc. Clone may have failed."
}

# Create branded-supabase and copy official docker files
if (-not (Test-Path $BrandedDir)) {
  New-Item -ItemType Directory -Path $BrandedDir -Force | Out-Null
}

Write-Host "[branded-supabase] Copying Docker setup to $BrandedDir..." -ForegroundColor Cyan
Copy-DirectoryContents -SourcePath $DockerSrc -DestinationPath $BrandedDir

# Copy .env.example to .env if .env doesn't exist
$EnvExample = Join-Path $BrandedDir ".env.example"
$EnvDest = Join-Path $BrandedDir ".env"
if (Test-Path $EnvExample) {
  if (-not (Test-Path $EnvDest)) {
    Copy-Item -Path $EnvExample -Destination $EnvDest -Force
    Write-Host "[branded-supabase] Created .env from .env.example. Edit branded-supabase\.env and set all secrets before 'docker compose up'." -ForegroundColor Green
  } else {
    Write-Host "[branded-supabase] .env already exists; leaving it unchanged." -ForegroundColor Yellow
  }
} else {
  throw "[branded-supabase] Missing $EnvExample after copying Docker files. Check the upstream docker directory layout and rerun the setup."
}

Write-Host "[branded-supabase] Done. Next steps:" -ForegroundColor Green
Write-Host "  1. cd branded-supabase" -ForegroundColor White
Write-Host "  2. Edit .env: set POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET, DASHBOARD_PASSWORD, and URLs (SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL)." -ForegroundColor White
Write-Host "  3. From the repo root, run: pnpm supabase:branded:doctor" -ForegroundColor White
Write-Host "  4. If the doctor output looks good, start Supabase: docker compose up -d" -ForegroundColor White
Write-Host "  5. Back at the repo root, run: pnpm supabase:branded:sync-env" -ForegroundColor White
Write-Host "  6. Run LinkedOut with pnpm dev after the app .env.local is synced." -ForegroundColor White
Write-Host "See branded-supabase\README.md and docs\branded-supabase-self-host.md for full guide." -ForegroundColor Gray
