const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({acceptDownloads:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.resolve('index.html'));
    await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
    await page.waitForTimeout(80);

    for (const combined of [true,false]) {
      const result=await page.evaluate(combined=>{
        $('#half-reset').click();
        mode='ready';
        for (const id of Object.keys(bindings)) delete bindings[id];
        localStorage.setItem('unrelated-private-token','MUST-NOT-EXPORT-PRIVATE-TOKEN');
        const make=(index,axes)=>({
          id:`QA controller ${index}`,index,mapping:'',connected:true,axes,
          buttons:Array.from({length:16},()=>({pressed:false,value:0,touched:false})),
          privateField:'MUST-NOT-EXPORT-DEVICE-EXTRA',
        });
        const left=make(0,[-1,.25,.1,-.2]);
        const right=combined?left:make(2,[-.25,.1,0,0]);
        const raw=combined?[left]:[left,null,right];
        window.exportTestPads=raw;
        navigator.getGamepads=()=>raw;
        let clock=1000,clockReads=0;
        Object.defineProperty(performance,'now',{configurable:true,value:()=>{clockReads++;return clock;}});
        if (!$('#settings').open) $('#settings').showModal();
        function read(){return pads();}
        function neutral(){read();clock+=600;read();}
        function press(p,index,pressed){Object.assign(p.buttons[index],{pressed,value:pressed?1:0,touched:pressed});}
        function setup(slot,p,axes,buttons){
          $('#half-p'+(slot+1)).click();neutral();
          for(const [axis,value] of axes){const rest=p.axes[axis];p.axes[axis]=value;read();p.axes[axis]=rest;neutral();}
          for(const button of buttons){press(p,button,true);read();press(p,button,false);neutral();}
        }
        setup(0,left,[[0,1],[1,-1]],[4,5,8]);
        setup(1,right,combined?[[3,1],[2,-1]]:[[0,-1],[1,1]],[0,1,9]);
        // Exercise the actual saved button-mapping path on a calibrated slot.
        renderDevices();
        const fireMapping=$('[data-pad="-100"] [data-action="fire"]');
        if (!fireMapping) throw new Error('Calibration did not finish: '+JSON.stringify(window.halfControllers.snapshot())+' / '+$('#half-status').textContent);
        fireMapping.click();
        press(left,5,true);poll();press(left,5,false);poll();
        $('#deadzone').value=27;
        $('#deadzone').dispatchEvent(new Event('input'));
        right.buttons[12]={pressed:false,value:.35,touched:true};
        const report=window.controllerReport.snapshot();
        const expectedProfiles=[
          {id:left.id,index:0,axes:[{axis:0,rest:-1,sign:1},{axis:1,rest:.25,sign:-1}],buttons:[4,5,8]},
          {id:right.id,index:right.index,axes:combined?[{axis:3,rest:-.2,sign:1},{axis:2,rest:.1,sign:-1}]:[{axis:0,rest:-.25,sign:-1},{axis:1,rest:.1,sign:1}],buttons:[0,1,9]},
        ];
        const expectedDevices=raw.filter(Boolean).map(p=>({
          id:p.id,index:p.index,mapping:p.mapping,connected:p.connected,axes:[...p.axes],
          buttons:p.buttons.map((b,index)=>({index,pressed:b.pressed,value:b.value,touched:b.touched})),
        }));
        const savedBindings=JSON.parse(localStorage.getItem('catfighter-bindings'));
        const original=JSON.stringify(report);
        report.bindings['Half Joy-Con P1'].fire=99;
        report.halfControllers.profiles[0].axes[0].axis=99;
        report.devices[0].axes[0]=99;
        const fresh=window.controllerReport.snapshot();
        const cloned={bindings:fresh.bindings,profiles:fresh.halfControllers.profiles,devices:fresh.devices};
        // Export while a new calibration is waiting for neutral. Exporting must
        // neither sample calibration nor trigger input assignment/polling.
        $('#half-p1').click();
        left.axes[0]=1;
        capture={index:-101,action:'pause'};
        const state=()=>JSON.stringify({half:window.halfControllers.snapshot(),assignments:[...assignments],capture,previous:[...previous],mode,status:$('#half-status').textContent});
        const before=state();
        clockReads=0;
        const pending=window.controllerReport.snapshot();
        const reads=clockReads;
        const after=state();
        left.axes[0]=-1;
        $('#settings').close();
        capture=null;
        $('#settings').showModal();
        setup(0,left,[[0,1],[1,-1]],[4,5,8]);
        return {report:JSON.parse(original),expectedProfiles,expectedDevices,savedBindings,cloned,before,after,reads,pendingHalf:pending.halfControllers};
      },combined);
      const report=result.report;
      assert.equal(report.schema,'cat-fighter-controller-report');
      assert.equal(report.version,1);
      assert.equal(new Date(report.exportedAt).toISOString(),report.exportedAt);
      assert.equal(report.controllerMode,'manual-calibration');
      assert.equal(report.environment.protocol,'file:');
      assert.match(report.environment.userAgent,/Chrome/);
      assert.deepEqual(report.game,{mode:'ready',keyboard2:false,assignments:[-100,-101]});
      assert.deepEqual(report.deadzone,{value:.27,percent:27});
      assert.deepEqual(report.bindings,{'Half Joy-Con P1':{fire:0,bomb:1,pause:9}});
      assert.deepEqual(report.bindings,result.savedBindings);
      assert.deepEqual(report.halfControllers.profiles,result.expectedProfiles);
      assert.deepEqual(report.devices,result.expectedDevices);
      assert.deepEqual(result.cloned,{bindings:report.bindings,profiles:result.expectedProfiles,devices:result.expectedDevices});
      assert.equal(result.before,result.after,'snapshot must not mutate calibration or game input state');
      assert.equal(result.reads,0,'snapshot must not advance calibration by polling input');
      assert.doesNotMatch(JSON.stringify(report),/MUST-NOT-EXPORT/);
    }

    const downloadPromise=page.waitForEvent('download');
    await page.locator('#export-controller').click();
    const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/\.json$/);
    const stream=await download.createReadStream();
    const chunks=[];
    for await (const chunk of stream) chunks.push(chunk);
    const downloaded=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const shown=JSON.parse(await page.locator('#controller-report').inputValue());
    assert.deepEqual(downloaded,shown,'downloaded JSON should match the visible report');
    assert.equal(downloaded.halfControllers.profiles.length,2);
    assert.deepEqual(downloaded.game.assignments,[-100,-101]);
    assert.deepEqual(downloaded.bindings,{'Half Joy-Con P1':{fire:0,bomb:1,pause:9}});
    assert.doesNotMatch(JSON.stringify(downloaded),/MUST-NOT-EXPORT/);

    await page.evaluate(()=>{
      window.exportTestCopied=null;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.exportTestCopied=text;}}});
    });
    await page.locator('#copy-controller').click();
    await page.waitForFunction(()=>window.exportTestCopied!==null);
    assert.deepEqual(JSON.parse(await page.evaluate(()=>window.exportTestCopied)),JSON.parse(await page.locator('#controller-report').inputValue()));

    await page.evaluate(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard permission denied for QA');}}});
    });
    await page.locator('#copy-controller').click();
    await page.waitForFunction(()=>/Settings are selected below/.test($('#controller-export-status').textContent));
    const fallback=await page.locator('#controller-report').evaluate(el=>({readOnly:el.readOnly,visible:el.getBoundingClientRect().height>0,text:el.value,selected:el.selectionEnd-el.selectionStart}));
    assert.equal(fallback.readOnly,true);
    assert.equal(fallback.visible,true);
    assert.equal(fallback.selected,fallback.text.length,'clipboard failure should select the entire report for manual copying');
    assert.equal(JSON.parse(fallback.text).schema,'cat-fighter-controller-report');
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#copy-controller').scrollIntoViewIfNeeded();
    await page.locator('#controller-report').evaluate(el=>{el.setSelectionRange(0,0);el.scrollTop=0;});
    await page.screenshot({path:'artifacts/controller-settings/export-preview.png'});
    console.log('PASS: combined/separate calibration reports, saved bindings/raw input, isolated read-only snapshots, JSON download, clipboard success and manual-copy fallback');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
