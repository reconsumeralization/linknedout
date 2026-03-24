param(
  [int]$Port = 4020,
  [switch]$SkipBuild,
  [switch]$Strict
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
    apikey        = $anonKey
    Authorization = "Bearer $anonKey"
  } -ContentType "application/json" -Body (@{
      email    = $email
      password = $password
    } | ConvertTo-Json -Compress)

  if (!$response.access_token) {
    throw "Supabase login did not return access_token."
  }

  return [string]$response.access_token
}

function Wait-ForServer {
  param([string]$BaseUrl)
  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 300
    try {
      $null = Invoke-WebRequest -Uri "$BaseUrl/api/chat?action=models" -Method GET -TimeoutSec 2 -UseBasicParsing
      return
    } catch {
      # keep waiting
    }
  }
  throw "Server did not become ready."
}

function Invoke-ApiCheck {
  param(
    [string]$Name,
    [ValidateSet("GET", "POST")] [string]$Method,
    [string]$Url,
    [int[]]$ExpectedStatus,
    [hashtable]$Headers,
    [string]$Body
  )

  $status = -1
  $content = ""
  try {
    if ($Method -eq "POST") {
      $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -ContentType "application/json" -Body $Body -TimeoutSec 30 -UseBasicParsing
    } else {
      $response = Invoke-WebRequest -Uri $Url -Method GET -Headers $Headers -TimeoutSec 30 -UseBasicParsing
    }
    $status = [int]$response.StatusCode
    $content = [string]$response.Content
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
        $reader.Close()
      }
    } else {
      $content = $_.Exception.Message
    }
  }

  if ($content.Length -gt 220) {
    $content = $content.Substring(0, 220)
  }

  return [pscustomobject]@{
    test     = $Name
    status   = $status
    expected = $ExpectedStatus -join ","
    pass     = ($ExpectedStatus -contains $status)
    body     = $content
  }
}

