# branded-supabase-doctor.ps1
# Validates the branded self-hosted Supabase setup and can sync app env vars.

[CmdletBinding()]
param(
  [string]$BrandedDir,
  [string]$AppEnvPath,
  [switch]$SyncAppEnv,
  [switch]$SkipDockerChecks
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $BrandedDir) {
  $BrandedDir = Join-Path $RepoRoot "branded-supabase"
}
if (-not $AppEnvPath) {
  $AppEnvPath = Join-Path $RepoRoot ".env.local"
}

$ComposePath = Join-Path $BrandedDir "docker-compose.yml"
$BrandedEnvPath = Join-Path $BrandedDir ".env"

$RequiredVars = @(
  "POSTGRES_PASSWORD",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "DASHBOARD_PASSWORD",
  "SITE_URL",
  "API_EXTERNAL_URL",
  "SUPABASE_PUBLIC_URL"
)

$SecretVars = @(
  "POSTGRES_PASSWORD",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "DASHBOARD_PASSWORD"
)

$UrlVars = @(
  "SITE_URL",
  "API_EXTERNAL_URL",
  "SUPABASE_PUBLIC_URL"
)

$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]
$Passes = New-Object System.Collections.Generic.List[string]

function Add-Pass {
  param([string]$Message)
  $Passes.Add($Message) | Out-Null
}

function Add-Warning {
  param([string]$Message)
  $Warnings.Add($Message) | Out-Null
}

function Add-Failure {
  param([string]$Message)
  $Failures.Add($Message) | Out-Null
}

function Ensure-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Read-DotEnvFile {
  param([string]$Path)

  $values = [ordered]@{}
  $invalidLines = New-Object System.Collections.Generic.List[string]

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(#.*)?$') {
      continue
    }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $invalidLines.Add($line) | Out-Null
      continue
    }

    $key = $Matches[1]
    $value = $Matches[2]
    if (
      $value.Length -ge 2 -and
      (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      )
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return @{
    Values = $values
    InvalidLines = $invalidLines
  }
}

function Test-AbsoluteHttpUrl {
  param([string]$Value)

  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
    return $false
  }
  return $uri.Scheme -in @("http", "https")
}

function Test-PlaceholderSecret {
  param(
    [string]$Name,
    [string]$Value
  )

  if (-not $Value) {
    return $true
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  if ($normalized -match '^(change-me|changeme|replace-me|replace_this|placeholder|your-|<.+>|example|todo)') {
    return $true
  }

  if ($Name -eq "POSTGRES_PASSWORD" -and $normalized -like "*change-me*") {
    return $true
  }

  if ($Name -in @("ANON_KEY", "SERVICE_ROLE_KEY") -and $normalized -like "your-*") {
    return $true
  }

  if ($Name -eq "JWT_SECRET" -and $normalized -like "your-*") {
    return $true
  }

  return $false
}

function Update-DotEnvFile {
  param(
    [string]$Path,
    [hashtable]$Updates
  )

  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $Path) {
    foreach ($line in Get-Content -LiteralPath $Path) {
      $lines.Add($line) | Out-Null
    }
  }

  foreach ($entry in $Updates.GetEnumerator()) {
    $pattern = '^\s*' + [regex]::Escape($entry.Key) + '\s*='
    $replacement = "{0}={1}" -f $entry.Key, $entry.Value
    $replaced = $false

    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index] -match $pattern) {
        $lines[$index] = $replacement
        $replaced = $true
        break
      }
    }

    if (-not $replaced) {
      if ($lines.Count -gt 0 -and $lines[$lines.Count - 1].Trim() -ne "") {
        $lines.Add("") | Out-Null
      }
      $lines.Add($replacement) | Out-Null
    }
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding utf8
}

Write-Host "[branded-supabase] Doctor started" -ForegroundColor Cyan
Write-Host "  Supabase dir: $BrandedDir" -ForegroundColor DarkGray
Write-Host "  App env:      $AppEnvPath" -ForegroundColor DarkGray

