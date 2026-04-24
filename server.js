// ChainGuard — Servidor proxy para Claude AI
// Funciona tanto en local como en Railway/Render/cualquier cloud

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Leer API Key (en orden de prioridad) ──
let ANTHROPIC_KEY = '';

// 1. Variable de entorno del sistema (Railway la usa así)
if (process.env.ANTHROPIC_KEY) {
  ANTHROPIC_KEY = process.env.ANTHROPIC_KEY.trim();
}

// 2. Argumento de línea de comando (uso local)
if (!ANTHROPIC_KEY && process.argv[2] && process.argv[2].startsWith('sk-')) {
  ANTHROPIC_KEY = process.argv[2].trim();
}

// 3. Archivo .env (uso local alternativo)
if (!ANTHROPIC_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match   = envFile.match(/ANTHROPIC_KEY\s*=\s*(.+)/);
    if (match) ANTHROPIC_KEY = match[1].trim().replace(/['"]/g, '');
  } catch(e) {}
}

if (!ANTHROPIC_KEY) {
  console.log('\n❌ FALTA la API key de Anthropic.\n');
  console.log('   LOCAL:   node server.js sk-ant-api03-TUKEY');
  console.log('   RAILWAY: configurar variable ANTHROPIC_KEY en el dashboard\n');
  process.exit(1);
}

const preview = ANTHROPIC_KEY.slice(0,18) + '...' + ANTHROPIC_KEY.slice(-4);
console.log(`\n   Key: ${preview} (${ANTHROPIC_KEY.length} chars)`);

// Railway asigna el puerto via variable de entorno PORT
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── POST /analyze → Claude API ──
  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload  = JSON.parse(body);
        const postData = JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 500,
          messages:   payload.messages || [{ role:'user', content: payload.prompt || 'Hello' }]
        });

        const options = {
          hostname: 'api.anthropic.com',
          path:     '/v1/messages',
          method:   'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length':    Buffer.byteLength(postData),
          }
        };

        console.log(`[${new Date().toISOString()}] → Claude API`);

        const apiReq = https.request(options, apiRes => {
          let data = '';
          apiRes.on('data', chunk => data += chunk);
          apiRes.on('end', () => {
            console.log(`[${new Date().toISOString()}] ← HTTP ${apiRes.statusCode}`);
            if (apiRes.statusCode !== 200) console.log('  Error:', data.slice(0, 300));
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(data);
          });
        });

        apiReq.on('error', err => {
          console.error('Error red:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        apiReq.write(postData);
        apiReq.end();

      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON invalido' }));
      }
    });
    return;
  }

  // ── GET /* → archivos estáticos ──
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, decodeURIComponent(filePath));

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ ChainGuard corriendo en puerto ${PORT}`);
  if (PORT === 3000) console.log('   Abrí: http://localhost:3000');
  console.log('   Presioná Ctrl+C para detener\n');
});
