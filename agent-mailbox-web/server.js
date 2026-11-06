import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
const roles = Object.fromEntries([
  ['reader', 'READER_TOKEN'], ['Barb', 'BARB_TOKEN'],
  ['Hoss', 'HOSS_TOKEN'], ['Gab', 'GAB_TOKEN'],
].map(([role, key]) => [role, process.env[key] || '']));
if (!databaseUrl || Object.values(roles).some(x => x.length < 24) ||
    new Set(Object.values(roles)).size !== 4) {
  throw new Error('DATABASE_URL and four distinct tokens of at least 24 characters are required');
}
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 10000 });
await pool.query(`CREATE TABLE IF NOT EXISTS agent_mailbox_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender TEXT NOT NULL CHECK (sender IN ('Barb', 'Hoss', 'Gab')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`);

function roleFor(request) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const supplied = Buffer.from(header.slice(7));
  for (const [role, secret] of Object.entries(roles)) {
    const expected = Buffer.from(secret);
    if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) return role;
  }
  return null;
}
function respond(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
async function bodyOf(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16000) throw new Error('Message too large');
  }
  return JSON.parse(raw);
}
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/healthz' && request.method === 'GET') {
      await pool.query('SELECT 1');
      return respond(response, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) {
      const role = roleFor(request);
      if (!role) return respond(response, 401, { error: 'Invalid token' });
      if (url.pathname === '/api/messages' && request.method === 'GET') {
        const after = url.searchParams.get('after') || '0';
        if (!/^(0|[1-9]\d{0,18})$/.test(after)) return respond(response, 400, { error: 'Invalid cursor' });
        const result = await pool.query('SELECT id::text, sender, body, created_at FROM agent_mailbox_messages WHERE id > $1 ORDER BY id ASC LIMIT 200', [after]);
        return respond(response, 200, { messages: result.rows });
      }
      if (url.pathname === '/api/messages' && request.method === 'POST') {
        if (role === 'reader') return respond(response, 403, { error: 'Read-only token' });
        let data;
        try { data = await bodyOf(request); } catch { return respond(response, 400, { error: 'Invalid JSON or message too large' }); }
        if (typeof data?.body !== 'string' || !data.body.trim() || data.body.length > 12000) return respond(response, 400, { error: 'Body must contain 1 to 12000 characters' });
        const result = await pool.query('INSERT INTO agent_mailbox_messages(sender, body) VALUES($1, $2) RETURNING id::text, sender, body, created_at', [role, data.body.trim()]);
        return respond(response, 201, { message: result.rows[0] });
      }
      return respond(response, 404, { error: 'Not found' });
    }
    if (request.method === 'GET' && assets[url.pathname]) {
      const [name, mime] = assets[url.pathname];
      const data = await readFile(path.join(directory, name));
      response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return response.end(data);
    }
    respond(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Request failed', error);
    if (!response.headersSent) respond(response, 500, { error: 'Server error' });
  }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');

