const model = 'minimax/minimax-h3-max/image-to-video';
let checking = false;
let lastCheck = 0;

export async function checkConnection(req, res, { local = false, apiKey = '' } = {}) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  // Keep the diagnostic closed on hosted builds until reviewer authentication exists.
  if (!local) return send(404, { ok: false, message: 'Connection check is local-only.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { ok: false, message: 'Method not allowed.' });
  }
  const origin = req.headers.origin;
  const expectedOrigin = `http://${req.headers.host}`;
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || (origin && origin !== expectedOrigin)
    || req.headers['x-content-studio-check'] !== '1') {
    return send(403, { ok: false, message: 'Open the prototype locally to check the connection.' });
  }
  const key = apiKey.trim();
  if (!key) return send(503, { ok: false, code: 'missing_key', message: 'Server API key is not configured.' });
  if (checking || Date.now() - lastCheck < 3000) {
    res.setHeader('Retry-After', '3');
    return send(429, { ok: false, message: 'Wait a few seconds before checking again.' });
  }
  checking = true;
  lastCheck = Date.now();
  const start = Date.now();
  try {
    const response = await fetch(`https://model-api.runcomfy.net/v1/models/${model}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'RunComfy rejected the key or denied access.'
        : response.status === 404 ? 'H3 Max is not available at the configured model route.'
        : response.status === 429 ? 'RunComfy is rate-limiting requests. Try again shortly.'
        : 'RunComfy could not complete the connection check.';
      await response.body?.cancel();
      return send(502, { ok: false, providerStatus: response.status, message });
    }
    const schema = await response.json();
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)
      || schema.error || schema.message === 'Unauthorized') {
      return send(502, { ok: false, message: 'RunComfy returned an unexpected model response.' });
    }
    // Return only diagnostic metadata, never the credential or raw provider payload.
    return send(200, {
      ok: true, provider: 'RunComfy', model, latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(), generationSubmitted: false,
      message: 'Authenticated model lookup succeeded.',
    });
  } catch {
    return send(502, { ok: false, message: 'RunComfy is unreachable or the request timed out.' });
  } finally {
    checking = false;
  }
}
