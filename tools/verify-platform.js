const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const PORT = process.env.VERIFY_PORT || 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function extractCookie(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map(part => part.split(';')[0]).join('; ');
}
function mergeCookie(oldCookie, newCookie) {
  if (!newCookie) return oldCookie || '';
  const jar = new Map();
  for (const chunk of String(oldCookie || '').split(';')) {
    const [k, ...v] = chunk.trim().split('=');
    if (k) jar.set(k, v.join('='));
  }
  for (const chunk of String(newCookie || '').split(';')) {
    const [k, ...v] = chunk.trim().split('=');
    if (k) jar.set(k, v.join('='));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function request(path, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', ...options, headers });
  return { res, cookie: mergeCookie(cookie, extractCookie(res.headers)), text: await res.text().catch(() => '') };
}
async function expectRoute(path, expected, cookie = '') {
  const { res, cookie: nextCookie } = await request(path, {}, cookie);
  const ok = res.status === expected;
  results.push({ route: path, status: res.status, expected, ok });
  if (!ok) throw new Error(`${path} returned ${res.status}, expected ${expected}`);
  return nextCookie;
}
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.status === 200) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('Server did not start in time');
}
async function main() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d.toString(); });
  child.stderr.on('data', d => { log += d.toString(); });

  try {
    await waitForServer();
    await expectRoute('/', 200);
    await expectRoute('/login', 200);
    await expectRoute('/register', 200);

    let userCookie = '';
    const email = `verify-${randomUUID().slice(0, 8)}@example.com`;
    const register = await request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Verify User', email, password: 'password123' }).toString()
    }, userCookie);
    userCookie = register.cookie;
    results.push({ route: 'POST /register', status: register.res.status, expected: 302, ok: register.res.status === 302 });
    if (register.res.status !== 302) throw new Error(`POST /register returned ${register.res.status}`);

    for (const route of ['/app', '/app/games', '/app/game/chicken', '/app/game/aviator', '/app/wallet', '/app/referrals', '/app/vip', '/app/profile', '/app/history', '/api/me']) {
      userCookie = await expectRoute(route, 200, userCookie);
    }

    let adminCookie = '';
    const login = await request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'admin@koadly.local', password: 'admin123' }).toString()
    }, adminCookie);
    adminCookie = login.cookie;
    results.push({ route: 'POST /login admin', status: login.res.status, expected: 302, ok: login.res.status === 302 });
    if (login.res.status !== 302) throw new Error(`Admin login returned ${login.res.status}`);

    for (const route of ['/admin', '/admin/settings', '/admin/users', '/admin/payments', '/admin/referrals', '/admin/bets']) {
      adminCookie = await expectRoute(route, 200, adminCookie);
    }

    console.log('Verification passed. Route summary:');
    for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.route} => ${r.status}`);
  } finally {
    child.kill('SIGTERM');
    await sleep(250);
    if (!child.killed) child.kill('SIGKILL');
    if (process.env.DEBUG_VERIFY_LOG === '1') console.error(log);
  }
}

main().catch(err => {
  console.error('Verification failed:', err.message);
  if (results.length) {
    for (const r of results) console.error(`${r.ok ? '✓' : '✗'} ${r.route} => ${r.status}`);
  }
  process.exit(1);
});
