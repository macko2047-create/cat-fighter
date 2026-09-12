'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLanServer}=require('../tools/lan-server.cjs');
const {build}=require('../tools/build-pages.cjs');
const repo=path.resolve(__dirname,'..');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cat-cache-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'assets'));
 for(const name of ['style.css','game.js','CNAME','.nojekyll'])fs.writeFileSync(path.join(root,name),'');
 fs.copyFileSync(path.join(repo,'src/rom-version.js'),path.join(root,'src/rom-version.js'));
 fs.writeFileSync(path.join(root,'assets/probe.png'),'unchanged image');
 fs.writeFileSync(path.join(root,'index.html'),'<!-- cat-build-info --><script src="src/rom-version.js"></script><script src="game.js"></script><link rel="stylesheet" href="style.css">');return root;
}
async function serve(t,root){const server=createLanServer({root});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.dispose();server.close(r);}));return `http://127.0.0.1:${server.address().port}`;}
for(const artifact of [false,true])test(`${artifact?'artifact':'source'}: version no-store, HTML revalidation, immutable hashed code, media 304`,async t=>{
 const source=fixture(t),root=artifact?build(source).output:source,base=await serve(t,root);
 const version=await fetch(base+'/version.json'),info=await version.json();assert.equal(version.headers.get('cache-control'),'no-store');assert.ok(info.build);
 const again=await fetch(base+'/version.json',{headers:{'If-None-Match':version.headers.get('etag')}});assert.equal(again.status,200);assert.equal((await again.json()).build,info.build);
 const page=await fetch(base+'/'),html=await page.text();assert.equal(page.headers.get('cache-control'),'no-cache');
 assert.equal((await fetch(base+'/',{headers:{'If-None-Match':page.headers.get('etag')}})).status,304);
 for(const asset of [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)\?v=[a-f0-9]{12})"/g)].map(m=>m[1])){
  const res=await fetch(base+'/'+asset);assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/immutable/);
  if(asset.startsWith('src/build-info'))assert.ok((await res.text()).includes(info.build));
 }
 const media=await fetch(base+'/assets/probe.png');assert.equal(media.headers.get('cache-control'),'no-cache');
 assert.equal((await fetch(base+'/assets/probe.png',{headers:{'If-None-Match':media.headers.get('etag')}})).status,304);
 assert.equal((await fetch(base+'/version.json',{method:'HEAD'})).headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/tools/build-info.cjs')).status,404);
 if(!artifact){fs.writeFileSync(path.join(root,'game.js'),'// modified');const fresh=await (await fetch(base+'/version.json')).json();assert.notEqual(fresh.build,info.build);}
});