if (-not (Test-Path -LiteralPath $BrandedDir)) {
  Add-Failure("Missing branded Supabase directory: $BrandedDir")
}
if (-not (Test-Path -LiteralPath $ComposePath)) {
  Add-Failure("Missing docker-compose.yml in $BrandedDir. Run .\\scripts\\branded-supabase-setup.ps1 first.")
}
if (-not (Test-Path -LiteralPath $BrandedEnvPath)) {
  Add-Failure("Missing $BrandedEnvPath. Copy .env.example to .env and fill in real secrets.")
}

if ($Failures.Count -gt 0) {
  foreach ($message in $Failures) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
  }
  exit 1
}

$brandedEnvResult = Read-DotEnvFile -Path $BrandedEnvPath
$brandedEnv = $brandedEnvResult.Values
if ($brandedEnvResult.InvalidLines.Count -gt 0) {
  Add-Warning("Ignored non KEY=VALUE lines in branded .env: $($brandedEnvResult.InvalidLines.Count)")
}

foreach ($name in $RequiredVars) {
  $value = if ($brandedEnv.Contains($name)) { [string]$brandedEnv[$name] } else { "" }
  if ([string]::IsNullOrWhiteSpace($value)) {
    Add-Failure("Missing required branded Supabase variable: $name")
    continue
  }

  if ($SecretVars -contains $name -and (Test-PlaceholderSecret -Name $name -Value $value)) {
    Add-Failure("$name still looks like a placeholder value.")
    continue
  }

  if ($UrlVars -contains $name -and -not (Test-AbsoluteHttpUrl -Value $value)) {
    Add-Failure("$name must be an absolute http/https URL. Current value: $value")
    continue
  }
}

if ($brandedEnv.Contains("ANON_KEY") -and $brandedEnv.Contains("SERVICE_ROLE_KEY")) {
  if ($brandedEnv["ANON_KEY"] -eq $brandedEnv["SERVICE_ROLE_KEY"]) {
    Add-Failure("ANON_KEY and SERVICE_ROLE_KEY must not be identical.")
  }
}

if ($brandedEnv.Contains("JWT_SECRET")) {
  $jwtSecret = [string]$brandedEnv["JWT_SECRET"]
  if ($jwtSecret.Length -lt 32) {
    Add-Warning("JWT_SECRET is shorter than 32 characters.")
  }
}

if ($brandedEnv.Contains("POSTGRES_PASSWORD")) {
  $postgresPassword = [string]$brandedEnv["POSTGRES_PASSWORD"]
  if ($postgresPassword.Length -lt 16) {
    Add-Warning("POSTGRES_PASSWORD is shorter than 16 characters.")
  }
}

if ($brandedEnv.Contains("DASHBOARD_PASSWORD")) {
  $dashboardPassword = [string]$brandedEnv["DASHBOARD_PASSWORD"]
  if ($dashboardPassword.Length -lt 12) {
    Add-Warning("DASHBOARD_PASSWORD is shorter than 12 characters.")
  }
  if ($dashboardPassword -notmatch '[A-Za-z]' -or $dashboardPassword -notmatch '[0-9]') {
    Add-Warning("DASHBOARD_PASSWORD should include both letters and numbers.")
  }
}

if ($brandedEnv.Contains("ANON_KEY")) {
  $anonParts = ([string]$brandedEnv["ANON_KEY"]).Split(".")
  if ($anonParts.Count -ne 3) {
    Add-Warning("ANON_KEY does not look like a JWT. Recheck the generated key.")
  }
}

if ($brandedEnv.Contains("SERVICE_ROLE_KEY")) {
  $serviceParts = ([string]$brandedEnv["SERVICE_ROLE_KEY"]).Split(".")
  if ($serviceParts.Count -ne 3) {
    Add-Warning("SERVICE_ROLE_KEY does not look like a JWT. Recheck the generated key.")
  }
}

if (
  $brandedEnv.Contains("API_EXTERNAL_URL") -and
  $brandedEnv.Contains("SUPABASE_PUBLIC_URL") -and
  [string]$brandedEnv["API_EXTERNAL_URL"] -ne [string]$brandedEnv["SUPABASE_PUBLIC_URL"]
) {
  Add-Warning("API_EXTERNAL_URL and SUPABASE_PUBLIC_URL differ. Most local installs should keep these aligned.")
}

