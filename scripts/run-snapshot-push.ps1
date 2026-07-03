$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDirectory = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDirectory "snapshot-push.log"

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

function Write-Log {
  param([string] $Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$timestamp] $Message" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

function Resolve-Npm {
  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidate = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
  if (Test-Path $candidate) {
    return $candidate
  }

  throw "npm.cmd was not found on PATH or in Program Files."
}

Push-Location $ProjectRoot
try {
  Write-Log "Starting snapshot push."
  $npm = Resolve-Npm
  $output = & $npm run snapshot:push 2>&1
  $exitCode = $LASTEXITCODE
  $output | Out-File -FilePath $LogFile -Append -Encoding utf8

  if ($exitCode -ne 0) {
    throw "npm run snapshot:push failed with exit code $exitCode."
  }

  Write-Log "Snapshot push completed."
} catch {
  Write-Log "Snapshot push failed: $($_.Exception.Message)"
  exit 1
} finally {
  Pop-Location
}
