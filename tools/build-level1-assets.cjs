// Mechanical packing only. Background removal is performed by imagegen.
// Run with sharp on NODE_PATH. No color-keying, alpha reconstruction or repaint.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const metrics = [];
async function cell(file, id) {
  const input = path.join(root, file);
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) throw new Error(`${file}: no alpha channel`);
  const {data, info} = await sharp(input).raw().toBuffer({resolveWithObject:true});
  let transparent = 0;
  for (let i=3; i<data.length; i+=4) if(data[i]===0) transparent++;
  if (transparent < info.width*info.height*.1) throw new Error(`${file}: insufficient transparent background`);
  // Preserve full image frame; no per-pose trimming/recentering.
  const result = await sharp(input).resize(190,190,{fit:'inside'}).png().toBuffer();
  const m = await sharp(result).metadata();
  metrics.push({id, source:file, alpha:true, transparentFraction:transparent/(info.width*info.height), sourceSize:[info.width,info.height]});
  return sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
    .composite([{input:result,left:Math.floor((256-m.width)/2),top:Math.floor((256-m.height)/2)}]).png().toBuffer();
}
async function main() {
  for (const id of ['small','heavy','boat','boss']) {
    await sharp(await cell(`assets/enemies/sources/${id}.png`,id)).toFile(path.join(root,`assets/enemies/${id}.png`));
  }
  for (const id of ['p1','p2']) {
    // Existing 256px masters already have the prescribed margins and pivot.
    const normal=path.join(root,`assets/art-review/CF-L1-ART-02/${id}-normal-master.png`);
    const left=path.join(root,`assets/art-review/CF-L1-ART-03/${id}-roll-left-master.png`);
    const right=path.join(root,`assets/art-review/CF-L1-ART-03/${id}-roll-right-master.png`);
    // Remaining states intentionally retain Normal until 3D pose production.
    const cells=[normal,left,right,normal,normal,normal,normal,normal];
    for(const f of new Set(cells)) {
      const m=await sharp(f).metadata();
      if(m.width!==256||m.height!==256||!m.hasAlpha)throw new Error(`Invalid player master ${f}`);
    }
    await sharp({create:{width:1024,height:512,channels:4,background:'#00000000'}})
      .composite(cells.map((input,i)=>({input,left:(i%4)*256,top:Math.floor(i/4)*256})))
      .png().toFile(path.join(root,`assets/players/${id}/sheet.png`));
  }
  fs.writeFileSync(path.join(root,'artifacts/level1/asset-metrics.json'),JSON.stringify(metrics,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1});
