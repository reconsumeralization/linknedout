param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$IncidentTitle = "SENTINEL drill: prompt-injection containment exercise",
  [switch]$AutoResolve
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Load-DotEnvFile {
  param([string]$Path)
  if (!(Test-Path $Path)) {
    return
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

    $existing = [Environment]::GetEnvironmentVariable($key)
    if ([string]::IsNullOrWhiteSpace($existing)) {
      [Environment]::SetEnvironmentVariable($key, $value)
    }
  }
}

function Require-Env {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $Name"
  }
  return $value
}

function Acquire-SupabaseBearerToken {
  $existing = [Environment]::GetEnvironmentVariable("TEST_SUPABASE_BEARER_TOKEN")
  if (![string]::IsNullOrWhiteSpace($existing)) {
    return $existing
  }

  $email = [Environment]::GetEnvironmentVariable("SUPABASE_EMAIL_TEST_USER")
  $password = [Environment]::GetEnvironmentVariable("SUPABASE_EMAIL_TEST_PASSWORD")
  if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw "Set TEST_SUPABASE_BEARER_TOKEN or SUPABASE_EMAIL_TEST_USER + SUPABASE_EMAIL_TEST_PASSWORD."
  }

  $supabaseUrl = Require-Env "NEXT_PUBLIC_SUPABASE_URL"
  $anonKey = Require-Env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  $tokenUrl = "$($supabaseUrl.TrimEnd('/'))/auth/v1/token?grant_type=password"

  $response = Invoke-RestMethod -Uri $tokenUrl -Method POST -Headers @{
    apikey = $anonKey
    Authorization = "Bearer $anonKey"
  } -ContentType "application/json" -Body (@{
      email = $email
      password = $password
    } | ConvertTo-Json -Compress)

  if (!$response.access_token) {
    throw "Supabase login did not return access_token."
  }

  return [string]$response.access_token
}

function Invoke-SentinelApi {
  param(
    [ValidateSet("GET", "POST")] [string]$Method,
    [string]$Url,
    [string]$Token,
    [object]$Body
  )

  $headers = @{
    Authorization = "Bearer $Token"
  }

  if ($Method -eq "GET") {
    $response = Invoke-WebRequest -Uri $Url -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 30
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Json = ($response.Content | ConvertFrom-Json)
    }
  }

  $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8 -Compress) -UseBasicParsing -TimeoutSec 30
  return [pscustomobject]@{
    Status = [int]$response.StatusCode
    Json = ($response.Content | ConvertFrom-Json)
  }
}

Push-Location $RepoRoot
try {
  Load-DotEnvFile (Join-Path $RepoRoot ".env.local")
  Load-DotEnvFile (Join-Path $RepoRoot ".env")

  $token = Acquire-SupabaseBearerToken
  $sentinelUrl = "$($BaseUrl.TrimEnd('/'))/api/sentinel"

  $snapshotBefore = Invoke-SentinelApi -Method GET -Url $sentinelUrl -Token $token -Body $null
  if ($snapshotBefore.Status -ne 200 -or -not $snapshotBefore.Json.ok) {
    throw "GET /api/sentinel failed before drill."
  }

  $createPayload = @{
    action = "create_incident"
    title = $IncidentTitle
    summary = "Drill run to validate KPI, anomaly, and business-impact workflow."
    severity = "high"
    impactedRoutes = @("/api/sentinel", "/api/mcp", "/api/realtime/tools")
    impactedFeatures = @("security telemetry", "tool execution", "approval queue")
    impactedUsersEstimate = 25
    estimatedRevenueImpactUsd = 12500
    blastRadius = "single workspace"
    tags = @("drill", "resilience", "tabletop")
  }

  $created = Invoke-SentinelApi -Method POST -Url $sentinelUrl -Token $token -Body $createPayload
  if ($created.Status -ne 200 -or -not $created.Json.ok -or -not $created.Json.incident.id) {
    throw "create_incident action failed."
  }
  $incidentId = [string]$created.Json.incident.id

  $investigating = Invoke-SentinelApi -Method POST -Url $sentinelUrl -Token $token -Body @{
    action = "update_incident"
    incidentId = $incidentId
    status = "investigating"
  }
  if ($investigating.Status -ne 200 -or -not $investigating.Json.ok) {
    throw "update_incident -> investigating failed."
  }

  if ($AutoResolve) {
    $contained = Invoke-SentinelApi -Method POST -Url $sentinelUrl -Token $token -Body @{
      action = "update_incident"
      incidentId = $incidentId
      status = "contained"
    }
    if ($contained.Status -ne 200 -or -not $contained.Json.ok) {
      throw "update_incident -> contained failed."
    }

    $resolved = Invoke-SentinelApi -Method POST -Url $sentinelUrl -Token $token -Body @{
      action = "update_incident"
      incidentId = $incidentId
      status = "resolved"
    }
    if ($resolved.Status -ne 200 -or -not $resolved.Json.ok) {
      throw "update_incident -> resolved failed."
    }
  }

  $snapshotAfter = Invoke-SentinelApi -Method GET -Url $sentinelUrl -Token $token -Body $null
  if ($snapshotAfter.Status -ne 200 -or -not $snapshotAfter.Json.ok) {
    throw "GET /api/sentinel failed after drill."
  }

  $incident = $snapshotAfter.Json.data.incidents | Where-Object { $_.id -eq $incidentId } | Select-Object -First 1
  if (!$incident) {
    throw "Created incident was not found in /api/sentinel snapshot."
  }

  [pscustomobject]@{
    ok = $true
    incidentId = $incidentId
    status = [string]$incident.status
    mttdMinutes = $snapshotAfter.Json.data.kpis.mttdMinutes
    mttcMinutes = $snapshotAfter.Json.data.kpis.mttcMinutes
    openIncidents = $snapshotAfter.Json.data.kpis.openIncidents
    anomalyCount = @($snapshotAfter.Json.data.anomalies).Count
    observedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 6
} finally {
  Pop-Location
}
