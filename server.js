// ChainGuard v5 — Backend completo
// Maneja TANTO la API de Anthropic COMO las llamadas a Etherscan desde el servidor
// Esto elimina el problema de rate limiting y CORS del browser

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Leer keys ──
let ANTHROPIC_KEY = process.argv[2] || process.env.ANTHROPIC_KEY || '';
let ETHERSCAN_KEY = process.argv[3] || process.env.ETHERSCAN_KEY || '';

if (!ANTHROPIC_KEY) {
  try {
    const env = fs.readFileSync(path.join(__dirname,'.env'),'utf8');
    const m1  = env.match(/ANTHROPIC_KEY\s*=\s*(.+)/);
    const m2  = env.match(/ETHERSCAN_KEY\s*=\s*(.+)/);
    if (m1) ANTHROPIC_KEY = m1[1].trim().replace(/['"]/g,'');
    if (m2) ETHERSCAN_KEY = m2[1].trim().replace(/['"]/g,'');
  } catch(e) {}
}

if (!ANTHROPIC_KEY && process.env.ANTHROPIC_KEY) ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
if (!ETHERSCAN_KEY && process.env.ETHERSCAN_KEY) ETHERSCAN_KEY = process.env.ETHERSCAN_KEY;

if (!ANTHROPIC_KEY) {
  console.log('\n❌ Falta ANTHROPIC_KEY');
  console.log('   Uso: node server.js SK_ANTHROPIC SK_ETHERSCAN');
  console.log('   O crear .env con ambas keys\n');
  process.exit(1);
}

console.log(`\n   Anthropic: ${ANTHROPIC_KEY.slice(0,16)}...${ANTHROPIC_KEY.slice(-4)} (${ANTHROPIC_KEY.length} chars)`);
console.log(`   Etherscan: ${ETHERSCAN_KEY ? ETHERSCAN_KEY.slice(0,8)+'...' : '❌ NO CONFIGURADA — app usará demo mode'}`);

const PORT = process.env.PORT || 3000;
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Helper: llamada HTTPS ──
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,100))); }
      });
    }).on('error', reject);
  });
}

// ── Etherscan desde backend ──
async function esCall(params) {
  const url = new URL('https://api.etherscan.io/v2/api');
  Object.entries({ chainid: 1, ...params, apikey: ETHERSCAN_KEY }).forEach(([k,v]) => url.searchParams.set(k,v));
  const result = await httpsGet(url.toString());
  return result;
}

async function fetchWalletData(addr) {
  const out = {
    live: !!ETHERSCAN_KEY,
    isContract: false,
    balance: null,
    txCount: null,
    firstTs: null,
    lastTs: null,
    tokens: [],
    ethPrice: 2340,
    txSample: [],
    uniqueContracts: 0,
    debug: {}
  };

  if (!ETHERSCAN_KEY) {
    console.log(`[DEMO] No Etherscan key — returning null data for ${addr.slice(0,10)}...`);
    out.live = false;
    return out;
  }

  console.log(`\n[FETCH] ${addr.slice(0,12)}...`);

  try {
    // STEP 1: Balance
    await delay(200);
    const bal = await esCall({ module:'account', action:'balance', address:addr, tag:'latest' });
    console.log(`  balance status: ${bal.status}, result: ${bal.result?.slice(0,20)}`);
    if (bal.status==='1' && bal.result && !isNaN(bal.result)) {
      out.balance = parseFloat(bal.result) / 1e18;
      console.log(`  balance ETH: ${out.balance}`);
    } else {
      console.log(`  balance FAILED: ${bal.message}`);
    }

    // STEP 2: ETH Price
    await delay(200);
    const price = await esCall({ module:'stats', action:'ethprice' });
    if (price.result?.ethusd) out.ethPrice = parseFloat(price.result.ethusd);
    console.log(`  ETH price: $${out.ethPrice}`);

    // STEP 3: Contract check
    await delay(200);
    const abi = await esCall({ module:'contract', action:'getabi', address:addr });
    out.isContract = abi.status === '1';
    console.log(`  isContract: ${out.isContract}`);

    // STEP 4: Normal transactions
    await delay(200);
    const txs = await esCall({ module:'account', action:'txlist', address:addr, startblock:0, endblock:99999999, sort:'asc', page:1, offset:200 });
    console.log(`  txlist status: ${txs.status}, count: ${Array.isArray(txs.result) ? txs.result.length : txs.message}`);

    if (txs.status==='1' && Array.isArray(txs.result) && txs.result.length > 0) {
      out.txCount  = txs.result.length;
      out.firstTs  = parseInt(txs.result[0].timeStamp);
      out.lastTs   = parseInt(txs.result[txs.result.length-1].timeStamp);
      out.txSample = txs.result.slice(-10);
      // Unique contracts interacted with
      const contracts = new Set(txs.result.map(t => t.to).filter(Boolean));
      out.uniqueContracts = contracts.size;
    } else {
      // STEP 4b: Internal transactions fallback
      await delay(200);
      const txInt = await esCall({ module:'account', action:'txlistinternal', address:addr, startblock:0, endblock:99999999, sort:'asc', page:1, offset:50 });
      console.log(`  txlistinternal status: ${txInt.status}, count: ${Array.isArray(txInt.result) ? txInt.result.length : txInt.message}`);

      if (txInt.status==='1' && Array.isArray(txInt.result) && txInt.result.length > 0) {
        out.txCount  = txInt.result.length;
        out.firstTs  = parseInt(txInt.result[0].timeStamp);
        out.txSample = txInt.result.slice(-5);
      } else {
        out.txCount = 0;
        console.log(`  → No transactions found at all`);
      }
    }

    // STEP 5: Token transfers
    await delay(200);
    const tokTx = await esCall({ module:'account', action:'tokentx', address:addr, page:1, offset:50, sort:'desc' });
    console.log(`  tokentx status: ${tokTx.status}, count: ${Array.isArray(tokTx.result) ? tokTx.result.length : tokTx.message}`);

    if (tokTx.status==='1' && Array.isArray(tokTx.result) && tokTx.result.length > 0) {
      if (out.txCount === 0) {
        out.txCount = tokTx.result.length;
        out.firstTs = parseInt(tokTx.result[tokTx.result.length-1].timeStamp);
      }
      const seen = new Map();
      tokTx.result.forEach(t => {
        if (!seen.has(t.contractAddress))
          seen.set(t.contractAddress, { name:t.tokenName, symbol:t.tokenSymbol, addr:t.contractAddress });
      });
      out.tokens = [...seen.values()].slice(0, 10);
    }

    console.log(`  FINAL → balance:${out.balance?.toFixed(4)} txCount:${out.txCount} firstTs:${out.firstTs} tokens:${out.tokens.length} isContract:${out.isContract}`);

  } catch(e) {
    console.error(`  ERROR: ${e.message}`);
  }

  return out;
}

