param(
  [ValidateSet("start", "stop", "reset", "status", "env")]
  [string]$Action = "start",
  [string]$EnvFile = ".env.local"
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

function Ensure-SupabaseProject {
  $configPath = Join-Path $RepoRoot "supabase/config.toml"
  if (Test-Path $configPath) {
    return
  }

  Write-Host "[supabase-local] supabase/config.toml missing. Running supabase init..." -ForegroundColor Cyan
  & supabase init
}

function Parse-StatusEnvOutput {
  param([string[]]$Lines)

  $map = @{}
  foreach ($line in $Lines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }

    $eqIndex = $trimmed.IndexOf("=")
    if ($eqIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $eqIndex).Trim()
    $value = $trimmed.Substring($eqIndex + 1).Trim()
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $map[$key] = $value
    }
  }

  return $map
}

function Get-LocalSupabaseRuntimeValues {
  $output = @()
  try {
    $output = & supabase status -o env 2>$null
  } catch {
    throw "Failed to query local Supabase status. Run 'supabase start' first."
  }

  $map = Parse-StatusEnvOutput -Lines $output
  if (-not $map.ContainsKey("API_URL") -or -not $map.ContainsKey("ANON_KEY") -or -not $map.ContainsKey("SERVICE_ROLE_KEY")) {
    throw "Supabase status did not provide API_URL / ANON_KEY / SERVICE_ROLE_KEY. Ensure the local stack is running."
  }

  return [ordered]@{
    NEXT_PUBLIC_SUPABASE_URL      = [string]$map["API_URL"]
    NEXT_PUBLIC_SUPABASE_ANON_KEY = [string]$map["ANON_KEY"]
    SUPABASE_SERVICE_ROLE_KEY     = [string]$map["SERVICE_ROLE_KEY"]
  }
}

function Upsert-EnvFile {
  param(
    [string]$Path,
    [hashtable]$Updates
  )

  $fullPath = if ([System.IO.Path]::IsPathRooted($Path)) {
    $Path
  } else {
    Join-Path $RepoRoot $Path
  }

  $existing = @()
  if (Test-Path $fullPath) {
    $existing = Get-Content $fullPath
  }

  $updateKeys = @($Updates.Keys)
  $filtered = New-Object System.Collections.Generic.List[string]
  foreach ($line in $existing) {
    $eqIndex = $line.IndexOf("=")
    if ($eqIndex -gt 0) {
      $key = $line.Substring(0, $eqIndex).Trim()
      if ($updateKeys -contains $key) {
        continue
      }
    }
    $filtered.Add($line)
  }

  if ($filtered.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($filtered[$filtered.Count - 1])) {
    $filtered.Add("")
  }

  $filtered.Add("# Local Supabase (managed by scripts/supabase-local.ps1)")
  foreach ($key in $updateKeys) {
    $filtered.Add("$key=$($Updates[$key])")
  }

  Set-Content -Path $fullPath -Value $filtered -Encoding utf8
  Write-Host "[supabase-local] Updated $Path with local Supabase connection values." -ForegroundColor Green
}

Push-Location $RepoRoot
try {
  Require-Command "supabase"

  switch ($Action) {
    "start" {
      Require-Command "docker"
      Ensure-SupabaseProject
      Write-Host "[supabase-local] Starting local Supabase services..." -ForegroundColor Cyan
      & supabase start
      $updates = Get-LocalSupabaseRuntimeValues
      Upsert-EnvFile -Path $EnvFile -Updates $updates
      Write-Host "[supabase-local] Local Supabase is ready." -ForegroundColor Green
    }
    "stop" {
      Write-Host "[supabase-local] Stopping local Supabase services..." -ForegroundColor Cyan
      & supabase stop
    }
    "reset" {
      Require-Command "docker"
      Ensure-SupabaseProject
      Write-Host "[supabase-local] Resetting local DB and applying migrations..." -ForegroundColor Cyan
      & supabase db reset --local
      $updates = Get-LocalSupabaseRuntimeValues
      Upsert-EnvFile -Path $EnvFile -Updates $updates
      Write-Host "[supabase-local] Local schema reset complete." -ForegroundColor Green
    }
    "status" {
      & supabase status
    }
    "env" {
      $updates = Get-LocalSupabaseRuntimeValues
      Upsert-EnvFile -Path $EnvFile -Updates $updates
    }
  }
} finally {
  Pop-Location
}
