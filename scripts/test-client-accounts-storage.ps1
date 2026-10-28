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
    $u6StorageOutput = & npm run e2e -- tests/e2e/client-accounts-storage.spec.ts 2>&1
    $u6StorageExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $u6OriginalErrorActionPreference
  }
  if ($u6StorageExitCode -ne 0) {
    throw 'Pending-client Storage denial e2e failed.'
  }
  $u6StorageOutput | Where-Object { $_ -match '^\s*1 passed|^\s*\d+ passed' }
} finally {
  Invoke-SupabaseQuietly @('stop')
  Invoke-SupabaseQuietly @('start', '-x', 'studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta')
}
