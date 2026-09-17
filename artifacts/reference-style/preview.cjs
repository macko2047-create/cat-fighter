const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const p=await b.newPage({viewport:{width:1440,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file://'+path.resolve('index.html'));
 await p.waitForFunction(()=>islandBackdrop.image.complete&&islandBackdrop.image.naturalWidth&&Object.keys(PLAYER_ASSETS).every(id=>playerAssets.isReady(id))&&Object.keys(ENEMY_ASSETS).every(id=>enemyAssets.isReady(id)));
 await p.locator("#start").click();
 await p.evaluate(()=>{window.requestAnimationFrame=()=>0});await p.waitForTimeout(100);
 await p.evaluate(()=>{
   const ps=[{index:0,x:235,y:685,hp:100,inv:0},{index:1,x:365,y:685,hp:100,inv:0}];
   render({mode:'playing',ambient:0,enemies:[{type:'small',x:160,y:210},{type:'heavy',x:305,y:130},{type:'small',x:425,y:285},{type:'boat',x:490,y:460}],drops:[],players:ps,
   shots:[...Array.from({length:5},(_,i)=>({x:235,y:615-i*70,owner:ps[0]})),...Array.from({length:4},(_,i)=>({x:365,y:595-i*70,owner:ps[1]}))],
   hostile:[{x:190,y:345},{x:285,y:400},{x:415,y:490}],sparks:Array.from({length:14},(_,i)=>({x:305+Math.sin(i*2.4)*18,y:290+Math.cos(i*2.4)*17,life:.25+(i%4)*.1,color:'#ff9a26'})),flash:0});
 });
 await p.locator('#game').screenshot({path:path.resolve('artifacts/reference-style/preview.png')});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS generated background, file:// loading, effects preview, no page errors');await b.close();
})().catch(e=>{console.error(e);process.exitCode=1});
