param(
  [ValidateSet("start", "stop", "reset", "status", "logs", "env", "psql")]
  [string]$Action = "start",
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot "supabase/docker/docker-compose.db.yml"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install it, then rerun this script."
  }
}

function Invoke-Compose {
  param([string[]]$ComposeArgs)
  & docker compose -f $ComposeFile @ComposeArgs
}

function Ensure-ComposeFile {
  if (-not (Test-Path $ComposeFile)) {
    throw "Compose file not found at $ComposeFile"
  }
}

function Wait-ForDatabase {
  param([int]$TimeoutSeconds = 90)

  $start = Get-Date
  while ($true) {
    try {
      & docker compose -f $ComposeFile exec -T db pg_isready -U postgres -d postgres 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        return
      }
    } catch {
      # ignore transient startup errors
    }

    if (((Get-Date) - $start).TotalSeconds -ge $TimeoutSeconds) {
      throw "Timed out waiting for linkedout-supabase-db to become ready."
    }
    Start-Sleep -Seconds 2
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
  $managedComment = "# Local DB-only container (managed by scripts/supabase-db-container.ps1)"
  $filtered = New-Object System.Collections.Generic.List[string]
  foreach ($line in $existing) {
    if ($line.Trim() -eq $managedComment) {
      continue
    }
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

  $filtered.Add($managedComment)
  foreach ($key in $updateKeys) {
    $filtered.Add("$key=$($Updates[$key])")
  }

  Set-Content -Path $fullPath -Value $filtered -Encoding utf8
  Write-Host "[supabase-db] Updated $Path with DB container values." -ForegroundColor Green
}

function Read-EnvFileKey {
  param([string]$Path, [string]$Key)
  $fullPath = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $RepoRoot $Path }
  if (-not (Test-Path $fullPath)) { return $null }
  foreach ($line in Get-Content $fullPath) {
    if ($line -match "^\s*$Key\s*=\s*(.+)$") {
      $value = $Matches[1].Trim()
      if ($value.Length -ge 2) {
        $first = $value[0]
        $last = $value[$value.Length - 1]
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }
      return $value
    }
  }
  return $null
}

function New-RandomPassword {
  param([int]$Length = 32)

  if ($Length -lt 16) {
    throw "Password length must be at least 16."
  }

  $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  $charArray = $chars.ToCharArray()
  $charCount = $charArray.Length
  $maxUnbiased = [byte](256 - (256 % $charCount))

  $sb = New-Object System.Text.StringBuilder
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buffer = New-Object byte[] 1
  try {
    while ($sb.Length -lt $Length) {
      $rng.GetBytes($buffer)
      $candidate = $buffer[0]
      if ($candidate -ge $maxUnbiased) {
        continue
      }

      [void]$sb.Append($charArray[$candidate % $charCount])
    }
  } finally {
    $rng.Dispose()
  }

  return $sb.ToString()
}

function Resolve-PostgresPassword {
  param([string]$EnvFilePath)

  # 1. Already in the process environment (e.g. CI, parent shell export)
  if ($env:POSTGRES_PASSWORD -and $env:POSTGRES_PASSWORD.Length -ge 16) {
    return $env:POSTGRES_PASSWORD
  }

  # 2. Already in .env.local
  $stored = Read-EnvFileKey -Path $EnvFilePath -Key "POSTGRES_PASSWORD"
  if ($stored -and $stored.Length -ge 16) {
    $env:POSTGRES_PASSWORD = $stored
    return $stored
  }

  # 3. Generate a cryptographically random 32-char password and persist it
  $password = New-RandomPassword -Length 32

  Write-Host ""
  Write-Host "[supabase-db] No POSTGRES_PASSWORD found - generating a strong random password." -ForegroundColor Yellow
  Write-Host "[supabase-db] Saving to $EnvFilePath (do NOT commit this file)." -ForegroundColor Yellow
  Write-Host ""

  Upsert-EnvFile -Path $EnvFilePath -Updates ([ordered]@{ POSTGRES_PASSWORD = $password })

  $env:POSTGRES_PASSWORD = $password
  return $password
}

function Get-DbEnvValues {
  param([string]$Password)
  return [ordered]@{
    SUPABASE_DB_CONTAINER_URL      = "postgresql://postgres:${Password}@127.0.0.1:54322/postgres"
    SUPABASE_DB_CONTAINER_HOST     = "127.0.0.1"
    SUPABASE_DB_CONTAINER_PORT     = "54322"
    SUPABASE_DB_CONTAINER_USER     = "postgres"
    SUPABASE_DB_CONTAINER_PASSWORD = $Password
    SUPABASE_DB_CONTAINER_DATABASE = "postgres"
  }
}

Push-Location $RepoRoot
try {
  Ensure-ComposeFile

  # Resolve password before any docker compose call so the secret is available
  $pgPassword = Resolve-PostgresPassword -EnvFilePath $EnvFile

  switch ($Action) {
    "start" {
      Require-Command "docker"
      Write-Host "[supabase-db] Starting DB container..." -ForegroundColor Cyan
      Invoke-Compose -ComposeArgs @("up", "-d", "--remove-orphans")
      Wait-ForDatabase
      Upsert-EnvFile -Path $EnvFile -Updates (Get-DbEnvValues -Password $pgPassword)
      Write-Host "[supabase-db] DB container is ready on 127.0.0.1:54322" -ForegroundColor Green
    }
    "stop" {
      Require-Command "docker"
      Write-Host "[supabase-db] Stopping DB container..." -ForegroundColor Cyan
      Invoke-Compose -ComposeArgs @("down", "--remove-orphans")
    }
    "reset" {
      Require-Command "docker"
      Write-Host "[supabase-db] Resetting DB container volume and reapplying migrations..." -ForegroundColor Cyan
      Invoke-Compose -ComposeArgs @("down", "--volumes", "--remove-orphans")
      Invoke-Compose -ComposeArgs @("up", "-d", "--remove-orphans")
      Wait-ForDatabase
      Upsert-EnvFile -Path $EnvFile -Updates (Get-DbEnvValues -Password $pgPassword)
      Write-Host "[supabase-db] Reset complete." -ForegroundColor Green
    }
    "status" {
      Require-Command "docker"
      Invoke-Compose -ComposeArgs @("ps")
    }
    "logs" {
      Require-Command "docker"
      Invoke-Compose -ComposeArgs @("logs", "-f", "db")
    }
    "env" {
      Upsert-EnvFile -Path $EnvFile -Updates (Get-DbEnvValues -Password $pgPassword)
    }
    "psql" {
      Require-Command "docker"
      # Pass password via PGPASSWORD env var (without inline value in args).
      $env:PGPASSWORD = $pgPassword
      try {
        Invoke-Compose -ComposeArgs @("exec", "-e", "PGPASSWORD", "db", "psql", "-U", "postgres", "-d", "postgres")
      } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
      }
    }
  }
} finally {
  Pop-Location
}
