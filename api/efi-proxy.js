import https from 'https';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  try {
    const { url, method = 'POST', headers = {}, body, certPem } = req.body;

    if (!url) {
      res.status(400).json({ error: 'Missing target url' });
      return;
    }

    if (!certPem) {
      res.status(400).json({ error: 'Missing certificate PEM' });
      return;
    }

    // Security check: restrict target domain to efipay.com.br
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith('efipay.com.br')) {
      res.status(403).json({ error: 'Forbidden target domain. Only efipay.com.br is allowed.' });
      return;
    }

    // Extract certificate and key
    const certMatch = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    const keyMatch = certPem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/g);

    if (!certMatch || !keyMatch) {
      res.status(400).json({ error: 'Invalid certificate PEM. Must contain both CERTIFICATE and PRIVATE KEY.' });
      return;
    }

    const cert = certMatch.join('\n');
    const key = keyMatch[0];

    const agent = new https.Agent({
      cert: cert,
      key: key,
      keepAlive: false,
    });

    // Clean headers to avoid conflicts
    const cleanHeaders = { ...headers };
    delete cleanHeaders['host'];
    delete cleanHeaders['hostname'];
    delete cleanHeaders['content-length'];

    console.log(`[efi-proxy] Proxying ${method} request to ${url}`);

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: cleanHeaders,
      agent: agent,
    };

    const proxyReq = https.request(requestOptions, (proxyRes) => {
      let resBody = '';
      proxyRes.on('data', (chunk) => {
        resBody += chunk;
      });

      proxyRes.on('end', () => {
        // Forward response headers
        const responseHeaders = {};
        const safeHeaders = ['content-type', 'cache-control'];
        safeHeaders.forEach(h => {
          if (proxyRes.headers[h]) {
            responseHeaders[h] = proxyRes.headers[h];
          }
        });

        // Set response headers
        Object.entries(responseHeaders).forEach(([k, v]) => {
          res.setHeader(k, v);
        });

        res.status(proxyRes.statusCode);
        
        // Try parsing JSON if content-type indicates it
        const contentType = proxyRes.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            res.json(JSON.parse(resBody));
          } catch (_) {
            res.send(resBody);
          }
        } else {
          res.send(resBody);
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[efi-proxy] Target Request Error:', err);
      res.status(502).json({ error: `Connection to EFI Bank failed: ${err.message}` });
    });

    if (body) {
      const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
      proxyReq.write(bodyStr);
    }
    proxyReq.end();

  } catch (err) {
    console.error('[efi-proxy] Internal Error:', err);
    res.status(500).json({ error: `Internal Proxy Error: ${err.message}` });
  }
}
