'use strict';
// Give every local script/stylesheet a content-based URL so reloads cannot mix versions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const rootArg=process.argv.indexOf('--root');
if(rootArg!==-1&&!process.argv[rootArg+1])throw new Error('--root requires a directory');
const root=rootArg===-1?path.resolve(__dirname,'..'):path.resolve(process.argv[rootArg+1]),file=path.join(root,'index.html');
const original=fs.readFileSync(file,'utf8'),stale=[];
const updated=original.replace(/((?:src|href)=")([^"?]+\.(?:js|css))(?:\?v=[^"]+)?(")/g,(match,prefix,asset,suffix)=>{
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,asset))).digest('hex').slice(0,12);
  const next=prefix+asset+'?v='+hash+suffix;
  if(next!==match)stale.push(asset);
  return next;
});
if(process.argv.includes('--check')) {
  if(stale.length){console.error('Run node tools/version-assets.cjs to update: '+stale.join(', '));process.exitCode=1;}
  else console.log('PASS: script and stylesheet URLs match their file contents.');
} else if(updated!==original) {fs.writeFileSync(file,updated);console.log('Updated '+stale.length+' asset URLs.');}
