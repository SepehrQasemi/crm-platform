param(
  [switch]$RunHealth,
  [switch]$SkipHealth,
  [switch]$NoBrowser,
  [switch]$ForceInstall,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[CRM Start]" $Message -ForegroundColor Cyan
}

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Step "Repository: $repoRoot"
Ensure-Command "node"
Ensure-Command "npm"

$nodeVersion = (& node -v)
Write-Step "Node version: $nodeVersion"

$envLocal = Join-Path $repoRoot "web\.env.local"
$defaultSecrets = "a private environment file outside the repository"

if (-not (Test-Path $envLocal)) {
  if (Test-Path $defaultSecrets) {
    Copy-Item $defaultSecrets $envLocal
    Write-Step "Created web/.env.local from a private environment file outside the repository"
  } else {
    throw "Missing web/.env.local. Create it manually or add a private environment file outside the repository."
  }
}

$rootModules = Join-Path $repoRoot "node_modules"
$webModules = Join-Path $repoRoot "web\node_modules"

if ($ForceInstall -or -not (Test-Path $rootModules) -or -not (Test-Path $webModules)) {
  Write-Step "Installing dependencies (npm ci)..."
  npm ci
} else {
  Write-Step "Dependencies already installed."
}

if ($RunHealth -and -not $SkipHealth) {
  Write-Step "Running quick health checks (lint + build)..."
  npm run lint
  npm run build
} else {
  Write-Step "Skipping quick health checks (use -RunHealth to enable)."
}

if (-not $NoBrowser) {
  Write-Step "Browser will open automatically when /login becomes reachable."
  $waitScript = @'
$maxAttempts = 90
for ($i = 0; $i -lt $maxAttempts; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      Start-Process "http://127.0.0.1:3000/login"
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}
'@
  Start-Process powershell -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-Command", $waitScript | Out-Null
}

if ($DryRun) {
  Write-Step "Dry run completed successfully. Startup command skipped."
  exit 0
}

Write-Step "Starting development server at http://127.0.0.1:3000 ..."
npm run dev
