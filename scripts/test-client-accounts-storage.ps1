$ErrorActionPreference = 'Stop'
$dockerBin = 'C:\Users\NEW LAP\AppData\Local\Programs\DockerDesktop\resources\bin'
$env:PATH = "$dockerBin;$env:PATH"

function Invoke-SupabaseQuietly([string[]] $arguments) {
  $u6OriginalErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $u6CommandOutput = & npx --yes supabase@2.122.0 @arguments 2>&1
    $u6CommandExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $u6OriginalErrorActionPreference
  }
  if ($u6CommandExitCode -ne 0) {
    throw 'Local Storage stack transition failed.'
  }
}

function Load-LocalEnvironment {
  $path = (Resolve-Path -LiteralPath '.env.local').Path
  foreach ($line in [IO.File]::ReadAllLines($path)) {
    if ($line -match '^([A-Z][A-Z0-9_]*)="?([^"\r\n]*)"?$') {
      Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
  }
}

try {
  Invoke-SupabaseQuietly @('stop')
  Invoke-SupabaseQuietly @('start', '-x', 'studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta')
  Load-LocalEnvironment
  $env:CI = '1'
  $u6OriginalErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $u6StorageOutput = & npm run e2e -- tests/e2e/client-accounts-storage.spec.ts --reporter=line 2>&1
    $u6StorageExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $u6OriginalErrorActionPreference
  }
  $env:U8_STORAGE_RESULT_INPUT = $u6StorageOutput -join "`n"
  try {
    $u6StorageResultJson = & node scripts/client-accounts-storage-result.mjs
    $u6StorageParseExitCode = $LASTEXITCODE
  } finally {
    Remove-Item Env:U8_STORAGE_RESULT_INPUT -ErrorAction SilentlyContinue
  }
  if ($u6StorageParseExitCode -ne 0) {
    throw 'Storage runner result could not be parsed.'
  }
  $u6StorageResult = $u6StorageResultJson | ConvertFrom-Json
  $u6StorageResultLine = "Storage runner: $($u6StorageResult.passed) passed, $($u6StorageResult.skipped) skipped, $($u6StorageResult.failed) failed, $($u6StorageResult.flaky) flaky, $($u6StorageResult.interrupted) interrupted"
  if ($u6StorageExitCode -ne 0 -or -not $u6StorageResult.acceptable) {
    Write-Output $u6StorageResultLine
    throw 'Storage runner must report exactly 1 passed and 0 skipped, failed, flaky or interrupted.'
  }
  Write-Output $u6StorageResultLine
} finally {
  Invoke-SupabaseQuietly @('stop')
  Invoke-SupabaseQuietly @('start', '-x', 'studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta')
}