// ── Score engine (mismo que en el frontend pero en el backend) ──
function computeScore(addr, d) {
  const components = [];
  let total = 0;

  function djb2(s) { let v=5381; for(let i=0;i<s.length;i++) v=(((v<<5)+v)^s.charCodeAt(i))>>>0; return v; }

  total += 10;
  components.push({ label:'Baseline', pts:10, note:'Starting baseline' });

  if (d.live) {
    // Age
    const firstTs = (d.firstTs && d.firstTs > 0) ? d.firstTs : null;
    if (firstTs === null) {
      total += 18; components.push({ label:'Wallet Age', pts:18, note:'No transaction history — brand new or unused' });
    } else {
      const days = Math.max(0, (Date.now()/1000 - firstTs) / 86400);
      if      (days < 7)   { total += 18; components.push({ label:'Wallet Age', pts:18, note:`${Math.round(days)} days old — very new` }); }
      else if (days < 30)  { total += 12; components.push({ label:'Wallet Age', pts:12, note:`${Math.round(days)} days old` }); }
      else if (days < 180) { total += 7;  components.push({ label:'Wallet Age', pts:7,  note:`${Math.round(days)} days old` }); }
      else if (days < 365) { total += 3;  components.push({ label:'Wallet Age', pts:3,  note:`${Math.round(days/30)} months old` }); }
      else if (days < 730) { total += 1;  components.push({ label:'Wallet Age', pts:1,  note:`${(days/365).toFixed(1)} years old` }); }
      else                 { total += 0;  components.push({ label:'Wallet Age', pts:0,  note:`${(days/365).toFixed(1)} years — established` }); }
    }

    // TX Volume
    const txCount = Number(d.txCount) || 0;
    if      (txCount === 0)   { total += 10; components.push({ label:'TX Volume', pts:10, note:'Zero transactions' }); }
    else if (txCount >= 200)  { total += 13; components.push({ label:'TX Volume', pts:13, note:'200+ transactions' }); }
    else if (txCount >= 100)  { total += 9;  components.push({ label:'TX Volume', pts:9,  note:`${txCount} transactions` }); }
    else if (txCount >= 50)   { total += 6;  components.push({ label:'TX Volume', pts:6,  note:`${txCount} transactions` }); }
    else if (txCount >= 10)   { total += 3;  components.push({ label:'TX Volume', pts:3,  note:`${txCount} transactions` }); }
    else                      { total += 1;  components.push({ label:'TX Volume', pts:1,  note:`${txCount} transactions` }); }

    // Balance
    const bal = (d.balance !== null && !isNaN(d.balance)) ? Number(d.balance) : null;
    if      (bal === null)    { components.push({ label:'ETH Balance', pts:0, note:'Balance unavailable' }); }
    else if (bal > 100000)    { total += 20; components.push({ label:'ETH Balance', pts:20, note:`${bal.toFixed(0)} ETH — major exchange/protocol` }); }
    else if (bal > 10000)     { total += 18; components.push({ label:'ETH Balance', pts:18, note:`${bal.toFixed(0)} ETH — large protocol` }); }
    else if (bal > 1000)      { total += 15; components.push({ label:'ETH Balance', pts:15, note:`${bal.toFixed(2)} ETH — whale` }); }
    else if (bal > 100)       { total += 10; components.push({ label:'ETH Balance', pts:10, note:`${bal.toFixed(2)} ETH — significant` }); }
    else if (bal > 10)        { total += 6;  components.push({ label:'ETH Balance', pts:6,  note:`${bal.toFixed(4)} ETH` }); }
    else if (bal > 0.001)     { total += 2;  components.push({ label:'ETH Balance', pts:2,  note:`${bal.toFixed(4)} ETH` }); }
    else                      { total += 5;  components.push({ label:'ETH Balance', pts:5,  note:'Dust balance' }); }

    // Tokens
    const tokLen = Array.isArray(d.tokens) ? d.tokens.length : 0;
    if      (tokLen > 15) { total += 14; components.push({ label:'Token Exposure', pts:14, note:`${tokLen}+ tokens` }); }
    else if (tokLen > 10) { total += 10; components.push({ label:'Token Exposure', pts:10, note:`${tokLen} tokens` }); }
    else if (tokLen > 5)  { total += 6;  components.push({ label:'Token Exposure', pts:6,  note:`${tokLen} tokens` }); }
    else if (tokLen > 0)  { total += 2;  components.push({ label:'Token Exposure', pts:2,  note:`${tokLen} token(s)` }); }
    else                  { total += 0;  components.push({ label:'Token Exposure', pts:0,  note:'No tokens' }); }

    // Unique contracts
    if (d.uniqueContracts > 20) { total += 8; components.push({ label:'Contract Diversity', pts:8, note:`${d.uniqueContracts} unique contracts` }); }
    else if (d.uniqueContracts > 10) { total += 5; components.push({ label:'Contract Diversity', pts:5, note:`${d.uniqueContracts} unique contracts` }); }
    else if (d.uniqueContracts > 0)  { total += 2; components.push({ label:'Contract Diversity', pts:2, note:`${d.uniqueContracts} unique contracts` }); }

    // Contract type
    if (d.isContract) { total += 10; components.push({ label:'Contract Address', pts:10, note:'Smart contract' }); }

  } else {
    const seed = djb2(addr.toLowerCase());
    const pts  = (seed % 55) + 10;
    components.push({ label:'Pattern Score (demo)', pts, note:'Demo mode — add Etherscan key for real data' });
    total += pts;
  }

  total = Math.max(0, Math.min(100, Math.round(total)));
  const level = total <= 30 ? 'low' : total <= 60 ? 'medium' : 'high';

  const safeBalance  = Number(d.balance) || 0;
  const safeTxCount  = Number(d.txCount) || 0;
  const safeTokens   = Array.isArray(d.tokens) ? d.tokens.length : 0;
  const safeAge      = (d.firstTs && d.firstTs > 0) ? Math.max(0,(Date.now()/1000-d.firstTs)/86400) : null;

  const vectors = d.live ? [
    { name:'On-Chain Age',        icon:'⧖', score: safeAge===null?80:safeAge>730?5:safeAge>365?15:safeAge>180?30:safeAge>30?50:safeAge>7?65:85 },
    { name:'Transaction Pattern', icon:'↔', score: safeTxCount===0?60:safeTxCount>=200?85:safeTxCount>=100?70:safeTxCount>=50?55:safeTxCount>=10?35:20 },
    { name:'Value Concentration', icon:'◈', score: safeBalance===0?20:safeBalance>100000?95:safeBalance>10000?85:safeBalance>1000?72:safeBalance>100?55:safeBalance>10?38:18 },
    { name:'DeFi Exposure',       icon:'⬡', score: Math.min(95, safeTokens*7) },
  ] : [
    { name:'Activity Pattern',   icon:'↔', score: 30+(djb2(addr+'a')%40) },
    { name:'Counterparty Risk',  icon:'⊕', score: 20+(djb2(addr+'b')%50) },
    { name:'Value Metrics',      icon:'◈', score: 10+(djb2(addr+'c')%60) },
    { name:'Protocol Exposure',  icon:'⬡', score: 20+(djb2(addr+'d')%40) },
  ];

  vectors.forEach(v => {
    v.level = v.score<=33?'low':v.score<=66?'medium':'high';
    v.label = v.score<=33?'Low':v.score<=66?'Medium':'High';
  });

  return { score:total, level, components, vectors, hasFlag: total>60||(d.live&&d.isContract&&total>45)||safeTokens>8 };
}

