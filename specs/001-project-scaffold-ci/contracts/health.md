# Contract: GET /api/health

- Auth: none (public).
- Response: `200 application/json`, with `Cache-Control: no-store`.

```json
{ "status": "ok", "version": "<semver from package.json>" }
```

- Exactly these two keys. No env values, hostnames, paths, timestamps or dependency checks.
- `HEAD` is allowed (HTTP semantics for a GET resource, served by the framework). Any other method → `405`.
