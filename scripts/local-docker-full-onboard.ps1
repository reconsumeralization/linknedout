param(
  [string]$EnvFile = ".env.local",
  [switch]$SkipSupabase,
  [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install it, then rerun this script."
  }
}

function Test-CommandAvailable {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Step {
  param(
    [string]$Description,
    [scriptblock]$Action
  )

  Write-Host "[local-docker-full-onboard] $Description" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Load-DotEnvMap {
  param([string]$Path)

  $map = @{}
  if (!(Test-Path $Path)) {
    return $map
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) {
      return
    }
    $eqIndex = $line.IndexOf("=")
    if ($eqIndex -lt 1) {
      return
    }
    $key = $line.Substring(0, $eqIndex).Trim()
    $value = $line.Substring($eqIndex + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($key) {
      $map[$key] = $value
    }
  }

  return $map
}

function Get-EnvValue {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  if ($Map.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace([string]$Map[$Key])) {
    return [string]$Map[$Key]
  }
  return "<unset>"
}

function Get-RunningComposeServices {
  $services = @()
  try {
    $services = & docker compose ps --status running --services 2>$null
    if ($LASTEXITCODE -ne 0) {
      return @()
    }
  } catch {
    return @()
  }

  return @($services | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Confirm-DockerDaemon {
  try {
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "docker info failed."
    }
  } catch {
    throw "Docker daemon is not reachable. Start Docker Desktop and rerun this script."
  }
}

function Is-NonEmptyString {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Write-PreflightStatus {
  param(
    [string]$Label,
    [bool]$Passed,
    [string]$SuccessText = "ok",
    [string]$FailText = "missing"
  )

  if ($Passed) {
    Write-Host "  [ok]  $Label - $SuccessText" -ForegroundColor Green
  } else {
    Write-Host "  [err] $Label - $FailText" -ForegroundColor Red
  }
}

Push-Location $RepoRoot
try {
  Write-Host "[local-docker-full-onboard] Ensuring .env.local exists..." -ForegroundColor Cyan
  if (-not (Test-Path $EnvFile)) {
    if (Test-Path ".env.example") {
      Copy-Item ".env.example" $EnvFile -Force
      Write-Host "[local-docker-full-onboard] Copied .env.example -> $EnvFile" -ForegroundColor Green
    } else {
      throw "Missing .env.local and .env.example. Create one before running this script."
    }
  }

  $preEnvPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile
  } else {
    Join-Path $RepoRoot $EnvFile
  }
  $preEnvMap = Load-DotEnvMap -Path $preEnvPath
  $requiresDocker = (-not $SkipDocker) -or (-not $SkipSupabase)

  $pnpmAvailable = Test-CommandAvailable "pnpm"
  $supabaseAvailable = $SkipSupabase -or (Test-CommandAvailable "supabase")
  $dockerAvailable = (-not $requiresDocker) -or (Test-CommandAvailable "docker")
  $dockerReachable = $true
  if ($requiresDocker) {
    if ($dockerAvailable) {
      try {
        Confirm-DockerDaemon
        $dockerReachable = $true
      } catch {
        $dockerReachable = $false
      }
    } else {
      $dockerReachable = $false
    }
  }
  $postgresFromEnv = Is-NonEmptyString -Value $env:POSTGRES_PASSWORD
  $postgresFromFile = $preEnvMap.ContainsKey("POSTGRES_PASSWORD") -and (Is-NonEmptyString -Value ([string]$preEnvMap["POSTGRES_PASSWORD"]))
  $postgresAvailable = $SkipDocker -or $postgresFromEnv -or $postgresFromFile

  Write-Host "[local-docker-full-onboard] Preflight summary:" -ForegroundColor Cyan
  Write-PreflightStatus -Label "pnpm" -Passed $pnpmAvailable -SuccessText "available" -FailText "not found on PATH"
  if (-not $SkipSupabase) {
    Write-PreflightStatus -Label "supabase" -Passed $supabaseAvailable -SuccessText "available" -FailText "not found on PATH"
  } else {
    Write-Host "  [skip] supabase - skipped by -SkipSupabase" -ForegroundColor DarkYellow
  }
  if ($requiresDocker) {
    Write-PreflightStatus -Label "docker" -Passed $dockerAvailable -SuccessText "available" -FailText "not found on PATH"
    Write-PreflightStatus -Label "docker daemon" -Passed $dockerReachable -SuccessText "reachable" -FailText "not reachable"
  } else {
    Write-Host "  [skip] docker - skipped by flags" -ForegroundColor DarkYellow
  }
  if (-not $SkipDocker) {
    Write-PreflightStatus -Label "POSTGRES_PASSWORD" -Passed $postgresAvailable -SuccessText "set (env or .env.local)" -FailText "missing (env and .env.local)"
  } else {
    Write-Host "  [skip] POSTGRES_PASSWORD - Docker onboarding skipped" -ForegroundColor DarkYellow
  }

  if (-not $pnpmAvailable) {
    throw "Required command 'pnpm' was not found. Install it, then rerun this script."
  }
  if (-not $supabaseAvailable) {
    throw "Required command 'supabase' was not found. Install it, then rerun this script."
  }
  if ($requiresDocker -and (-not $dockerAvailable)) {
    throw "Required command 'docker' was not found. Install it, then rerun this script."
  }
  if ($requiresDocker -and (-not $dockerReachable)) {
    throw "Docker daemon is not reachable. Start Docker Desktop and rerun this script."
  }
  if ((-not $SkipDocker) -and (-not $postgresAvailable)) {
    throw "POSTGRES_PASSWORD is missing. Set it in host env or .env.local before docker onboarding."
  }

  if ([string]::IsNullOrWhiteSpace($env:POSTGRES_PASSWORD)) {
    $filePostgresPassword = Get-EnvValue -Map $preEnvMap -Key "POSTGRES_PASSWORD"
    if ($filePostgresPassword -ne "<unset>") {
      $env:POSTGRES_PASSWORD = $filePostgresPassword
      Write-Host "[local-docker-full-onboard] Exported POSTGRES_PASSWORD from $EnvFile for docker compose." -ForegroundColor Green
    }
  }

  if (-not $SkipSupabase) {
    Invoke-Step -Description "Starting local Supabase stack via Supabase CLI..." -Action { pnpm supabase:local:start }
    Invoke-Step -Description "Resetting local Supabase DB and applying migrations..." -Action { pnpm supabase:local:reset }
    Invoke-Step -Description "Creating smoke-auth test user and bearer token..." -Action { pnpm supabase:local:test-user }
  } else {
    Write-Host "[local-docker-full-onboard] Skipping Supabase start/reset/test-user steps (-SkipSupabase)." -ForegroundColor DarkYellow
  }

  if (-not $SkipDocker) {
    Invoke-Step -Description "Starting Docker stack (app + db + security-cron) and waiting for healthchecks..." -Action { pnpm docker:onboard }
  } else {
    Write-Host "[local-docker-full-onboard] Skipping Docker onboarding step (-SkipDocker)." -ForegroundColor DarkYellow
  }

  $fullEnvPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile
  } else {
    Join-Path $RepoRoot $EnvFile
  }
  $envMap = Load-DotEnvMap -Path $fullEnvPath

  $supabaseUrl = Get-EnvValue -Map $envMap -Key "NEXT_PUBLIC_SUPABASE_URL"
  $testUser = Get-EnvValue -Map $envMap -Key "SUPABASE_EMAIL_TEST_USER"

  $supabaseStatus = "skipped"
  if (-not $SkipSupabase) {
    $supabaseStatus = "unknown"
    try {
      & supabase status *> $null
      $supabaseStatus = if ($LASTEXITCODE -eq 0) { "running" } else { "not-running" }
    } catch {
      $supabaseStatus = "not-running"
    }
  }

  Write-Host ""
  Write-Host "[local-docker-full-onboard] Completed requested onboarding steps." -ForegroundColor Green
  Write-Host "  - Supabase status: $supabaseStatus" -ForegroundColor Yellow
  Write-Host "  - NEXT_PUBLIC_SUPABASE_URL: $supabaseUrl" -ForegroundColor Yellow

  if (-not $SkipDocker) {
    $dockerServices = Get-RunningComposeServices
    $requiredServices = @("app", "db", "security-cron")
    $missingServices = @($requiredServices | Where-Object { $dockerServices -notcontains $_ })

    if ($missingServices.Count -eq 0) {
      Write-Host "  - Docker services running: $($requiredServices -join ', ')" -ForegroundColor Yellow
    } else {
      Write-Host "  - Docker services running: $($dockerServices -join ', ')" -ForegroundColor Yellow
      Write-Warning "[local-docker-full-onboard] Missing expected running services: $($missingServices -join ', ')"
    }
  } else {
    Write-Host "  - Docker status: skipped (-SkipDocker)" -ForegroundColor Yellow
  }

  Write-Host "  - Test user in ${EnvFile}: $testUser" -ForegroundColor Yellow
  Write-Host "  - Credentials keys in ${EnvFile}: SUPABASE_EMAIL_TEST_USER, SUPABASE_EMAIL_TEST_PASSWORD, TEST_SUPABASE_BEARER_TOKEN" -ForegroundColor Yellow
  Write-Host "  - App URL: http://127.0.0.1:3000" -ForegroundColor Yellow
} finally {
  Pop-Location
}