// ── MIME types ──
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon' };

// ── Servidor HTTP ──
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── POST /analyze → Etherscan + Claude ──
  if (req.method==='POST' && req.url==='/analyze') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { address, messages } = JSON.parse(body);

        // Si viene 'messages' es una llamada a Claude directo
        if (messages && !address) {
          const postData = JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:600, messages });
          const options = {
            hostname:'api.anthropic.com', path:'/v1/messages', method:'POST',
            headers:{ 'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(postData) }
          };
          const apiReq = https.request(options, apiRes => {
            let data=''; apiRes.on('data',c=>data+=c);
            apiRes.on('end',()=>{ res.writeHead(apiRes.statusCode,{'Content-Type':'application/json'}); res.end(data); });
          });
          apiReq.on('error', err => { res.writeHead(500); res.end(JSON.stringify({error:err.message})); });
          apiReq.write(postData); apiReq.end();
          return;
        }

        // Si viene 'address' → fetch completo desde backend
        if (!address) { res.writeHead(400); res.end(JSON.stringify({error:'Missing address'})); return; }

        const walletData = await fetchWalletData(address);
        const scoring    = computeScore(address, walletData);

        // Armar prompt para Claude con los datos reales
        const txSummary = walletData.txSample.slice(-8).map(t =>
          `  ${new Date((parseInt(t.timeStamp)||0)*1000).toISOString().slice(0,10)} | ${(t.from||'').toLowerCase()===address.toLowerCase()?'OUT':'IN'} | ${((parseFloat(t.value)||0)/1e18).toFixed(4)} ETH | to: ${(t.to||'unknown').slice(0,12)}…`
        ).join('\n') || '  No transactions sampled';

        const prompt = `You are a crypto compliance analyst. Write a risk report for a non-technical audience.

WALLET: ${address}
TYPE: ${walletData.isContract ? 'Smart Contract' : 'EOA (Externally Owned Account)'}
ETH BALANCE: ${walletData.balance !== null ? walletData.balance.toFixed(6)+' ETH (≈ $'+(walletData.balance*walletData.ethPrice).toFixed(0)+')' : 'unavailable'}
TRANSACTIONS: ${walletData.txCount !== null ? walletData.txCount : 'unknown'}
UNIQUE CONTRACTS INTERACTED: ${walletData.uniqueContracts || 0}
WALLET AGE: ${walletData.firstTs ? Math.round((Date.now()/1000-walletData.firstTs)/86400)+' days' : 'no history found'}
TOKENS: ${walletData.tokens.length} ERC-20 tokens (${walletData.tokens.slice(0,4).map(t=>t.symbol).join(', ')||'none'})
RISK SCORE: ${scoring.score}/100 (${scoring.level.toUpperCase()} RISK)
DATA: ${walletData.live ? 'Live Etherscan data' : 'Demo mode'}

RECENT TRANSACTIONS:
${txSummary}

Write exactly 3 paragraphs:
1. What kind of address this is and its general behavior
2. What the specific numbers mean in plain language
3. What a compliance officer or accountant should do

Rules: plain English, use the real numbers, no bullet points, under 200 words.`;

        // Llamar a Claude
        const postData = JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:600, messages:[{role:'user',content:prompt}] });
        const options = {
          hostname:'api.anthropic.com', path:'/v1/messages', method:'POST',
          headers:{ 'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(postData) }
        };

        let aiText = null;
        await new Promise((resolve) => {
          const apiReq = https.request(options, apiRes => {
            let data=''; apiRes.on('data',c=>data+=c);
            apiRes.on('end',()=>{
              try { aiText = JSON.parse(data).content?.[0]?.text || null; } catch(e) {}
              resolve();
            });
          });
          apiReq.on('error', resolve);
          apiReq.write(postData); apiReq.end();
        });

        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ walletData, scoring, aiText }));

      } catch(e) {
        console.error('Handler error:', e.message);
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  // ── GET /* → archivos estáticos ──
  let filePath = req.url==='/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, decodeURIComponent(filePath));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[path.extname(filePath)]||'text/plain'});
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ ChainGuard v5 corriendo en puerto ${PORT}`);
  if (PORT==3000) console.log('   Abrí: http://localhost:3000');
  console.log('   Ctrl+C para detener\n');
});
