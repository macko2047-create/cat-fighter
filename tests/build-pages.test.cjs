'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {build}=require('../tools/build-pages.cjs');
const {generate,prepare}=require('../tools/build-info.cjs');
const repo=path.resolve(__dirname,'..');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cat-build-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'assets'));
 for(const name of ['style.css','game.js','CNAME','.nojekyll'])fs.writeFileSync(path.join(root,name),'');
 fs.copyFileSync(path.join(repo,'src/rom-version.js'),path.join(root,'src/rom-version.js'));
 fs.writeFileSync(path.join(root,'src/p2p-transport.js'),'archived');fs.writeFileSync(path.join(root,'src/relay-transport.js'),'archived');
 fs.writeFileSync(path.join(root,'index.html'),'<button id="boot">BOOT <span id="rom-version"></span><span id="build-version"></span><span>TOUCH TO POWER ON</span></button><!-- cat-build-info --><script src="src/rom-version.js"></script><script src="game.js"></script><link href="style.css" rel="stylesheet">');
 return root;
}
function display(root,js){
 const labels={},logs=[],context={console:{info:s=>logs.push(s)},document:{getElementById:id=>labels[id]??={}}};context.window=context;vm.createContext(context);
 if(js)vm.runInContext(js,context);
 vm.runInContext(fs.readFileSync(path.join(root,'src/rom-version.js'),'utf8'),context);
 return {labels,logs};
}
test('generated ID is shared by JSON and boot UI; ROM/channel stays independent of Git',t=>{
 const root=fixture(t),gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:repo,encoding:'utf8'}).trim();
 fs.writeFileSync(path.join(root,'.git'),`gitdir: ${gitDir}\n`);
 const expected=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),before=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const {output,info}=build(root,{requireGit:true});assert.equal(info.git,expected);assert.equal(info.dirty,true);assert.match(info.build,/^\d{8}-\d{4}-[a-f0-9]+-dirty-[a-f0-9]{8}$/);
 const json=JSON.parse(fs.readFileSync(path.join(output,'version.json')));assert.deepEqual(json,info);
 const ui=display(root,fs.readFileSync(path.join(output,'src/build-info.js'),'utf8'));
 assert.equal(ui.labels['rom-version'].textContent,'ROM Ver. 0.9.12 · dev');assert.equal(ui.labels['build-version'].textContent,'BUILD '+info.build);assert.deepEqual(ui.logs,['Cat Fighter build: '+info.build]);
 assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),before);
 const html=fs.readFileSync(path.join(output,'index.html'),'utf8');assert.match(html,/build-info\.js\?v=[a-f0-9]{12}/);assert.ok(html.indexOf('build-info.js')<html.indexOf('rom-version.js'));
 assert.equal(fs.existsSync(path.join(output,'src/p2p-transport.js')),true);assert.equal(fs.existsSync(path.join(output,'src/relay-transport.js')),false);
 execFileSync(process.execPath,[path.join(repo,'tools/version-assets.cjs'),'--root',output,'--check']);
});
test('same-minute uncommitted code change changes build and affected asset URL',t=>{
 const root=fixture(t),now=new Date('2026-09-12T18:55:00Z'),a=generate(root,{now}),htmlA=prepare(root,a).html;
 fs.writeFileSync(path.join(root,'game.js'),'// second build');
 const b=generate(root,{now}),htmlB=prepare(root,b).html;assert.notEqual(a.build,b.build);assert.notEqual(htmlA.match(/game.js\?v=([^" ]+)/)[1],htmlB.match(/game.js\?v=([^" ]+)/)[1]);
 assert.equal(htmlA.match(/style.css\?v=([^" ]+)/)[1],htmlB.match(/style.css\?v=([^" ]+)/)[1]);
 assert.equal(generate(root,{now}).build,b.build);
});
test('Git-free builds are explicit; raw source never pretends to be a generated build',t=>{
 const root=fixture(t),{info}=build(root);assert.equal(info.git,'nogit');assert.equal(info.dirty,null);assert.ok(info.build.includes('-nogit-'));
 const raw=display(root);assert.equal(raw.labels['rom-version'].textContent,'ROM Ver. 0.9.12 · dev');assert.match(raw.labels['build-version'].textContent,/unavailable/);assert.equal(raw.logs.length,0);
 assert.throws(()=>build(root,{requireGit:true}),/requires Git HEAD/);
});
