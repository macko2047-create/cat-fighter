const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://cat-fighter.test/**', async route=>{
const pathname=new URL(route.request().url()).pathname;
const file=path.resolve('.'+(pathname==='/'?'/index.html':pathname));
await route.fulfill({path:file});
});
await page.goto('http://cat-fighter.test/');await page.waitForFunction(()=>islandBackdrop.image.complete&&islandBackdrop.image.naturalWidth&&Object.keys(PLAYER_ASSETS).every(id=>playerAssets.isReady(id))&&Object.keys(ENEMY_ASSETS).every(id=>enemyAssets.isReady(id)));
await page.locator('#start').click();await page.evaluate(()=>window.requestAnimationFrame=()=>0);await page.waitForTimeout(100);
if(process.argv[2]==='before') {
await page.addScriptTag({content:fs.readFileSync('artifacts/performance/world-before.js','utf8').replaceAll('islandBackdrop','islandBackdropBefore').replaceAll('drawFallbackWorld','drawFallbackWorldBefore').replaceAll('drawWorld','drawWorldBefore')});
await page.addScriptTag({content:fs.readFileSync('artifacts/performance/render-before.js','utf8').replace('function createRenderer(', 'function createRendererBefore(')});
await page.waitForFunction(()=>islandBackdropBefore.image.complete&&islandBackdropBefore.image.naturalWidth);
await page.evaluate(()=>globalThis.benchRender=createRendererBefore(ctx,W,H,t=>drawWorldBefore(ctx,W,H,t),clamp,playerAssets,enemyAssets));
} else await page.evaluate(()=>globalThis.benchRender=render);
const results=await page.evaluate(()=>{
const p={index:0,x:260,y:680,hp:100,inv:0};const state={mode:'playing',ambient:0,players:[p],enemies:Array.from({length:12},(_,i)=>({type:i%3?'small':'heavy',x:100+i%4*130,y:100+Math.floor(i/4)*110})),shots:Array.from({length:35},(_,i)=>({x:230+i%3*12,y:600-i*14,owner:p})),hostile:Array.from({length:140},(_,i)=>({x:80+i%16*29,y:310+Math.floor(i/16)*36})),sparks:Array.from({length:80},(_,i)=>({x:280+Math.sin(i*2)*45,y:240+Math.cos(i*3)*40,life:.2+i%5*.08,color:'#ff9a26'})),drops:[],flash:0};
for(let i=0;i<3;i++)benchRender(state);
const originalCreate=document.createElement.bind(document);let newCanvases=0;document.createElement=(tag,...args)=>{if(tag==="canvas")newCanvases++;return originalCreate(tag,...args)};
const samples=[];for(let i=0;i<15;i++){state.ambient=i/60;const start=performance.now();benchRender(state);ctx.getImageData(0,0,1,1);samples.push(performance.now()-start)}
samples.sort((a,b)=>a-b);benchRender({...state,ambient:0});document.createElement=originalCreate;if(newCanvases)throw Error("Unexpected warm-frame canvas allocations: "+newCanvases);return {newCanvases,medianMs:samples[7],p95Ms:samples[14],method:'15 warm draw + GPU flush samples; fixed 12 enemies, 175 bullets, 80 particles; headless Chrome'};
});await page.locator('#game').screenshot({path:path.resolve('artifacts/performance/'+(process.argv[2]||'after')+'.png')});results.errors=errors;fs.writeFileSync('artifacts/performance/'+(process.argv[2]||'after')+'.json',JSON.stringify(results,null,2));console.log(results);if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
