const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.resolve('index.html'));
    await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
    await page.waitForTimeout(80);
    for (const combined of [true,false]) {
      const result=await page.evaluate(combined=>{
        $('#half-reset').click(); mode='ready';
        const make=(index)=>({id:'QA '+index,index,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))});
        const raw=combined?[make(0)]:[make(0),make(1)];
        navigator.getGamepads=()=>raw; controllerSetup.poll();
        let clock=1000; Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
        $('#settings').showModal();
        function read(){return pads();}
        function neutral(){read();clock+=600;read();}
        function setup(slot,p,axes,buttons){
          $('#half-p'+(slot+1)).click();neutral();
          for(const [axis,value] of axes){p.axes[axis]=value;read();p.axes[axis]=0;neutral();}
          for(const button of buttons){p.buttons[button].pressed=true;read();p.buttons[button].pressed=false;neutral();}
        }
        setup(0,raw[0],[[0,1],[1,-1]],[4,5,8]);
        setup(1,combined?raw[0]:raw[1],combined?[[3,-1],[2,-1]]:[[1,-1],[0,1]],[0,1,9]);
        $('#settings').close(); start();
        raw[0].axes[0]=1;
        const p1=[input(0).x,input(0).y,input(1).x,input(1).y];raw[0].axes[0]=0;
        const right=combined?raw[0]:raw[1];right.axes[combined?3:1]=-1;
        const p2=[input(0).x,input(0).y,input(1).x,input(1).y];right.axes.fill(0);
        right.buttons[0].pressed=true;const fire=[input(0).fire,input(1).fire];right.buttons[0].pressed=false;
        poll();right.buttons[1].pressed=true;poll();poll();right.buttons[1].pressed=false;
        const bombs=players.map(p=>p.bombs);
        $('#deadzone').value=30;$('#deadzone').dispatchEvent(new Event('input'));
        raw[0].axes[0]=.29;const below=input(0).x;raw[0].axes[0]=.31;const above=input(0).x;
        const saved=localStorage.getItem('catfighter-deadzone');
        return {p1,p2,fire,bombs,below,above,saved,players:players.length};
      },combined);
      assert.deepEqual(result,{p1:[1,0,0,0],p2:[0,0,1,0],fire:[false,true],bombs:[3,2],below:0,above:.31,saved:'0.3',players:2});
    }
    await page.reload();
    assert.equal(await page.locator('#deadzone').inputValue(),'30');
    assert.deepEqual(errors,[]);
    console.log('PASS: combined/separate half controllers, independent movement/fire/bomb, deadzone thresholds and persistence');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
