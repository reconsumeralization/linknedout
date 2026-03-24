param(
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot

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

function Test-CommandAvailable {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
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

function Is-NonEmptyString {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

Push-Location $RepoRoot
try {
  Write-Host "[docker-local-onboard] Ensuring .env.local exists..." -ForegroundColor Cyan
  if (-not (Test-Path $EnvFile)) {
    if (Test-Path ".env.example") {
      Copy-Item ".env.example" $EnvFile -Force
      Write-Host "[docker-local-onboard] Copied .env.example -> $EnvFile" -ForegroundColor Green
    } else {
      throw "Missing .env.local and .env.example. Create one before running this script."
    }
  }

  $fullEnvPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile
  } else {
    Join-Path $RepoRoot $EnvFile
  }
  $envMap = Load-DotEnvMap -Path $fullEnvPath

  $pnpmAvailable = Test-CommandAvailable "pnpm"
  $dockerAvailable = Test-CommandAvailable "docker"
  $dockerReachable = $false
  if ($dockerAvailable) {
    try {
      Confirm-DockerDaemon
      $dockerReachable = $true
    } catch {
      $dockerReachable = $false
    }
  }
  $postgresFromEnv = Is-NonEmptyString -Value $env:POSTGRES_PASSWORD
  $postgresFromFile = $envMap.ContainsKey("POSTGRES_PASSWORD") -and (Is-NonEmptyString -Value ([string]$envMap["POSTGRES_PASSWORD"]))
  $postgresAvailable = $postgresFromEnv -or $postgresFromFile

  Write-Host "[docker-local-onboard] Preflight summary:" -ForegroundColor Cyan
  Write-PreflightStatus -Label "pnpm" -Passed $pnpmAvailable -SuccessText "available" -FailText "not found on PATH"
  Write-PreflightStatus -Label "docker" -Passed $dockerAvailable -SuccessText "available" -FailText "not found on PATH"
  Write-PreflightStatus -Label "docker daemon" -Passed $dockerReachable -SuccessText "reachable" -FailText "not reachable"
  Write-PreflightStatus -Label "POSTGRES_PASSWORD" -Passed $postgresAvailable -SuccessText "set (env or .env.local)" -FailText "missing (env and .env.local)"

  if (-not $pnpmAvailable) {
    throw "Required command 'pnpm' was not found. Install it, then rerun this script."
  }
  if (-not $dockerAvailable) {
    throw "Required command 'docker' was not found. Install it, then rerun this script."
  }
  if (-not $dockerReachable) {
    throw "Docker daemon is not reachable. Start Docker Desktop and rerun this script."
  }
  if (-not $postgresAvailable) {
    throw "POSTGRES_PASSWORD is missing. Set it in host env or .env.local before docker onboarding."
  }

  if ([string]::IsNullOrWhiteSpace($env:POSTGRES_PASSWORD) -and $envMap.ContainsKey("POSTGRES_PASSWORD")) {
    $fromFile = [string]$envMap["POSTGRES_PASSWORD"]
    if (-not [string]::IsNullOrWhiteSpace($fromFile)) {
      $env:POSTGRES_PASSWORD = $fromFile
      Write-Host "[docker-local-onboard] Exported POSTGRES_PASSWORD from $EnvFile for docker compose." -ForegroundColor Green
    }
  }

  Write-Host "[docker-local-onboard] Starting Docker stack (app + db + security-cron)..." -ForegroundColor Cyan
  pnpm docker:up

  Write-Host "[docker-local-onboard] Waiting for app healthcheck to pass..." -ForegroundColor Cyan
  $maxTries = 40
  $delaySeconds = 5
  $ok = $false

  for ($i = 1; $i -le $maxTries; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
        $ok = $true
        break
      }
    } catch {
      # ignore until timeout
    }
    Start-Sleep -Seconds $delaySeconds
  }

  if (-not $ok) {
    Write-Warning "[docker-local-onboard] App did not become healthy in time, but containers are running. Check 'docker compose ps' and 'docker compose logs app'."
  } else {
    Write-Host "[docker-local-onboard] App is responding at http://127.0.0.1:3000" -ForegroundColor Green
  }

  Write-Host "" 
  Write-Host "[docker-local-onboard] Next steps:" -ForegroundColor Cyan
  Write-Host "  - Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in $EnvFile (cloud, local, or self-hosted Supabase)." -ForegroundColor Yellow
  Write-Host "  - Open your browser to http://127.0.0.1:3000 and complete login." -ForegroundColor Yellow
  Write-Host "  - security-cron is running inside Docker and will refresh security patterns on the configured interval." -ForegroundColor Yellow
} finally {
  Pop-Location
}
