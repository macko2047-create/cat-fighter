// Deterministic export and review composition; never modifies gameplay assets.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const metrics = [];
  for (const id of ['p1', 'p2']) {
    const source = path.join(__dirname, `${id}-normal-source.png`);
    const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw Error(`${id}: missing alpha`);
    let x0=info.width,y0=info.height,x1=0,y1=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      if(data[(y*info.width+x)*4+3]>0) {x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    }
    // Normal establishes the shared centered anchor. No nonuniform scaling.
    const sprite=await sharp(source).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1})
      .resize(190,190,{fit:'inside'}).png().toBuffer();
    const meta=await sharp(sprite).metadata();
    const left=Math.floor((256-meta.width)/2),top=Math.floor((256-meta.height)/2);
    await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
      .composite([{input:sprite,left,top}]).png().toFile(path.join(__dirname,`${id}-normal-master.png`));
    metrics.push({id,cell:[256,256],pivot:[128,128],exportBounds:[left,top,meta.width,meta.height],gameplayCell:[72,72]});
  }
  const c=createCanvas(600,800),ctx=c.getContext('2d');
  const sandbox={};vm.createContext(sandbox);
  for(const file of ['src/world.js','src/assets.js','src/render.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox);
  const images={};for(const id of ['p1','p2']) images[`player.${id}`]=await loadImage(path.join(__dirname,`${id}-normal-master.png`));
  const assets={definition:()=>({cell:{width:256,height:256},displayScale:72/256,pivot:{x:.5,y:.5},states:{normal:{frames:[{row:0,column:0}]}}}),image:id=>images[id]};
  const render=sandbox.createRenderer(ctx,600,800,t=>sandbox.drawWorld(ctx,600,800,t),(v,a,b)=>Math.max(a,Math.min(b,v)),assets);
  render({mode:'playing',ambient:12,players:[{index:0,x:245,y:620,hp:100,inv:0},{index:1,x:355,y:620,hp:100,inv:0}],
    enemies:[{type:'small',x:180,y:180},{type:'small',x:310,y:240},{type:'heavy',x:430,y:130}],drops:[],
    shots:[{x:245,y:530},{x:355,y:510}],hostile:[{x:280,y:560},{x:410,y:590},{x:190,y:660},{x:340,y:450}],sparks:[],flash:0});
  fs.writeFileSync(path.join(__dirname,'gameplay-size-preview.png'),c.toBuffer('image/png'));
  const detail=createCanvas(300,150);detail.getContext('2d').drawImage(c,150,545,300,150,0,0,300,150);
  fs.writeFileSync(path.join(__dirname,'gameplay-size-comparison.png'),detail.toBuffer('image/png'));
  fs.writeFileSync(path.join(__dirname,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');
  console.log(JSON.stringify(metrics));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