$desiredPublicUrl = if ($brandedEnv.Contains("SUPABASE_PUBLIC_URL")) {
  [string]$brandedEnv["SUPABASE_PUBLIC_URL"]
} else {
  [string]$brandedEnv["API_EXTERNAL_URL"]
}

$desiredAppValues = [ordered]@{
  NEXT_PUBLIC_SUPABASE_URL = $desiredPublicUrl
  NEXT_PUBLIC_SUPABASE_ANON_KEY = [string]$brandedEnv["ANON_KEY"]
  NEXT_PUBLIC_APP_URL = [string]$brandedEnv["SITE_URL"]
}

$appEnv = [ordered]@{}
if (Test-Path -LiteralPath $AppEnvPath) {
  $appEnv = (Read-DotEnvFile -Path $AppEnvPath).Values
}

$appDiffs = New-Object System.Collections.Generic.List[string]
foreach ($entry in $desiredAppValues.GetEnumerator()) {
  $currentValue = if ($appEnv.Contains($entry.Key)) { [string]$appEnv[$entry.Key] } else { "" }
  if ($currentValue -ne $entry.Value) {
    $appDiffs.Add($entry.Key) | Out-Null
  }
}

if ($appDiffs.Count -eq 0) {
  Add-Pass("App env already matches branded Supabase URL/key settings.")
} elseif ($SyncAppEnv) {
  Update-DotEnvFile -Path $AppEnvPath -Updates $desiredAppValues
  Add-Pass("Updated app env with branded Supabase URL, anon key, and app URL.")
} else {
  Add-Warning("App env is out of sync for: $($appDiffs -join ', '). Run pnpm supabase:branded:sync-env to update .env.local.")
}

if ($appEnv.Contains("CORS_ALLOWED_ORIGIN")) {
  $corsOrigin = [string]$appEnv["CORS_ALLOWED_ORIGIN"]
  if ($corsOrigin -and $corsOrigin -ne [string]$brandedEnv["SITE_URL"]) {
    Add-Warning("CORS_ALLOWED_ORIGIN differs from SITE_URL. Ensure this is intentional.")
  }
} else {
  Add-Warning("CORS_ALLOWED_ORIGIN is not set in app env. Set it to SITE_URL for stricter protected API CORS.")
}

if (-not $SkipDockerChecks) {
  if (-not (Ensure-Command "docker")) {
    Add-Warning("Docker is not installed or not on PATH, so compose validation was skipped.")
  } else {
    Push-Location $BrandedDir
    try {
      try {
        & docker compose config -q | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Add-Pass("docker compose config validation passed.")
        } else {
          Add-Failure("docker compose config validation failed.")
        }
      } catch {
        Add-Failure("docker compose config validation failed: $($_.Exception.Message)")
      }

      try {
        $runningServices = @(& docker compose ps --services --status running 2>$null)
        if ($LASTEXITCODE -eq 0) {
          if ($runningServices.Count -gt 0) {
            Add-Pass("Running containers detected: $($runningServices -join ', ')")
          } else {
            Add-Warning("No running branded Supabase containers detected yet. Start them with docker compose up -d.")
          }
        } else {
          Add-Warning("Could not inspect running compose services. Start Docker Desktop or the daemon if you want runtime checks.")
        }
      } catch {
        Add-Warning("Could not inspect running compose services: $($_.Exception.Message)")
      }
    } finally {
      Pop-Location
    }
  }
}

foreach ($message in $Passes) {
  Write-Host "[OK]   $message" -ForegroundColor Green
}
foreach ($message in $Warnings) {
  Write-Host "[WARN] $message" -ForegroundColor Yellow
}
foreach ($message in $Failures) {
  Write-Host "[FAIL] $message" -ForegroundColor Red
}

Write-Host ""
Write-Host "[branded-supabase] Summary" -ForegroundColor Cyan
Write-Host "  Passes:   $($Passes.Count)" -ForegroundColor Green
Write-Host "  Warnings: $($Warnings.Count)" -ForegroundColor Yellow
Write-Host "  Failures: $($Failures.Count)" -ForegroundColor Red

if ($Failures.Count -gt 0) {
  exit 1
}

exit 0