Push-Location $RepoRoot
try {
  Load-DotEnvFile (Join-Path $RepoRoot ".env.local")
  Load-DotEnvFile (Join-Path $RepoRoot ".env")

  $openAiKey = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY")
  $supabaseUrl = [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL")
  $supabaseAnonKey = [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  $googleClientId = [Environment]::GetEnvironmentVariable("GOOGLE_CLIENT_ID")
  $hasOpenAi = -not [string]::IsNullOrWhiteSpace($openAiKey)
  $hasSupabaseConfig = -not [string]::IsNullOrWhiteSpace($supabaseUrl) -and -not [string]::IsNullOrWhiteSpace($supabaseAnonKey)

  $bearer = $null
  if ($hasSupabaseConfig) {
    try {
      $bearer = Acquire-SupabaseBearerToken
    } catch {
      $bearer = $null
    }
  }
  $canRunAuth = -not [string]::IsNullOrWhiteSpace($bearer)
  $skipped = @()

  if (!$SkipBuild) {
    Write-Host "[smoke-auth] Running build..." -ForegroundColor Cyan
    & pnpm -s build
  }

  Write-Host "[smoke-auth] Starting Next server on port $Port..." -ForegroundColor Cyan
  $server = Start-Process -FilePath "pnpm" -ArgumentList "-s", "exec", "next", "start", "-p", "$Port" -PassThru -WindowStyle Hidden -WorkingDirectory $RepoRoot
  try {
    $baseUrl = "http://127.0.0.1:$Port"
    Wait-ForServer -BaseUrl $baseUrl

    $authHeaders = @{ Authorization = "Bearer $bearer" }
    $mcpHeaders = @{
      Authorization      = "Bearer $bearer"
      "x-forwarded-proto" = "https"
    }

    $tests = @()
    # Core (always-run) checks
    $tests += Invoke-ApiCheck -Name "GET /api/chat?action=health" -Method GET -Url "$baseUrl/api/chat?action=health" -ExpectedStatus @($(if ($hasOpenAi) { 200 } else { 503 })) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "POST /api/chat minimal" -Method POST -Url "$baseUrl/api/chat" -ExpectedStatus @($(if ($hasOpenAi) { 200 } else { 503 })) -Headers @{} -Body '{"messages":[{"role":"user","content":"Return one sentence confirming service health."}]}'
    $tests += Invoke-ApiCheck -Name "GET /api/chat?action=models" -Method GET -Url "$baseUrl/api/chat?action=models" -ExpectedStatus @(200) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "GET /api/realtime/tools (unauth)" -Method GET -Url "$baseUrl/api/realtime/tools" -ExpectedStatus @(401) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "POST /api/realtime/tools invalid payload" -Method POST -Url "$baseUrl/api/realtime/tools" -ExpectedStatus @(400) -Headers @{} -Body '{"bad":true}'
    $tests += Invoke-ApiCheck -Name "GET /api/mcp (unauth https-forwarded)" -Method GET -Url "$baseUrl/api/mcp" -ExpectedStatus @(401) -Headers @{ "x-forwarded-proto" = "https" } -Body ""
    $tests += Invoke-ApiCheck -Name "POST /api/mcp initialize unauth https-forwarded" -Method POST -Url "$baseUrl/api/mcp" -ExpectedStatus @(401) -Headers @{ "x-forwarded-proto" = "https" } -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'
    $tests += Invoke-ApiCheck -Name "GET /.well-known/oauth-protected-resource" -Method GET -Url "$baseUrl/.well-known/oauth-protected-resource" -ExpectedStatus @(200) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "GET /api/sentinel (unauth)" -Method GET -Url "$baseUrl/api/sentinel" -ExpectedStatus @(401) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "GET /api/agents/control-plane" -Method GET -Url "$baseUrl/api/agents/control-plane" -ExpectedStatus @(401) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "POST /api/agents/control-plane/cron unauthorized" -Method POST -Url "$baseUrl/api/agents/control-plane/cron" -ExpectedStatus @(401) -Headers @{} -Body "{}"
    $tests += Invoke-ApiCheck -Name "GET /api/email/oauth config gate" -Method GET -Url "$baseUrl/api/email/oauth" -ExpectedStatus @($(if ([string]::IsNullOrWhiteSpace($googleClientId)) { 501 } else { 400 })) -Headers @{} -Body ""
    $tests += Invoke-ApiCheck -Name "GET /api/globe/layers?sentinel=status" -Method GET -Url "$baseUrl/api/globe/layers?sentinel=status" -ExpectedStatus @(200) -Headers @{} -Body ""

    # Authenticated checks (conditional)
    if ($canRunAuth) {
      $tests += Invoke-ApiCheck -Name "GET /api/realtime/tools (auth)" -Method GET -Url "$baseUrl/api/realtime/tools" -ExpectedStatus @(200) -Headers $authHeaders -Body ""
      $tests += Invoke-ApiCheck -Name "POST /api/realtime/tools searchProfiles (auth)" -Method POST -Url "$baseUrl/api/realtime/tools" -ExpectedStatus @(200) -Headers $authHeaders -Body '{"name":"searchProfiles","arguments":{"keywords":"founder","location":null,"industry":null,"currentCompany":null,"pastCompany":null,"title":null,"skills":null,"experienceYears":null,"limit":3}}'
      $tests += Invoke-ApiCheck -Name "GET /api/mcp (auth)" -Method GET -Url "$baseUrl/api/mcp" -ExpectedStatus @(200) -Headers $mcpHeaders -Body ""
      $tests += Invoke-ApiCheck -Name "POST /api/mcp initialize (auth)" -Method POST -Url "$baseUrl/api/mcp" -ExpectedStatus @(200) -Headers $mcpHeaders -Body '{"jsonrpc":"2.0","id":11,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'
      $tests += Invoke-ApiCheck -Name "POST /api/mcp tools/list (auth)" -Method POST -Url "$baseUrl/api/mcp" -ExpectedStatus @(200) -Headers $mcpHeaders -Body '{"jsonrpc":"2.0","id":12,"method":"tools/list","params":{}}'
      $tests += Invoke-ApiCheck -Name "POST /api/mcp tools/call searchProfiles (auth)" -Method POST -Url "$baseUrl/api/mcp" -ExpectedStatus @(200) -Headers $mcpHeaders -Body '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"searchProfiles","arguments":{"keywords":"engineer","location":null,"industry":null,"currentCompany":null,"pastCompany":null,"title":null,"skills":null,"experienceYears":null,"limit":2}}}'
      $tests += Invoke-ApiCheck -Name "GET /api/sentinel (auth)" -Method GET -Url "$baseUrl/api/sentinel" -ExpectedStatus @(200) -Headers $authHeaders -Body ""
      $tests += Invoke-ApiCheck -Name "GET /api/subagents/supabase/health (auth)" -Method GET -Url "$baseUrl/api/subagents/supabase/health" -ExpectedStatus @(200) -Headers $authHeaders -Body ""
      $tests += Invoke-ApiCheck -Name "GET /api/network/insights (auth)" -Method GET -Url "$baseUrl/api/network/insights" -ExpectedStatus @(200) -Headers $authHeaders -Body ""
    } else {
      $skipped += "GET /api/realtime/tools (auth)"
      $skipped += "POST /api/realtime/tools searchProfiles (auth)"
      $skipped += "GET /api/mcp (auth)"
      $skipped += "POST /api/mcp initialize (auth)"
      $skipped += "POST /api/mcp tools/list (auth)"
      $skipped += "POST /api/mcp tools/call searchProfiles (auth)"
      $skipped += "GET /api/sentinel (auth)"
      $skipped += "GET /api/subagents/supabase/health (auth)"
      $skipped += "GET /api/network/insights (auth)"
    }

    # OpenAI realtime upstream checks (conditional)
    if ($hasOpenAi -and $canRunAuth) {
      $tests += Invoke-ApiCheck -Name "POST /api/realtime/client-secret (auth)" -Method POST -Url "$baseUrl/api/realtime/client-secret" -ExpectedStatus @(200, 502) -Headers $authHeaders -Body '{}'
      $tests += Invoke-ApiCheck -Name "POST /api/realtime/session (auth dummy SDP)" -Method POST -Url "$baseUrl/api/realtime/session" -ExpectedStatus @(200, 502) -Headers $authHeaders -Body '{"offerSdp":"v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 RTP/AVP 0\r\n"}'
    } else {
      $skipped += "POST /api/realtime/client-secret (auth)"
      $skipped += "POST /api/realtime/session (auth dummy SDP)"
    }

    $failed = @($tests | Where-Object { -not $_.pass })
    $summary = [pscustomobject]@{
      total    = $tests.Count
      passed   = $tests.Count - $failed.Count
      failed   = $failed.Count
      skipped  = $skipped.Count
      failures = $failed
      skippedTests = $skipped
      env = @{
        hasOpenAi = $hasOpenAi
        hasSupabaseConfig = $hasSupabaseConfig
        hasSupabaseBearer = $canRunAuth
      }
      results  = $tests
    }

    $summary | ConvertTo-Json -Depth 6
    if ($failed.Count -gt 0 -or ($Strict -and $skipped.Count -gt 0)) {
      exit 1
    }
  } finally {
    if ($server -and -not $server.HasExited) {
      Stop-Process -Id $server.Id -Force
    }
  }
} finally {
  Pop-Location
}
