'use strict';
// Serve the unchanged game/LAN routes plus the separate signaling module.
const {createLanServer}=require('./lan-server.cjs');
const {createSignaling}=require('./p2p-signaling.cjs');
function createP2PServer(options={}) {
  const signaling=createSignaling(options);
  return createLanServer({handleRequest:signaling.handle});
}
if(require.main===module){
  const options={origin:process.env.PUBLIC_ORIGIN};
  if(process.env.ICE_SERVERS)options.iceServers=JSON.parse(process.env.ICE_SERVERS);
  const server=createP2PServer(options);
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(Number(process.env.PORT||8767),process.env.HOST||'127.0.0.1',()=>console.log(`Cat Fighter P2P + LAN: http://localhost:${server.address().port}\nFor public play, serve this app behind HTTPS and set PUBLIC_ORIGIN to its public origin.`));
}
module.exports={createP2PServer};
