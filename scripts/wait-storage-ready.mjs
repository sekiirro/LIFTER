const apiUrl = process.env.API_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!apiUrl || !anonKey) {
  console.error(
    'Storage readiness requires the selected local API and anon key.',
  );
  process.exit(1);
}

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await fetch(`${apiUrl}/storage/v1/bucket`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(1000),
    });
    let message = '';
    if (response.status === 400) {
      try {
        const body = await response.json();
        if (typeof body?.message === 'string') message = body.message;
      } catch {
        // Keep waiting for a recognized ready response.
      }
    }
    if (
      response.status === 200 ||
      response.status === 401 ||
      (response.status === 400 && message === 'Invalid Compact JWS')
    ) {
      console.log(`Storage ready (HTTP ${response.status}).`);
      process.exit(0);
    }
  } catch {
    // The service may still be starting; retry within the bounded readiness window.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.error('Storage readiness timed out after 40 probes.');
process.exit(1);
