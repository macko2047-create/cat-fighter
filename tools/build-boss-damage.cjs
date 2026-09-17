// User-authorized local background extraction. Flood only near-neutral background
// connected to the sheet border; enclosed aircraft metal is preserved.
const sharp=require('sharp'),fs=require('node:fs');
(async()=>{
 const {data,info}=await sharp('artifacts/boss-damage/design-sheet.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info, seen=new Uint8Array(w*h), queue=new Int32Array(w*h);let head=0,tail=0;
 const isBackground=i=>{const r=data[i*3],g=data[i*3+1],b=data[i*3+2];return Math.max(r,g,b)-Math.min(r,g,b)<16&&Math.min(r,g,b)>65};
 function visit(i){if(!seen[i]&&isBackground(i)){seen[i]=1;queue[tail++]=i}}
 for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x)}
 for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1)}
 while(head<tail){const i=queue[head++],x=i%w;if(x)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<w*(h-1))visit(i+w)}
 const rgba=Buffer.alloc(w*h*4);
 for(let i=0;i<w*h;i++){rgba[i*4]=data[i*3];rgba[i*4+1]=data[i*3+1];rgba[i*4+2]=data[i*3+2];rgba[i*4+3]=seen[i]?0:255}
 const extracted=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 const layers=[];
 // All cells share an authored grid. Common scale restores original 176px
 // visible wingspan inside its 240px display frame; no per-stage auto-crop.
 for(let i=0;i<4;i++){
  const input=await sharp(extracted).extract({left:(i%2)*(w/2),top:Math.floor(i/2)*(h/2),width:w/2,height:h/2}).resize(384,384).png().toBuffer();
  // The generated lower row's tail anchor sits 32 source pixels too high.
  layers.push({input,left:(i%2)*512+64,top:Math.floor(i/2)*512+64+(i>=2?20:0)});
 }
 await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}}).composite(layers).png().toFile('assets/enemies/boss-damage-sheet.png');
 fs.writeFileSync('artifacts/boss-damage/alpha.json',JSON.stringify({method:'border-connected neutral background flood',transparentPixels:tail,total:w*h,commonCellScale:384/512},null,2));
})();
