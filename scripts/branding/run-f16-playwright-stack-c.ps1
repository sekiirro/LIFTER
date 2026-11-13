$ErrorActionPreference = 'Stop'

# Supabase CLI -o env uses API_URL / ANON_KEY / SERVICE_ROLE_KEY / DB_URL.
# Next's server requires the SUPABASE_* names plus APP_ORIGIN; map these here
# before Playwright starts its webServer so an incomplete manual launch cannot
# silently send authenticated routes to /login.
$statusLines = & npx supabase status --workdir supabase-stack-c -o env
if ($LASTEXITCODE -ne 0) {
  throw 'Could not read the local Stack C Supabase environment.'
}

$stackEnv = @{}
foreach ($line in $statusLines) {
  $separator = $line.IndexOf('=')
  if ($separator -lt 1) { continue }
  $name = $line.Substring(0, $separator).Trim()
  $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
  $stackEnv[$name] = $value
}

$required = @('API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL')
foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace($stackEnv[$name])) {
    throw "Stack C status did not provide $name."
  }
}

$env:API_URL = $stackEnv['API_URL']
$env:ANON_KEY = $stackEnv['ANON_KEY']
$env:SERVICE_ROLE_KEY = $stackEnv['SERVICE_ROLE_KEY']
$env:DB_URL = $stackEnv['DB_URL']
$env:SUPABASE_URL = $stackEnv['API_URL']
$env:SUPABASE_ANON_KEY = $stackEnv['ANON_KEY']
$env:SUPABASE_SERVICE_ROLE_KEY = $stackEnv['SERVICE_ROLE_KEY']
$env:SUPABASE_DB_URL = $stackEnv['DB_URL']
$env:APP_ORIGIN = 'http://localhost:3437'
$env:PLAYWRIGHT_BASE_URL = $env:APP_ORIGIN
$env:PORT = '3437'
$env:LIFTER_SUPABASE_STACK = 'c'
$env:LIFTER_SCREENSHOT_DIR = Join-Path $env:TEMP 'lifter-s32-f16-lib15'
$env:PLAYWRIGHT_FIXTURE_ONLY = '1'
$env:CI = '1'

npm run e2e -- tests/e2e/exercise-library-production.spec.ts --workers=1
exit $LASTEXITCODE
