import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createSignaling } from '../p2p-signaling.cjs';

const routes = new Set(['/p2p/create', '/p2p/join', '/p2p/poll', '/p2p/signal', '/p2p/leave']);
const json = (status, error, headers = {}) => new Response(JSON.stringify({error}), {
  status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers},
});

export default {
  async fetch(request, env) {
    let allowed;
    try {
      const url = new URL(env.PUBLIC_ORIGIN);
      if (url.origin !== env.PUBLIC_ORIGIN || !['https:', 'http:'].includes(url.protocol)) throw Error();
      allowed = url.origin;
    } catch { return json(503, 'Configure PUBLIC_ORIGIN'); }
    const cors = {'Vary': 'Origin'};
    if (request.headers.get('Origin') !== allowed) return json(403, 'Origin mismatch', cors);
    cors['Access-Control-Allow-Origin'] = allowed;
    if (!routes.has(new URL(request.url).pathname)) return json(405, 'Signaling operation not allowed', cors);
    if (request.method === 'OPTIONS') {
      const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
      if (request.headers.get('Access-Control-Request-Method') !== 'POST' || headers.some(h => !['content-type', 'authorization'].includes(h))) {
        return json(403, 'Preflight rejected', cors);
      }
      return new Response(null, {status: 204, headers: {...cors, 'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization'}});
    }
    if (request.method !== 'POST' || !request.headers.get('Content-Type')?.startsWith('application/json')) {
      return json(405, 'JSON POST required', cors);
    }
    // Bound the stream before entering the object lock; never await an unbounded body there.
    const chunks = []; let size = 0;
    try {
      if (request.body) for await (const chunk of request.body) {
        size += chunk.byteLength;
        if (size > 48 * 1024) return json(413, 'Signaling message too large', cors);
        chunks.push(chunk);
      }
      const headers = new Headers(request.headers);
      // Cloudflare supplies this header; never accept a caller's forwarded-for value.
      headers.set('X-Signaling-IP', request.headers.get('CF-Connecting-IP') || 'unknown');
      const stub = env.SIGNALING.get(env.SIGNALING.idFromName('cat-fighter-v1'));
      const response = await stub.fetch(new Request(request.url, {method: 'POST', headers, body: Buffer.concat(chunks)}));
      const out = new Response(response.body, response);
      for (const [key, value] of Object.entries(cors)) out.headers.set(key, value);
      return out;
    } catch { return json(503, 'Signaling service unavailable', cors); }
  },
};

// Map interface for the existing protocol. Only accessed rooms are decoded.
// Split JSON into small SQL rows, including worst-case escaped Unicode SDP.
// The iterator needs only expiry metadata for the protocol's prune operation.
class StoredMap {
  constructor(sql, name) { this.sql = sql; this.name = name; this.cache = new Map(); this.deleted = new Set(); }
  get size() { return this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE kind = ?', this.name).one().n - this.deleted.size; }
  has(key) { if (this.deleted.has(key)) return false; if (this.cache.has(key)) return true; return this.sql.exec('SELECT key FROM entries WHERE kind = ? AND key = ?', this.name, key).toArray().length > 0; }
  get(key) {
    if (this.cache.has(key)) return this.cache.get(key).value;
    if (!this.has(key)) return undefined;
    const before = this.sql.exec('SELECT value FROM chunks WHERE kind = ? AND key = ? ORDER BY part', this.name, key).toArray().map(r => r.value).join('');
    const value = JSON.parse(before); this.cache.set(key, {before, value}); return value;
  }
  set(key, value) { this.deleted.delete(key); this.cache.set(key, {before: null, value}); return this; }
  delete(key) {
    this.cache.delete(key);
    this.deleted.add(key);
  }
  *[Symbol.iterator]() {
    for (const row of this.sql.exec('SELECT key, metadata FROM entries WHERE kind = ?', this.name).toArray()) yield [row.key, JSON.parse(row.metadata)];
  }
  write(key, value) {
    const serialized = JSON.stringify(value);
    this.sql.exec('INSERT OR REPLACE INTO entries VALUES (?, ?, ?)', this.name, key,
      JSON.stringify(this.name === 'rooms' ? {updated: value.updated, ends: value.ends} : {start: value.start}));
    this.sql.exec('DELETE FROM chunks WHERE kind = ? AND key = ?', this.name, key);
    for (let offset = 0, part = 0; offset < serialized.length; part++) {
      let end = Math.min(offset + 16000, serialized.length);
      // SQL encodes text as UTF-8; never split a UTF-16 surrogate pair across rows.
      const last = serialized.charCodeAt(end - 1);
      if (end < serialized.length && last >= 0xd800 && last <= 0xdbff) end--;
      this.sql.exec('INSERT INTO chunks VALUES (?, ?, ?, ?)', this.name, key, part, serialized.slice(offset, end));
      offset = end;
    }
    this.cache.set(key, {before: serialized, value});
  }
  flush() {
    for (const key of this.deleted) {
      this.sql.exec('DELETE FROM chunks WHERE kind = ? AND key = ?', this.name, key);
      this.sql.exec('DELETE FROM entries WHERE kind = ? AND key = ?', this.name, key);
    }
    this.deleted.clear();
    for (const [key, {before, value}] of this.cache) if (before !== JSON.stringify(value)) this.write(key, value);
  }
}

export class SignalingRooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS entries (kind TEXT, key TEXT, metadata TEXT, PRIMARY KEY(kind, key)); CREATE TABLE IF NOT EXISTS chunks (kind TEXT, key TEXT, part INTEGER, value TEXT, PRIMARY KEY(kind, key, part))');
  }
  async fetch(request) {
    // This endpoint is reachable only through the Worker binding.
    const body = Buffer.from(await request.arrayBuffer());
    return this.ctx.blockConcurrencyWhile(async () => {
      const rooms = new StoredMap(this.ctx.storage.sql, 'rooms'), attempts = new StoredMap(this.ctx.storage.sql, 'attempts');
      const service = createSignaling({origin: this.env.PUBLIC_ORIGIN, rooms, attempts});
      const req = {url: request.url, method: request.method, headers: Object.fromEntries(request.headers),
        socket: {remoteAddress: request.headers.get('X-Signaling-IP')}, async *[Symbol.asyncIterator]() { yield body; }};
      let status, headers, result;
      const res = {writeHead(s, h) { status = s; headers = h; }, end(v) { result = v; }};
      // Protocol execution has no external I/O. Commit all mutations before reply.
      await service.handle(req, res);
      this.ctx.storage.transactionSync(() => { rooms.flush(); attempts.flush(); });
      await this.ctx.storage.setAlarm(Date.now() + 121000);
      return new Response(result, {status, headers});
    });
  }
  async alarm() {
    // Recheck timestamps: an alarm may already be queued when a request arrives.
    const rooms = new StoredMap(this.ctx.storage.sql, 'rooms'), attempts = new StoredMap(this.ctx.storage.sql, 'attempts');
    const now = Date.now();
    for (const [key, value] of rooms) if (now - value.updated > 120000 || now > value.ends) rooms.delete(key);
    for (const [key, value] of attempts) if (now - value.start > 60000) attempts.delete(key);
    this.ctx.storage.transactionSync(() => { rooms.flush(); attempts.flush(); });
    if (rooms.size || attempts.size) await this.ctx.storage.setAlarm(now + 121000);
  }
}
