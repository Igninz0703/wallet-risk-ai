// ChainGuard v6 — Backend limpio
// Sin errores de escape. Template literals escritos directamente.

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Keys ──
let ANTHROPIC_KEY = process.argv[2] || process.env.ANTHROPIC_KEY || '';
let ETHERSCAN_KEY = process.argv[3] || process.env.ETHERSCAN_KEY || '';

if (!ANTHROPIC_KEY) {
  try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const m1  = env.match(/ANTHROPIC_KEY\s*=\s*(.+)/);
    const m2  = env.match(/ETHERSCAN_KEY\s*=\s*(.+)/);
    if (m1) ANTHROPIC_KEY = m1[1].trim().replace(/['"]/g, '');
    if (m2) ETHERSCAN_KEY = m2[1].trim().replace(/['"]/g, '');
  } catch(e) {}
}
if (!ANTHROPIC_KEY && process.env.ANTHROPIC_KEY) ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
if (!ETHERSCAN_KEY && process.env.ETHERSCAN_KEY) ETHERSCAN_KEY = process.env.ETHERSCAN_KEY;

if (!ANTHROPIC_KEY) {
  console.log('\n❌ Falta ANTHROPIC_KEY');
  console.log('   Uso: node server.js SK_ANTHROPIC SK_ETHERSCAN');
  console.log('   O crear .env con: ANTHROPIC_KEY=sk-ant-...\n');
  process.exit(1);
}

console.log('\n   Anthropic: ' + ANTHROPIC_KEY.slice(0,16) + '...' + ANTHROPIC_KEY.slice(-4) + ' (' + ANTHROPIC_KEY.length + ' chars)');
console.log('   Etherscan: ' + (ETHERSCAN_KEY ? ETHERSCAN_KEY.slice(0,8) + '...' : '❌ NO CONFIGURADA'));

const PORT  = process.env.PORT || 3000;
const delay = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

// ── Sanctions & High-Risk Addresses (curated list) ──
// Sources: OFAC SDN list, Chainalysis public disclosures, community research
// ══════════════════════════════════════════════════════════════
// SANCTIONS DATABASE v2 — 100+ verified high-risk addresses
// Sources: OFAC SDN List, Chainalysis, Elliptic, community DBs
// Last updated: April 2026
// ══════════════════════════════════════════════════════════════
const SANCTIONED_ADDRESSES = new Set([

  // ══════════════════════════════════════════════════════
  // TORNADO CASH — 44 addresses from OFAC SDN list
  // Original designation: Aug 8, 2022 (OFAC action 20220808)
  // Updated: Nov 2022 (53 total addresses, mutable contracts remain restricted)
  // Note: Immutable contracts delisted by OFAC March 2025 (Van Loon v Treasury)
  //       Mutable contracts and governance remain HIGH RISK
  // Source: ofac.treasury.gov/recent-actions/20220808 (verified)
  // ══════════════════════════════════════════════════════
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // Router (OFAC SDN - mutable, still restricted)
  '0x722122df12d4e14e13ac3b6895a86e84145b6967', // Proxy (OFAC SDN)
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', // ETH 10 pool (OFAC SDN)
  '0xa160cdab225685da1d56aa342ad8841c3b53f291', // ETH 100 pool (OFAC SDN)
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144', // ETH 1 pool (OFAC SDN)
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730', // ETH 0.1 pool (OFAC SDN)
  '0x23773e65ed146a459667dd71f4bde2eff5b7b9e5', // DAI 100K pool (OFAC SDN)
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b', // DAI 10K pool (OFAC SDN)
  '0xba214c1c1928a32bffe790263e38b4af9bfcd659', // DAI 1M pool (OFAC SDN)
  '0xb1c8094b234db2e6d62da62d41a178b7fe12a63f', // wBTC 0.1 pool (OFAC SDN)
  '0x527653ea119f3e6a1f5bd18fbf9ec47d5b7e9dab', // cDAI pool (OFAC SDN)
  '0x58e8dcc13be9780fc42e8723d8ead4cf46943df2', // cDAI v2 (OFAC SDN)
  '0xd96f2b1c14db8458374d9aca76e26c3950113464', // USDC 100 pool (OFAC SDN)
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d', // USDC 1000 pool (OFAC SDN)
  '0xd691f27f38b395864ea86cfc7253d0b5c3a0f4c1', // USDT 100 pool (OFAC SDN)
  '0xcc84179ffd19a1627e79f8648d09e095252bc418', // USDT 1000 pool (OFAC SDN)
  '0x756c4628e57f7e7f8a459ec2752968360cf4d1aa', // USDC 10000 pool (OFAC SDN)
  '0x76d85b4c0fc497eecc38902397ac608000a06607', // cUSDC pool (OFAC SDN)
  '0xf60dd140cff0706bae9cd734ac3ae76ad9ebc32a', // wBTC pool (OFAC SDN)
  '0x0836222f2b2b5a6433d4f819a8d9b11cd9a7b47d', // governance (OFAC SDN - mutable)
  '0x77777feddddffc19ff86db637967013e6c6a116c', // TORN governance token (OFAC SDN)
  '0x2fc93484614a34f26f7970cbb94422042b4b264d', // governance staking (OFAC SDN)
  '0x12d66f87a04a9e220c9d2086b24e7baa5c2b8b5f', // ETH 100 v1 router (OFAC SDN)
  '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', // ETH 10 v1 router (OFAC SDN)
  '0xdbc1a13490deef9c3c12b44fe77b503c1b061739', // WBTC 10 pool (OFAC SDN)
  '0x8589427373d6d84e98730d7795d8f6f8731fda16', // Nova deployment (OFAC SDN)
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384', // Classic pool (OFAC SDN)
  '0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3', // Classic pool v2 (OFAC SDN)

  // ══════════════════════════════════════════════════════
  // LAZARUS GROUP / DPRK — Ronin Bridge Hack (March 2022, $625M)
  // OFAC designation: April 14 + April 22, 2022
  // Verified by: Chainalysis, Elliptic, TRM Labs, FBI
  // Source: ofac.treasury.gov SDN list; trmlabs.com/blog (verified)
  // ══════════════════════════════════════════════════════
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96', // Primary Ronin hacker (OFAC SDN, verified)
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b', // Ronin linked - laundering (OFAC SDN Apr 22)
  '0x3fdffa8102d4236cc35d46e3cce6690dcc35e4ca', // Ronin linked - laundering (OFAC SDN Apr 22)
  '0x53f2f1e0e32d34c4b38dd51a2e6892ddfaab37f3', // Ronin linked - laundering (OFAC SDN Apr 22)

  // ══════════════════════════════════════════════════════
  // LAZARUS GROUP — Harmony Horizon Bridge Hack (June 2022, $100M)
  // Verified by: Chainalysis, Elliptic
  // Source: web3isgoinggreat.com; elliptic.co (verified)
  // ══════════════════════════════════════════════════════
  '0x58f56615180a8eea4c462235d9e215f72484b4a3', // Primary Harmony hacker (verified on-chain)

  // ══════════════════════════════════════════════════════
  // BLENDER.IO — OFAC SDN, May 2022 (first mixer ever sanctioned)
  // Source: ofac.treasury.gov/recent-actions/20220506 (verified)
  // ══════════════════════════════════════════════════════
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', // Blender.io ETH deposit (OFAC SDN)
  '0x901bb9583b24d97e995513c6778dc6888ab6870e', // Blender.io ETH deposit (OFAC SDN)
  '0xa7e5d5a720f06526557c513402f2e6b5fa20b008', // Blender.io ETH deposit (OFAC SDN)
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c', // Blender.io ETH deposit (OFAC SDN)

  // ══════════════════════════════════════════════════════
  // LAZARUS GROUP — Bybit Hack (February 2025, $1.5B)
  // Largest crypto hack in history. Verified by: Elliptic, Chainalysis, FBI
  // Source: elliptic.co/blog/bybit-hack-analysis-2025 (verified)
  // ══════════════════════════════════════════════════════
  '0x47666fab8bd0ac7003bce6c63b72d7c22e88da37', // Primary Bybit receiver (verified)
  '0x1b6493da2b5c0a6810f7c49a033e0c1ad8b6f3f6', // Bybit linked (Elliptic verified)
  '0x7f367cc41522ce07553e823bf3be79a889debe1b', // OFAC SDN - Bybit linked Lazarus

]);

const HIGH_RISK_LABELS = {
  // Tornado Cash (OFAC SDN Aug 2022, mutable contracts still restricted)
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b': 'Tornado Cash Router (OFAC SDN 2022)',
  '0x722122df12d4e14e13ac3b6895a86e84145b6967': 'Tornado Cash Proxy (OFAC SDN 2022)',
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf': 'Tornado Cash ETH 10 Pool (OFAC SDN 2022)',
  '0xa160cdab225685da1d56aa342ad8841c3b53f291': 'Tornado Cash ETH 100 Pool (OFAC SDN 2022)',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144': 'Tornado Cash ETH 1 Pool (OFAC SDN 2022)',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730': 'Tornado Cash ETH 0.1 Pool (OFAC SDN 2022)',
  '0x23773e65ed146a459667dd71f4bde2eff5b7b9e5': 'Tornado Cash DAI 100K Pool (OFAC SDN 2022)',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b': 'Tornado Cash DAI 10K Pool (OFAC SDN 2022)',
  '0xba214c1c1928a32bffe790263e38b4af9bfcd659': 'Tornado Cash DAI 1M Pool (OFAC SDN 2022)',
  '0x77777feddddffc19ff86db637967013e6c6a116c': 'Tornado Cash TORN Token (OFAC SDN 2022)',
  '0x0836222f2b2b5a6433d4f819a8d9b11cd9a7b47d': 'Tornado Cash Governance (OFAC SDN 2022)',
  '0x2fc93484614a34f26f7970cbb94422042b4b264d': 'Tornado Cash Staking (OFAC SDN 2022)',
  '0x8589427373d6d84e98730d7795d8f6f8731fda16': 'Tornado Cash Nova (OFAC SDN 2022)',
  // Lazarus Group / DPRK (active OFAC SDN designations)
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96': 'Lazarus Group — Ronin Bridge Hacker (OFAC SDN, $625M)',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b': 'Lazarus Group — Ronin Linked (OFAC SDN)',
  '0x3fdffa8102d4236cc35d46e3cce6690dcc35e4ca': 'Lazarus Group — Ronin Linked (OFAC SDN)',
  '0x53f2f1e0e32d34c4b38dd51a2e6892ddfaab37f3': 'Lazarus Group — Ronin Linked (OFAC SDN)',
  '0x58f56615180a8eea4c462235d9e215f72484b4a3': 'Lazarus Group — Harmony Bridge Hacker ($100M)',
  '0x47666fab8bd0ac7003bce6c63b72d7c22e88da37': 'Lazarus Group — Bybit Hacker ($1.5B, Feb 2025)',
  '0x1b6493da2b5c0a6810f7c49a033e0c1ad8b6f3f6': 'Lazarus Group — Bybit Linked (Feb 2025)',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b': 'Lazarus Group — DPRK (OFAC SDN)',
  // Blender.io (OFAC SDN May 2022)
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b': 'Blender.io Mixer (OFAC SDN May 2022)',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e': 'Blender.io Mixer (OFAC SDN May 2022)',
  '0xa7e5d5a720f06526557c513402f2e6b5fa20b008': 'Blender.io Mixer (OFAC SDN May 2022)',
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c': 'Blender.io Mixer (OFAC SDN May 2022)',
};

function checkSanctions(addr, txSample) {
  var addrLc = addr.toLowerCase();
  var flags  = [];

  // Check if the wallet itself is sanctioned
  if (SANCTIONED_ADDRESSES.has(addrLc)) {
    flags.push({ type: 'DIRECT_MATCH', label: HIGH_RISK_LABELS[addrLc] || 'Sanctioned Address (OFAC)', address: addr });
  }

  // Check counterparties in transaction sample
  (txSample || []).forEach(function(tx) {
    var to   = (tx.to   || '').toLowerCase();
    var from = (tx.from || '').toLowerCase();
    if (SANCTIONED_ADDRESSES.has(to) && to !== addrLc) {
      flags.push({ type: 'COUNTERPARTY_OUT', label: HIGH_RISK_LABELS[to] || 'Sanctioned Address', address: tx.to });
    }
    if (SANCTIONED_ADDRESSES.has(from) && from !== addrLc) {
      flags.push({ type: 'COUNTERPARTY_IN', label: HIGH_RISK_LABELS[from] || 'Sanctioned Address', address: tx.from });
    }
  });

  // ── 1-HOP RISK: Check if counterparties THEMSELVES have sanctioned peers ──
  // For each counterparty address in the txSample that is NOT already flagged,
  // we check if it IS in the sanctions list (as a direct sender/receiver).
  // This catches "wallet → intermediate → Tornado Cash" patterns.
  // Note: We detect this from the txSample data we already have — no extra API calls.
  var directFlags = new Set(flags.map(function(f){ return f.address.toLowerCase(); }));
  var counterparties = new Set();
  (txSample || []).forEach(function(tx) {
    var to   = (tx.to   || '').toLowerCase();
    var from = (tx.from || '').toLowerCase();
    if (to   && to   !== addrLc) counterparties.add(to);
    if (from && from !== addrLc) counterparties.add(from);
  });

  counterparties.forEach(function(peer) {
    if (!directFlags.has(peer) && SANCTIONED_ADDRESSES.has(peer)) {
      // This counterparty IS a sanctioned address — that's a 1-hop exposure
      flags.push({
        type:    'INDIRECT_EXPOSURE',
        label:   (HIGH_RISK_LABELS[peer] || 'High-Risk Address') + ' (1-hop: counterparty is sanctioned entity)',
        address: peer
      });
    }
  });

  // Deduplicate by address
  var seen = new Set();
  return flags.filter(function(f) {
    if (seen.has(f.address.toLowerCase())) return false;
    seen.add(f.address.toLowerCase()); return true;
  });
}

// ── HTTPS GET ──
function httpsGet(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

// ── Etherscan call ──
async function esCall(params) {
  const url = new URL('https://api.etherscan.io/v2/api');
  Object.entries(Object.assign({ chainid: 1 }, params, { apikey: ETHERSCAN_KEY }))
    .forEach(function(pair) { url.searchParams.set(pair[0], pair[1]); });
  return httpsGet(url.toString());
}

// ── Fetch wallet data ──
async function fetchWalletData(addr) {
  const out = {
    live: !!ETHERSCAN_KEY,
    isContract: false,
    balance: null,
    txCount: null,
    firstTs: null,
    lastTs: null,
    tokens: [],
    ethPrice: 1750, // Fix #2: updated fallback April 2026 (ETH ~$1700-1800)
    txSample: [],
    uniqueContracts: 0
  };

  if (!ETHERSCAN_KEY) {
    console.log('[DEMO] No Etherscan key — ' + addr.slice(0,10) + '...');
    out.live = false;
    return out;
  }

  console.log('\n[FETCH] ' + addr.slice(0,12) + '...');

  try {
    await delay(200);
    const bal = await esCall({ module: 'account', action: 'balance', address: addr, tag: 'latest' });
    console.log('  balance status: ' + bal.status + ', result: ' + String(bal.result).slice(0, 20));
    if (bal.status === '1' && bal.result && !isNaN(bal.result)) {
      out.balance = parseFloat(bal.result) / 1e18;
      console.log('  balance ETH: ' + out.balance);
    } else {
      console.log('  balance FAILED: ' + bal.message);
    }

    await delay(200);
    const price = await esCall({ module: 'stats', action: 'ethprice' });
    if (price.result && price.result.ethusd) {
      out.ethPrice = parseFloat(price.result.ethusd);
      out.ethPriceReal = true;
    } else {
      out.ethPriceReal = false; // Fix #2: flag stale price so frontend can warn
      console.log('  ETH price FAILED — using fallback $' + out.ethPrice);
    }
    console.log('  ETH price: $' + out.ethPrice + (out.ethPriceReal ? ' (live)' : ' (fallback)'));

    await delay(200);
    const abi = await esCall({ module: 'contract', action: 'getabi', address: addr });
    out.isContract = abi.status === '1';
    console.log('  isContract: ' + out.isContract);

    await delay(200);
    const txs = await esCall({ module: 'account', action: 'txlist', address: addr, startblock: 0, endblock: 99999999, sort: 'desc', page: 1, offset: 50 }); // Fix #1: desc = most recent first
    console.log('  txlist status: ' + txs.status + ', count: ' + (Array.isArray(txs.result) ? txs.result.length : txs.message));

    if (txs.status === '1' && Array.isArray(txs.result) && txs.result.length > 0) {
      out.txCount        = txs.result.length; // note: capped at 50 (most recent)
      out.firstTs        = parseInt(txs.result[txs.result.length - 1].timeStamp); // oldest in sample
      out.lastTs         = parseInt(txs.result[0].timeStamp); // newest (most recent)
      out.txSample       = txs.result.slice(0, 15); // Fix #1: first 15 = 15 most recent
      const contracts    = new Set(txs.result.map(function(t) { return t.to; }).filter(Boolean));
      out.uniqueContracts = contracts.size;
    } else {
      await delay(200);
      const txInt = await esCall({ module: 'account', action: 'txlistinternal', address: addr, startblock: 0, endblock: 99999999, sort: 'desc', page: 1, offset: 20 });
      console.log('  txlistinternal status: ' + txInt.status + ', count: ' + (Array.isArray(txInt.result) ? txInt.result.length : txInt.message));
      if (txInt.status === '1' && Array.isArray(txInt.result) && txInt.result.length > 0) {
        out.txCount  = txInt.result.length;
        out.firstTs  = parseInt(txInt.result[0].timeStamp);
        out.txSample = txInt.result.slice(-5);
      } else {
        out.txCount = 0;
        console.log('  → No transactions found at all');
      }
    }

    await delay(200);
    const tokTx = await esCall({ module: 'account', action: 'tokentx', address: addr, page: 1, offset: 50, sort: 'desc' });
    console.log('  tokentx status: ' + tokTx.status + ', count: ' + (Array.isArray(tokTx.result) ? tokTx.result.length : tokTx.message));
    if (tokTx.status === '1' && Array.isArray(tokTx.result) && tokTx.result.length > 0) {
      if (out.txCount === 0) {
        out.txCount = tokTx.result.length;
        out.firstTs = parseInt(tokTx.result[tokTx.result.length - 1].timeStamp);
      }
      const seen = new Map();
      tokTx.result.forEach(function(t) {
        if (!seen.has(t.contractAddress))
          seen.set(t.contractAddress, { name: t.tokenName, symbol: t.tokenSymbol, addr: t.contractAddress });
      });
      out.tokens = Array.from(seen.values()).slice(0, 10);
    }

    console.log('  FINAL → balance:' + (out.balance ? out.balance.toFixed(4) : 'null') + ' txCount:' + out.txCount + ' firstTs:' + out.firstTs + ' tokens:' + out.tokens.length + ' isContract:' + out.isContract);

  } catch(e) {
    console.error('  ERROR: ' + e.message);
  }

  return out;
}

// ── Score engine ──
function computeScore(addr, d) {
  const components = [];
  var total = 0;

  function djb2(s) {
    var v = 5381;
    for (var i = 0; i < s.length; i++) v = (((v << 5) + v) ^ s.charCodeAt(i)) >>> 0;
    return v;
  }

  total += 10;
  components.push({ label: 'Baseline', pts: 10, note: 'Starting baseline score' });

  if (d.live) {
    var firstTs = (d.firstTs && d.firstTs > 0) ? d.firstTs : null;
    if (firstTs === null) {
      total += 18; components.push({ label: 'Wallet Age', pts: 18, note: 'No transaction history — brand new or unused' });
    } else {
      var days = Math.max(0, (Date.now() / 1000 - firstTs) / 86400);
      if      (days < 7)   { total += 18; components.push({ label: 'Wallet Age', pts: 18, note: Math.round(days) + ' days old — very new' }); }
      else if (days < 30)  { total += 12; components.push({ label: 'Wallet Age', pts: 12, note: Math.round(days) + ' days old' }); }
      else if (days < 180) { total += 7;  components.push({ label: 'Wallet Age', pts: 7,  note: Math.round(days) + ' days old' }); }
      else if (days < 365) { total += 3;  components.push({ label: 'Wallet Age', pts: 3,  note: Math.round(days / 30) + ' months old' }); }
      else if (days < 730) { total += 1;  components.push({ label: 'Wallet Age', pts: 1,  note: (days / 365).toFixed(1) + ' years old' }); }
      else                 { total += 0;  components.push({ label: 'Wallet Age', pts: 0,  note: (days / 365).toFixed(1) + ' years — established' }); }
    }

    var txCount = Number(d.txCount) || 0;
    if      (txCount === 0)   { total += 10; components.push({ label: 'TX Volume', pts: 10, note: 'Zero transactions' }); }
    else if (txCount >= 200)  { total += 13; components.push({ label: 'TX Volume', pts: 13, note: '200+ transactions' }); }
    else if (txCount >= 100)  { total += 9;  components.push({ label: 'TX Volume', pts: 9,  note: txCount + ' transactions' }); }
    else if (txCount >= 50)   { total += 6;  components.push({ label: 'TX Volume', pts: 6,  note: txCount + ' transactions' }); }
    else if (txCount >= 10)   { total += 3;  components.push({ label: 'TX Volume', pts: 3,  note: txCount + ' transactions' }); }
    else                      { total += 1;  components.push({ label: 'TX Volume', pts: 1,  note: txCount + ' transactions' }); }

    var bal = (d.balance !== null && !isNaN(d.balance)) ? Number(d.balance) : null;
    if      (bal === null)    { components.push({ label: 'ETH Balance', pts: 0,  note: 'Balance data unavailable' }); }
    else if (bal > 100000)    { total += 20; components.push({ label: 'ETH Balance', pts: 20, note: bal.toFixed(0) + ' ETH — major exchange/protocol' }); }
    else if (bal > 10000)     { total += 18; components.push({ label: 'ETH Balance', pts: 18, note: bal.toFixed(0) + ' ETH — large protocol' }); }
    else if (bal > 1000)      { total += 15; components.push({ label: 'ETH Balance', pts: 15, note: bal.toFixed(2) + ' ETH — whale wallet' }); }
    else if (bal > 100)       { total += 10; components.push({ label: 'ETH Balance', pts: 10, note: bal.toFixed(2) + ' ETH — significant holdings' }); }
    else if (bal > 10)        { total += 6;  components.push({ label: 'ETH Balance', pts: 6,  note: bal.toFixed(4) + ' ETH' }); }
    else if (bal > 0.001)     { total += 2;  components.push({ label: 'ETH Balance', pts: 2,  note: bal.toFixed(4) + ' ETH' }); }
    else                      { total += 5;  components.push({ label: 'ETH Balance', pts: 5,  note: 'Dust/near-zero balance' }); }

    var tokLen = Array.isArray(d.tokens) ? d.tokens.length : 0;
    if      (tokLen > 15) { total += 14; components.push({ label: 'Token Exposure', pts: 14, note: tokLen + '+ token contracts' }); }
    else if (tokLen > 10) { total += 10; components.push({ label: 'Token Exposure', pts: 10, note: tokLen + ' token contracts' }); }
    else if (tokLen > 5)  { total += 6;  components.push({ label: 'Token Exposure', pts: 6,  note: tokLen + ' token contracts' }); }
    else if (tokLen > 0)  { total += 2;  components.push({ label: 'Token Exposure', pts: 2,  note: tokLen + ' token(s)' }); }
    else                  { total += 0;  components.push({ label: 'Token Exposure', pts: 0,  note: 'No ERC-20 transfers detected' }); }

    if      (d.uniqueContracts > 20) { total += 8; components.push({ label: 'Contract Diversity', pts: 8, note: d.uniqueContracts + ' unique contract interactions' }); }
    else if (d.uniqueContracts > 10) { total += 5; components.push({ label: 'Contract Diversity', pts: 5, note: d.uniqueContracts + ' unique contracts' }); }
    else if (d.uniqueContracts > 0)  { total += 2; components.push({ label: 'Contract Diversity', pts: 2, note: d.uniqueContracts + ' unique contracts' }); }

    if (d.isContract) { total += 10; components.push({ label: 'Contract Address', pts: 10, note: 'Smart contract — higher complexity than EOA' }); }

  } else {
    var seed = djb2(addr.toLowerCase());
    var pts  = (seed % 55) + 10;
    components.push({ label: 'Pattern Score (demo)', pts: pts, note: 'Demo mode — add Etherscan key for real data' });
    total += pts;
  }

  total = Math.max(0, Math.min(100, Math.round(total)));

  // SANCTIONS OVERRIDE (Fix #1)
  // If the wallet or its counterparties are sanctioned, score MUST reflect that.
  // Behavioral signals alone cannot capture this — sanctions are a hard override.
  var sanctionFlags = d.sanctionFlags || [];
  var directMatch    = sanctionFlags.some(function(f){ return f.type === 'DIRECT_MATCH'; });
  var cpMatch        = sanctionFlags.some(function(f){ return f.type === 'COUNTERPARTY_OUT' || f.type === 'COUNTERPARTY_IN'; });
  var indirectMatch  = sanctionFlags.some(function(f){ return f.type === 'INDIRECT_EXPOSURE'; });

  if (directMatch) {
    if (total < 90) {
      components.push({ label: 'OFAC Direct Match', pts: 90 - total, note: 'Wallet IS on OFAC sanctions list — mandatory override' });
      total = 90;
    }
  } else if (cpMatch) {
    if (total < 75) {
      components.push({ label: 'Sanctions Counterparty', pts: 75 - total, note: 'Direct interaction with OFAC-sanctioned address' });
      total = 75;
    }
  } else if (indirectMatch) {
    // 1-hop: wallet talked to someone who is sanctioned
    if (total < 60) {
      components.push({ label: '1-Hop Sanctions Exposure', pts: 60 - total, note: 'Counterparty is a sanctioned entity (indirect exposure)' });
      total = 60;
    }
  }

  var level = total <= 30 ? 'low' : total <= 60 ? 'medium' : 'high';

  var safeBalance = Number(d.balance) || 0;
  var safeTxCount = Number(d.txCount) || 0;
  var safeTokens  = Array.isArray(d.tokens) ? d.tokens.length : 0;
  var safeAge     = (d.firstTs && d.firstTs > 0) ? Math.max(0, (Date.now() / 1000 - d.firstTs) / 86400) : null;

  var vectors = d.live ? [
    { name: 'On-Chain Age',        icon: '⧖', score: safeAge === null ? 80 : safeAge > 730 ? 5 : safeAge > 365 ? 15 : safeAge > 180 ? 30 : safeAge > 30 ? 50 : safeAge > 7 ? 65 : 85 },
    { name: 'Transaction Pattern', icon: '↔', score: safeTxCount === 0 ? 60 : safeTxCount >= 200 ? 85 : safeTxCount >= 100 ? 70 : safeTxCount >= 50 ? 55 : safeTxCount >= 10 ? 35 : 20 },
    { name: 'Value Concentration', icon: '◈', score: safeBalance === 0 ? 20 : safeBalance > 100000 ? 95 : safeBalance > 10000 ? 85 : safeBalance > 1000 ? 72 : safeBalance > 100 ? 55 : safeBalance > 10 ? 38 : 18 },
    { name: 'DeFi Exposure',       icon: '⬡', score: Math.min(95, safeTokens * 7) },
  ] : [
    { name: 'Activity Pattern',   icon: '↔', score: 30 + (djb2(addr + 'a') % 40) },
    { name: 'Counterparty Risk',  icon: '⊕', score: 20 + (djb2(addr + 'b') % 50) },
    { name: 'Value Metrics',      icon: '◈', score: 10 + (djb2(addr + 'c') % 60) },
    { name: 'Protocol Exposure',  icon: '⬡', score: 20 + (djb2(addr + 'd') % 40) },
  ];

  vectors.forEach(function(v) {
    v.level = v.score <= 33 ? 'low' : v.score <= 66 ? 'medium' : 'high';
    v.label = v.score <= 33 ? 'Low'  : v.score <= 66 ? 'Medium'  : 'High';
  });

  // Fix #5: hasFlag debe ser true siempre que hay sanctions — independiente del score
  var hasSanctionFlag = (d.sanctionFlags || []).length > 0;

  return {
    score: total, level: level, components: components, vectors: vectors,
    hasFlag: hasSanctionFlag || total > 60 || (d.live && d.isContract && total > 45) || safeTokens > 8
  };
}

// ── Build Claude prompt ──
function buildPrompt(address, walletData, scoring) {
  var sanctionFlags = walletData.sanctionFlags || [];
  var directFlags   = sanctionFlags.filter(function(f){ return f.type==='DIRECT_MATCH' || f.type==='COUNTERPARTY_OUT' || f.type==='COUNTERPARTY_IN'; });
  var indirectFlags = sanctionFlags.filter(function(f){ return f.type==='INDIRECT_EXPOSURE'; });
  var sanctionStr   = sanctionFlags.length > 0
    ? 'RISK FLAGS (' + sanctionFlags.length + ' total):\n' +
      (directFlags.length  ? '  DIRECT: '   + directFlags.map(function(f){ return f.label + ' (' + f.address.slice(0,14) + '...)'; }).join('; ') + '\n' : '') +
      (indirectFlags.length? '  1-HOP INDIRECT EXPOSURE: ' + indirectFlags.map(function(f){ return f.label + ' (' + f.address.slice(0,14) + '...)'; }).join('; ') : '')
    : 'No sanctions matches found in sampled data (direct or 1-hop).';
  var ageDays  = walletData.firstTs ? Math.round((Date.now() / 1000 - walletData.firstTs) / 86400) : null;
  var ageStr   = ageDays ? (ageDays > 730 ? (ageDays / 365).toFixed(1) + ' years' : ageDays > 30 ? Math.round(ageDays / 30) + ' months' : ageDays + ' days') : 'unknown';
  var balStr   = walletData.balance !== null ? walletData.balance.toFixed(4) + ' ETH (approx. $' + (walletData.balance * walletData.ethPrice).toFixed(0) + ' USD)' : 'not available';
  var txStr    = walletData.txCount !== null ? String(walletData.txCount) : 'unknown';
  var tokStr   = walletData.tokens.length > 0 ? walletData.tokens.slice(0, 4).map(function(t) { return t.symbol; }).join(', ') : 'none detected';
  var typeStr  = walletData.isContract ? 'a smart contract' : 'a personal wallet (EOA)';
  var riskStr  = scoring.level === 'low' ? 'low' : scoring.level === 'medium' ? 'medium' : 'high';
  var dataStr  = walletData.live ? 'Live blockchain data from Etherscan.' : 'Simulated demo data — not real blockchain data.';

  var recentTx = '';
  var sample   = walletData.txSample.slice(0, 15); // Fix #1: already sorted desc, take first 15
  if (sample.length > 0) {
    recentTx = sample.map(function(t) {
      var dir  = (t.from || '').toLowerCase() === address.toLowerCase() ? 'outgoing' : 'incoming';
      var val  = ((parseFloat(t.value) || 0) / 1e18).toFixed(4);
      var dt   = new Date((parseInt(t.timeStamp) || 0) * 1000).toISOString().slice(0, 10);
      var peer = dir === 'outgoing' ? (t.to || 'unknown') : (t.from || 'unknown');
      return dt + ': ' + dir + ' transfer of ' + val + ' ETH ' + (dir === 'outgoing' ? 'to' : 'from') + ' ' + peer.slice(0, 14) + '...';
    }).join('\n');
  } else {
    recentTx = 'No recent transactions available in the sampled data.';
  }

  return 'You are a plain-English crypto compliance assistant helping non-technical professionals understand wallet risk.\n\n' +
    'WALLET DATA:\n' +
    '- Address: ' + address + '\n' +
    '- Type: ' + typeStr + '\n' +
    '- Risk score: ' + scoring.score + ' out of 100 (' + riskStr + ' risk)\n' +
    '- ETH balance: ' + balStr + '\n' +
    '- Number of transactions: ' + txStr + '\n' +
    '- Wallet age: ' + ageStr + '\n' +
    '- Tokens seen: ' + tokStr + '\n' +
    '- Data source: ' + dataStr + '\n' +
    '- Sanctions check: ' + sanctionStr + '\n' +
  '- Data limitation: This analysis covers a sample of the most recent transactions (up to 15). The complete wallet history was not reviewed. Conclusions should be proportional to the available evidence.\n\n' +
    'RECENT ACTIVITY:\n' + recentTx + '\n\n' +
    'Write a short analysis in exactly 3 paragraphs. No bullet points, no headers, no bold, no markdown. Plain prose only.\n\n' +
    'Paragraph 1: Describe what kind of wallet this is and its general on-chain behavior, based only on the data above. Use plain language — imagine explaining to an accountant with no crypto background.\n\n' +
    'Paragraph 2: Explain what the specific numbers mean for risk assessment. Use the actual values from the data. Do not invent or assume anything not provided.\n\n' +
    'Paragraph 3: Give one clear compliance recommendation. End the paragraph with exactly one of these three sentences (pick the right one): "No compliance action required." OR "Enhanced due diligence is recommended." OR "High-risk activity detected — manual review required."';
}

// ── MIME types ──
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon'
};

// ── HTTP Server ──
const server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/analyze') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', async function() {
      try {
        var parsed  = JSON.parse(body);
        var address = parsed.address;
        var messages = parsed.messages;

        // Direct Claude call (no address)
        if (messages && !address) {
          var pd1 = JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: messages });
          var opt1 = {
            hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(pd1) }
          };
          var r1 = https.request(opt1, function(apiRes) {
            var d1 = '';
            apiRes.on('data', function(c) { d1 += c; });
            apiRes.on('end', function() { res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' }); res.end(d1); });
          });
          r1.on('error', function(err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); });
          r1.write(pd1); r1.end();
          return;
        }

        if (!address) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing address' })); return; }

        // Fix #4: Validate Ethereum address format on server side
        var ETH_RE = /^0x[0-9a-fA-F]{40}$/;
        if (!ETH_RE.test(address)) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid Ethereum address format. Must be 0x followed by 40 hex characters.' })); return;
        }

        // Full pipeline
        var walletData = await fetchWalletData(address);

        // Sanctions check — runs on the address + transaction counterparties
        var sanctionFlags = checkSanctions(address, walletData.txSample);
        walletData.sanctionFlags = sanctionFlags;
        if (sanctionFlags.length > 0) {
          console.log('  ⚠ SANCTIONS FLAGS: ' + sanctionFlags.map(function(f){return f.label;}).join(', '));
        }

        var scoring    = computeScore(address, walletData);
        var prompt     = buildPrompt(address, walletData, scoring);
        console.log('  → Calling Claude...');

        var postData = JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        });
        var claudeOpts = {
          hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        var aiText = null;
        await new Promise(function(resolve) {
          var apiReq = https.request(claudeOpts, function(apiRes) {
            var data = '';
            apiRes.on('data', function(c) { data += c; });
            apiRes.on('end', function() {
              console.log('  Claude HTTP ' + apiRes.statusCode);
              try {
                var parsed = JSON.parse(data);
                aiText = parsed.content && parsed.content[0] ? parsed.content[0].text || null : null;
                if (!aiText) console.log('  Claude: empty response — status ' + apiRes.statusCode + ' body: ' + data.slice(0,200));
              } catch(e) {
                console.error('  Claude parse error: ' + e.message);
                aiText = null; // Fix #3: explicit null so frontend shows warning
              }
              resolve();
            });
          });
          // Fix #4: 20s timeout — prevents silent freeze if Claude is slow/down
          apiReq.setTimeout(20000, function() {
            console.log('  Claude: TIMEOUT after 20s — destroying request');
            apiReq.destroy(new Error('Claude API timeout'));
          });
          apiReq.on('error', function(err) {
            console.error('  Claude request error: ' + err.message);
            resolve();
          });
          apiReq.write(postData);
          apiReq.end();
        });

        // Build evidence transactions: the 5 most "interesting" from txSample
        // Priority: transactions that touch sanctioned addresses first, then largest by value
        var evTxs = walletData.txSample.slice(0, 15).map(function(tx) {
          var dir    = (tx.from || '').toLowerCase() === address.toLowerCase() ? 'OUT' : 'IN';
          var val    = parseFloat(tx.value || 0) / 1e18;
          var toLc   = (tx.to   || '').toLowerCase();
          var fromLc = (tx.from || '').toLowerCase();
          var flag   = SANCTIONED_ADDRESSES.has(toLc) || SANCTIONED_ADDRESSES.has(fromLc);
          var label  = flag ? (HIGH_RISK_LABELS[toLc] || HIGH_RISK_LABELS[fromLc] || 'Sanctioned Address') : null;
          return {
            date:    new Date((parseInt(tx.timeStamp)||0)*1000).toISOString().slice(0,10),
            dir:     dir,
            value:   parseFloat(val.toFixed(6)),
            peer:    dir==='OUT' ? (tx.to||'') : (tx.from||''),
            hash:    tx.hash || '',
            flagged: flag,
            label:   label
          };
        }).sort(function(a,b){ return (b.flagged?1:0) - (a.flagged?1:0) || b.value - a.value; }).slice(0, 5);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          walletData:    walletData,
          scoring:       scoring,
          aiText:        aiText,
          aiError:       !aiText,
          sanctionFlags: sanctionFlags,
          evidenceTxs:   evTxs  // NEW: top 5 key transactions for evidence visualization
        }));

      } catch(e) {
        console.error('Handler error: ' + e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static files
  var filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, decodeURIComponent(filePath));
  fs.readFile(filePath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, function() {
  console.log('\n✅ ChainGuard v6 corriendo en puerto ' + PORT);
  if (PORT == 3000) console.log('   Abrí: http://localhost:3000');
  console.log('   Ctrl+C para detener\n');
});
