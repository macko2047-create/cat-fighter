'use strict';
// One generated object feeds the boot script and version.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const hash = data => crypto.createHash('sha256').update(data).digest('hex').slice(0,12);
const marker = '<!-- cat-build-info -->';
function metadata(root) {
  const context = {module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/rom-version.js'),'utf8'),context);
  const {rom,channel} = context.module.exports;
  if(typeof rom!=='string'||typeof channel!=='string')throw Error('Invalid ROM metadata');
  return {rom,channel};
}
function fingerprint(root) {
  const names=['index.html','style.css','game.js'];
  function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=dir+'/'+entry.name;
    if(entry.isDirectory())walk(name);
    else if(/\.(js|json|css)$/.test(name)&&name!=='src/build-info.js')names.push(name);
  }}
  walk('src');
  for(const name of ['tools/build-info.cjs','tools/build-pages.cjs','tools/version-assets.cjs','tools/lan-server.cjs'])if(fs.existsSync(path.join(root,name)))names.push(name);
  const digest=crypto.createHash('sha256');
  for(const name of names){let contents=fs.readFileSync(path.join(root,name));
    // Rewriting generated URL hashes must not itself create another build.
    if(name==='index.html')contents=Buffer.from(contents.toString().replace(/\?v=[^"\s]+/g,''));
    digest.update(name+'\0').update(contents).update('\0');
  }
  return digest.digest('hex').slice(0,8);
}
function generate(root,{requireGit=false,now=new Date()}={}) {
  let git='nogit',dirty=null;
  try {
    if(!fs.existsSync(path.join(root,'.git')))throw Error('No Git metadata');
    const run=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git=run(['rev-parse','--short','HEAD']);
    if(!/^[0-9a-f]{4,40}$/.test(git))throw Error('Invalid Git SHA');
    dirty=run(['status','--porcelain','--untracked-files=normal']).length>0;
  } catch(error) {
    if(requireGit)throw new Error('Pages release requires Git HEAD and readable Git state',{cause:error});
    git='nogit';dirty=null;
  }
  const stamp=now.toISOString().slice(0,16).replace(/[-:T]/g,'').replace(/^(\d{8})(\d{4})$/,'$1-$2');
  const content=fingerprint(root);
  return Object.freeze({...metadata(root),content,build:`${stamp}-${git}${dirty===true?'-dirty':''}-${content}`,git,dirty});
}
const script=info=>`// Generated; version.json and this script share one build object.\nwindow.CatBuildInfo = Object.freeze(${JSON.stringify(info)});\n`;
function versionHTML(root,html,overrides={}) {
  return html.replace(/((?:src|href)=")([^"?]+\.(?:js|css))(?:\?v=[^"]+)?(")/g,(match,prefix,asset,suffix)=>{
    if(/^(?:https?:)?\/\//.test(asset))return match;
    return prefix+asset+'?v='+hash(overrides[asset]??fs.readFileSync(path.join(root,asset)))+suffix;
  });
}
function prepare(root,info) {
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  if(source.split(marker).length!==2)throw Error('Expected one build-info marker');
  const js=script(info);
  const html=versionHTML(root,source.replace(marker,'<script src="src/build-info.js"></script>'),{'src/build-info.js':js});
  return {info,js,html};
}
module.exports={generate,prepare,versionHTML,hash,fingerprint};
