'use strict';
// Dependency-free LAN relay. The P1 browser owns the simulation.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomBytes} = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const token = () => randomBytes(24).toString('hex');
function createLanServer({handleRequest}={}) {
  const rooms = new Map();
  const send = (peer, type, data) => {
    const out = peer?.stream;
    if (!out || out.destroyed || out.writableEnded) return;
    if (out.writableLength > 1024 * 1024) { out.destroy(); return; }
    out.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const presence = room => {
    const connected = peer => !!peer?.stream && !peer.stream.destroyed && !peer.stream.writableEnded;
    const data = {host: connected(room.host), guest: connected(room.guest)};
    send(room.host, 'presence', data); send(room.guest, 'presence', data);
  };
  const closeRoom = (code, room) => {
    for (const peer of [room.host, room.guest]) {
      send(peer, 'ended', {}); peer?.stream?.end();
    }
    rooms.delete(code);
  };
  const reply = (res, status, data) => {
    res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (handleRequest && await handleRequest(req,res)) return;
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/lan/')) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(res,403,{error:'Origin mismatch'});
        if (url.pathname === '/lan/info' && req.method === 'GET') {
          const port = server.address().port;
          const addresses = Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal).map(a=>`http://${a.address}:${port}`);
          return reply(res,200,{addresses});
        }
        if (url.pathname === '/lan/rooms' && req.method === 'GET') {
          const available = [...rooms].filter(([,room]) => room.host.stream && !room.host.stream.destroyed && !room.host.stream.writableEnded && !room.guest);
          return reply(res,200,{rooms:available.map(([code])=>({code}))});
        }
        let body = {};
        if (req.method === 'POST') {
          if (!req.headers['content-type']?.startsWith('application/json')) return reply(res,415,{error:'JSON required'});
          let data = '';
          for await (const chunk of req) {
            data += chunk;
            if (Buffer.byteLength(data) > 512 * 1024) return reply(res,413,{error:'Message too large'});
          }
          try { body = JSON.parse(data); } catch { return reply(res,400,{error:'Invalid message format'}); }
          if (!body || typeof body !== 'object') return reply(res,400,{error:'Invalid message format'});
        }
        if (url.pathname === '/lan/create' && req.method === 'POST') {
          if (rooms.size >= 32) return reply(res,429,{error:'Server full. Try again later'});
          let code; do { code=randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
          const host={token:token(),stream:null};
          rooms.set(code,{host,guest:null,updated:Date.now(),state:null});
          return reply(res,200,{code,token:host.token,role:'host'});
        }
        const code = String(body.code || url.searchParams.get('code') || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return reply(res,404,{error:'Room not found. Check the room code'});
        if (url.pathname === '/lan/join' && req.method === 'POST') {
          if (room.guest) return reply(res,409,{error:'Room already has a P2'});
          room.guest={token:token(),stream:null}; room.updated=Date.now();
          return reply(res,200,{code,token:room.guest.token,role:'guest'});
        }
        const secret = req.headers.authorization?.replace(/^Bearer /,'') || url.searchParams.get('token');
        const role = secret === room.host.token ? 'host' : secret === room.guest?.token ? 'guest' : null;
        if (!role) return reply(res,403,{error:'Invalid room credentials'});
        const peer = room[role];
        room.updated=Date.now();
        if (url.pathname === '/lan/events' && req.method === 'GET') {
          peer.stream?.end();
          res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.flushHeaders(); peer.stream=res; presence(room);
          if (role === 'guest' && room.state) send(peer,'state',room.state);
          res.on('close',()=>{if(peer.stream===res){peer.stream=null;presence(room);}});
          return;
        }
        if (url.pathname === '/lan/leave' && req.method === 'POST') {
          if (role === 'host') closeRoom(code,room);
          else {peer.stream?.end();room.guest=null;presence(room);}
          return reply(res,200,{});
        }
        if (url.pathname === '/lan/state' && req.method === 'POST' && role === 'host') {
          if (!body.state || !Array.isArray(body.state.players)) return reply(res,400,{error:'Missing game state'});
          room.state=body.state; send(room.guest,'state',body.state);
          return reply(res,200,{});
        }
        if (url.pathname === '/lan/input' && req.method === 'POST' && role === 'guest') {
          const axis = v => Number.isFinite(v) ? Math.max(-1,Math.min(1,v)) : 0;
          const target = body.input?.target;
          send(room.host,'input',{
            x:axis(body.input?.x),y:axis(body.input?.y),fire:body.input?.fire===true,
            target:target && Number.isFinite(target.x)&&Number.isFinite(target.y) ? {x:Math.max(24,Math.min(576,target.x)),y:Math.max(60,Math.min(775,target.y))} : null,
            actions:Array.isArray(body.actions)?body.actions.filter(a=>['bomb','rejoin','pause','aircraft-0','aircraft-1','confirm-aircraft','cancel-aircraft'].includes(a)).slice(0,8):[]
          });
          return reply(res,200,{});
        }
        return reply(res,405,{error:'Operation not allowed'});
      }
      if (!['GET','HEAD'].includes(req.method)) return reply(res,405,{error:'Operation not allowed'});
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (name.split('/').some(part=>part==='..'||part==='.')) return reply(res,403,{error:'Access denied'});
      if (!/^\/(index\.html|style\.css|game\.js|src\/[\w./-]+|assets\/[\w./-]+)$/.test(name)) return reply(res,404,{error:'File not found'});
      const file = path.resolve(ROOT, '.'+name);
      if (!file.startsWith(ROOT+path.sep)) return reply(res,403,{error:'Access denied'});
      const real = await fs.promises.realpath(file);
      if (real !== file) return reply(res,403,{error:'Access denied'});
      const stat=await fs.promises.stat(real);
      if (!stat.isFile()) return reply(res,404,{error:'File not found'});
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
      res.writeHead(200,{'Content-Type':mime[path.extname(real)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD') res.end(); else fs.createReadStream(real).on('error',()=>res.destroy()).pipe(res);
    } catch (error) {
      if (!res.headersSent) reply(res,error.code==='ENOENT'?404:400,{error:'Unable to complete request'}); else res.destroy();
    }
  });
  const heartbeat=setInterval(()=>{
    for(const [code,room] of rooms) {
      if(Date.now()-room.updated>30*60*1000) closeRoom(code,room);
      else {send(room.host,'heartbeat',{});send(room.guest,'heartbeat',{});}
    }
  },5000);
  heartbeat.unref();
  server.on('close',()=>clearInterval(heartbeat));
  server.dispose=()=>{for(const [code,room] of rooms) closeRoom(code,room);clearInterval(heartbeat);server.closeAllConnections();};
  return server;
}
if(require.main===module){
  const server=createLanServer();
  server.on('error',e=>{console.error(`Unable to start Wi-Fi co-op: ${e.message}`);process.exitCode=1;});
  server.listen(Number(process.env.PORT||8767),'0.0.0.0',()=>{
    console.log(`CAT FIGHTER Wi-Fi CO-OP\nLocal: http://localhost:${server.address().port}`);
    for(const a of Object.values(os.networkInterfaces()).flat()) if(a.family==='IPv4'&&!a.internal) console.log(`Other devices on the same Wi-Fi: http://${a.address}:${server.address().port}`);
    console.log('Select Wi-Fi CO-OP in the game to create or join a room. Press Ctrl+C to stop the server.');
  });
}
module.exports={createLanServer};
