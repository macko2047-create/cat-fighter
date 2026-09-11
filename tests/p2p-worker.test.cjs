'use strict';
// Runs the production Worker and SQLite Durable Object in real workerd (Miniflare).
const test = require('node:test'), assert = require('node:assert/strict');
const {createRequire} = require('node:module'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dependencies = createRequire(path.resolve(__dirname, '../tools/cloudflare/package.json'));
const {Miniflare, convertV4MiniflareOptions} = dependencies('miniflare'), {build} = dependencies('esbuild');
const origin = 'https://game.example';
let mf, dir, options;
async function post(route, body = {}, token, headers = {}) {
  const response = await mf.dispatchFetch('https://signal.example/p2p/'+route, {method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
    body:typeof body === 'string' ? body : JSON.stringify(body)});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  return {status:response.status, headers:response.headers, ...await response.json()};
}
async function admin() {
  const ns = await mf.getDurableObjectNamespace('SIGNALING'); return ns.get(ns.idFromName('cat-fighter-v1'));
}
async function pair() { const h = await post('create'), g = await post('join',{code:h.code}); assert.equal(h.status,200); assert.equal(g.status,200); return {h,g}; }
const signal = (type = 'offer', sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n') => ({type,id:'a'.repeat(24),...(type==='restart'?{}:{sdp})});
test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(),'cat-worker-test-'));
  require('node:child_process').execFileSync(process.execPath,
    [path.join(path.dirname(dependencies.resolve('wrangler/package.json')),'bin/wrangler.js'),
      'deploy','--dry-run','--config',path.resolve(__dirname,'../tools/cloudflare/wrangler.jsonc'),'--outdir',dir],
    {env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'pipe'});
  const bundled=JSON.stringify(path.join(dir,'signaling-worker.js'));
  // Test-only RPC hooks adjust stored timestamps; no clock overrides or admin route ships.
  const result = await build({stdin:{contents:`
    export {default} from ${bundled};
    import {SignalingRooms} from ${bundled};
    export class TestRooms extends SignalingRooms {
      age(code, field, ms) {
        const sql=this.ctx.storage.sql;
        const value=JSON.parse(sql.exec('SELECT value FROM chunks WHERE kind = ? AND key = ? ORDER BY part','rooms',code).toArray().map(r=>r.value).join(''));
        value[field]=Date.now()-ms;
        this.ctx.storage.transactionSync(()=>{
          sql.exec('UPDATE entries SET metadata = ? WHERE kind = ? AND key = ?',JSON.stringify({updated:value.updated,ends:value.ends}),'rooms',code);
          sql.exec('DELETE FROM chunks WHERE kind = ? AND key = ?','rooms',code);
          const s=JSON.stringify(value);
          for(let i=0;i<s.length;i+=16000)sql.exec('INSERT INTO chunks VALUES (?, ?, ?, ?)','rooms',code,i/16000,s.slice(i,i+16000));
        });
      }
      fill(kind, count) {
        this.ctx.storage.transactionSync(()=>{
          for(let i=0;i<count;i++)this.ctx.storage.sql.exec('INSERT INTO entries VALUES (?, ?, ?)',kind,String(i).padStart(6,'0'),
            JSON.stringify(kind==='rooms'?{updated:Date.now(),ends:Date.now()+100000}:{start:Date.now()}));
        });
      }
      async cleanup() { await this.alarm(); }
      clear() { this.ctx.storage.transactionSync(()=>this.ctx.storage.sql.exec('DELETE FROM entries; DELETE FROM chunks')); }
    }`,resolveDir:path.resolve(__dirname,'..'),loader:'js'},bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers','node:*']});
  options={cf:false,modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-09-11',compatibilityFlags:['nodejs_compat'],
    bindings:{PUBLIC_ORIGIN:origin},durableObjects:{SIGNALING:{className:'TestRooms',useSQLite:true}},resourcePersistencePath:path.join(dir,'state')};
  mf = new Miniflare(convertV4MiniflareOptions(options));
});
test.beforeEach(async () => { await (await admin()).clear(); });
test.after(async () => { await mf?.dispose(); fs.rmSync(dir,{recursive:true,force:true}); });

