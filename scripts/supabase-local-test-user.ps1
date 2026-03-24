param(
  [string]$EnvFile = ".env.local",
  [string]$Email = "smoke.local@example.com",
  [string]$Password = "LocalSmoke123!"
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

function Get-ConfigValue {
  param(
    [hashtable]$Map,
    [string]$Key
  )

  $envValue = [Environment]::GetEnvironmentVariable($Key)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    return $envValue
  }

  if ($Map.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace([string]$Map[$Key])) {
    return [string]$Map[$Key]
  }

  return $null
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

  $filtered.Add("# Local Supabase smoke-auth user (managed by scripts/supabase-local-test-user.ps1)")
  foreach ($key in $updateKeys) {
    $filtered.Add("$key=$($Updates[$key])")
  }

  Set-Content -Path $fullPath -Value $filtered -Encoding utf8
}

function Invoke-SupabaseJson {
  param(
    [string]$Url,
    [string]$Method,
    [hashtable]$Headers,
    [hashtable]$Body
  )

  return Invoke-RestMethod -Uri $Url -Method $Method -Headers $Headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Compress)
}

Push-Location $RepoRoot
try {
  $envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $RepoRoot $EnvFile }
  $envMap = Load-DotEnvMap -Path $envPath

  $supabaseUrl = Get-ConfigValue -Map $envMap -Key "NEXT_PUBLIC_SUPABASE_URL"
  $anonKey = Get-ConfigValue -Map $envMap -Key "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  $serviceRoleKey = Get-ConfigValue -Map $envMap -Key "SUPABASE_SERVICE_ROLE_KEY"

  if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or [string]::IsNullOrWhiteSpace($anonKey) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    throw "Missing local Supabase env keys. Run 'pnpm supabase:local:start' first."
  }

  $base = $supabaseUrl.TrimEnd("/")

  # Create/ensure user using admin API.
  $createUserUrl = "$base/auth/v1/admin/users"
  $adminHeaders = @{
    apikey        = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
  }

  try {
    $null = Invoke-SupabaseJson -Url $createUserUrl -Method "POST" -Headers $adminHeaders -Body @{
      email         = $Email
      password      = $Password
      email_confirm = $true
    }
    Write-Host "[supabase-local-test-user] Created user $Email" -ForegroundColor Green
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "already" -or $msg -match "registered" -or $msg -match "exists" -or $msg -match "422") {
      Write-Host "[supabase-local-test-user] User already exists, continuing." -ForegroundColor Yellow
    } else {
      throw
    }
  }

  # Get access token via password grant for smoke-auth.
  $tokenUrl = "$base/auth/v1/token?grant_type=password"
  $tokenHeaders = @{
    apikey        = $anonKey
    Authorization = "Bearer $anonKey"
  }
  $tokenResponse = Invoke-SupabaseJson -Url $tokenUrl -Method "POST" -Headers $tokenHeaders -Body @{
    email    = $Email
    password = $Password
  }

  if ([string]::IsNullOrWhiteSpace([string]$tokenResponse.access_token)) {
    throw "Failed to fetch access token for test user."
  }

  $updates = [ordered]@{
    SUPABASE_EMAIL_TEST_USER     = $Email
    SUPABASE_EMAIL_TEST_PASSWORD = $Password
    TEST_SUPABASE_BEARER_TOKEN   = [string]$tokenResponse.access_token
  }
  Upsert-EnvFile -Path $envPath -Updates $updates

  Write-Host "[supabase-local-test-user] Updated $EnvFile with smoke-auth credentials and bearer token." -ForegroundColor Green
  Write-Host "[supabase-local-test-user] You can now run: pnpm smoke:auth:skipbuild" -ForegroundColor Cyan
} finally {
  Pop-Location
}