test('create, invalid room, exclusive concurrent join, host/guest credentials, no gameplay routes', async () => {
  const h = await post('create'); assert.match(h.code,/^\d{6}$/); assert.match(h.token,/^[a-f0-9]{48}$/);
  assert.equal(h.headers.get('Access-Control-Allow-Origin'),origin);
  for(const code of ['bad','12345','xxxxxx']) assert.equal((await post('join',{code})).status,404);
  const joins = await Promise.all([post('join',{code:h.code}),post('join',{code:h.code})]);
  assert.deepEqual(joins.map(r=>r.status).sort(),[200,409]); const g=joins.find(r=>r.status===200);
  assert.notEqual(h.token,g.token);
  for(const token of [undefined,'wrong',h.code]) assert.equal((await post('poll',{code:h.code},token)).status,403);
  for(const token of [h.token,g.token]) assert.equal((await post('poll',{code:h.code},token)).status,200);
  for(const route of ['state','input']) assert.equal((await post(route,{code:h.code},h.token)).status,405);
});
test('offer/answer/restart exchange, role and SDP validation, drain once, queue and signal rate limits', async () => {
  const {h,g}=await pair();
  assert.equal((await post('signal',{code:h.code,signal:signal()},g.token)).status,400);
  assert.equal((await post('signal',{code:h.code,signal:signal('answer')},h.token)).status,400);
  for(const bad of [{...signal(),state:{}},signal('offer','bad'),signal('offer','v=0'+'x'.repeat(32768))]) {
    assert.equal((await post('signal',{code:h.code,signal:bad},h.token)).status,400);
  }
  for(const [sender,receiver,type] of [[h,g,'offer'],[g,h,'answer'],[g,h,'restart']]) {
    assert.equal((await post('signal',{code:h.code,signal:signal(type)},sender.token)).status,200);
    assert.deepEqual((await post('poll',{code:h.code},receiver.token)).signals,[signal(type)]);
    assert.deepEqual((await post('poll',{code:h.code},receiver.token)).signals,[]);
  }
  // A full queue spans many SQL rows. Maximum legal SDP survives persistence exactly.
  const large=signal('offer','v=0'+'x'.repeat(32765));
  for(let i=0;i<16;i++) assert.equal((await post('signal',{code:h.code,signal:large},h.token)).status,200);
  assert.equal((await post('signal',{code:h.code,signal:large},h.token)).status,429);
  assert.deepEqual((await post('poll',{code:h.code},g.token)).signals,Array(16).fill(large));
  let limited=false;
  for(let i=0;i<41;i++) {
    const r=await post('signal',{code:h.code,signal:signal()},h.token);
    if(r.status===429){ assert.equal(r.error,'Too many signals'); limited=true; break; }
    await post('poll',{code:h.code},g.token);
  }
  assert.ok(limited);
});
test('join/idle/absolute expiry, alarm cleanup, leave by either peer', async () => {
  let h=await post('create'); await (await admin()).age(h.code,'expiresAt',1);
  assert.equal((await post('join',{code:h.code})).status,410);
  assert.equal((await post('poll',{code:h.code},h.token)).status,200);
  await (await admin()).age(h.code,'updated',120001);
  assert.equal((await post('poll',{code:h.code},h.token)).status,404);
  h=await post('create'); await (await admin()).age(h.code,'ends',1);
  assert.equal((await post('poll',{code:h.code},h.token)).status,404);
  h=await post('create'); await (await admin()).cleanup();
  assert.equal((await post('poll',{code:h.code},h.token)).status,200,'queued alarm cannot delete fresh room');
  await (await admin()).age(h.code,'updated',120001); await (await admin()).cleanup();
  assert.equal((await post('poll',{code:h.code},h.token)).status,404);
  for(const role of ['h','g']) {const p=await pair(); assert.equal((await post('leave',{code:p.h.code},p[role].token)).status,200); assert.equal((await post('poll',{code:p.h.code},p.h.token)).status,404);}
});
test('CORS rejects foreign/missing origin, validates preflight, JSON and byte limits', async () => {
  for(const Origin of ['https://evil.example','null','']) {
    const r=await post('create',{},null,{Origin}); assert.equal(r.status,403); assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  }
  for(const [method,headers,status] of [['POST','content-type, authorization',204],['GET','content-type',403],['POST','x-extra',403]]) {
    const r=await mf.dispatchFetch('https://signal.example/p2p/poll',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers}});
    assert.equal(r.status,status); assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);
    assert.equal(r.headers.get('Cache-Control'),'no-store');
    if(status===204)assert.equal(r.headers.get('Access-Control-Allow-Headers'),'Content-Type, Authorization');
  }
  assert.equal((await post('create','{')).status,400);
  assert.equal((await post('create','[]')).status,400);
  assert.equal((await post('create',' '.repeat(49153))).status,413);
  assert.equal((await post('create',{},null,{'Content-Type':'text/plain'})).status,405);
});
test('room attempts are bounded and cannot be evaded via caller forwarded-for', async () => {
  for(let i=0;i<30;i++)assert.equal((await post('join',{code:'invalid'},null,{'X-Forwarded-For':String(i),'X-Signaling-IP':String(i)})).status,404);
  assert.equal((await post('create')).status,429);
});
test('global room and attempt-table capacity remain bounded', async () => {
  await (await admin()).fill('rooms',256);
  assert.equal((await post('create')).status,429);
  await (await admin()).clear(); await (await admin()).fill('attempts',4096);
  assert.equal((await post('create')).status,429);
});
test('room, tokens, queued SDP and rate counters survive full runtime restart', async () => {
  const {h,g}=await pair(); const unicode=signal('offer','v=0'+ '🐱'.repeat(10000));
  assert.equal((await post('signal',{code:h.code,signal:unicode},h.token)).status,200);
  await mf.dispose(); mf=new Miniflare(convertV4MiniflareOptions(options));
  assert.deepEqual((await post('poll',{code:h.code},g.token)).signals,[unicode]);
  assert.equal((await post('poll',{code:h.code},h.token)).paired,true);
  assert.equal((await post('join',{code:h.code})).status,409);
  for(let i=0;i<27;i++)assert.equal((await post('join',{code:'invalid'})).status,404);
  assert.equal((await post('create')).status,429);
});
