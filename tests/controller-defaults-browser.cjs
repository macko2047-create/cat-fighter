const vm = require("node:vm"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const elements = new Map(),
  events = {};
const context = new Proxy({}, { get: (_, name) => name === "createLinearGradient" ? () => ({addColorStop() {}}) : () => {} });
const el = (s) => {
  if (!elements.has(s))
    elements.set(s, {
      style: {},
      dataset: {},
      classList: {toggle() {}},
      querySelector: () => ({textContent:''}),
      click() { this.onclick?.(); },
      textContent: "",
      innerHTML: "",
      open: false,
      querySelectorAll: () => [],
      addEventListener() {},
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      getContext: () => context,
    });
  return elements.get(s);
};
let gamepads = [], clock = 1000;
const saved = new Map();
const sandbox = {
  console,
  Math,
  document: { body: {dataset:{inputMode:'touch'}}, querySelector: el, addEventListener() {} },
  performance: {now:()=>clock},
  window: { addEventListener: (n, fn) => (events[n] = fn) },
  navigator: { getGamepads: () => gamepads },
  localStorage: { getItem: key => saved.get(key) ?? null, setItem(key,value) {saved.set(key,value);} },
  requestAnimationFrame() {},
};
vm.createContext(sandbox);
for (const file of [
  "src/world.js",
  "src/assets.js",
  "src/render.js",
  "src/audio.js",
  "src/levels/level1.js",
  "src/enemies.js",
  "game.js",
]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
}
const run = (s) => vm.runInContext(s, sandbox);


// Dependency-free regression of the real browser scripts and game input pipeline.
for (const file of ['src/half-controllers.js','src/controller-setup.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
  sandbox.halfControllers=sandbox.window.halfControllers;
  sandbox.controllerSetup=sandbox.window.controllerSetup;
}
const json = code => JSON.parse(JSON.stringify(run(code)));
const make = (id,index,axes=[0,0]) => ({id,index,mapping:'standard',connected:true,axes,buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
const press = (p,b) => {p.buttons[b].pressed=true;run('poll()');p.buttons[b].pressed=false;run('poll()');};
assert.equal(run('touchOnly()'),true,'no hardware retains touch mode');
assert.deepEqual(json('halfControllers.snapshot().profiles'),[null,null],'fresh storage');
const left=make('Joy-Con (L) (STANDARD GAMEPAD)',4), right=make('Joy-Con (R) (STANDARD GAMEPAD)',7);
for (const [pad,slot,button] of [[left,0,1],[right,1,3]]) {
  gamepads=[pad];press(pad,button);
  assert.equal(run(`assignments[${slot}]`),-100-slot,'a lone Joy-Con owns its default player');
  assert.deepEqual(json('halfControllers.snapshot().profiles'),[null,null],'automatic singles need no calibration');
  run('assignments.fill(null); previous.clear()');
}
gamepads=[right,left];
press(right,3);press(left,1);
assert.deepEqual(json('[...assignments]'),[-100,-101],'right-first joins logical P2');
run('start()');left.axes=[.6,-.7];right.axes=[-.6,.5];
assert.deepEqual(json('[input(0).x,input(0).y,input(1).x,input(1).y]'),[.6,-.7,-.6,.5]);
left.buttons[1].pressed=true;right.buttons[3].pressed=true;
assert.deepEqual(json('[input(0).fire,input(1).fire]'),[true,true]);
left.buttons[1].pressed=false;right.buttons[3].pressed=false;
press(left,0);press(right,2);assert.deepEqual(json('players.map(p=>p.bombs)'),[2,2]);
press(left,3);assert.equal(run('mode'),'paused');press(right,1);assert.equal(run('mode'),'playing');
run("mode='ready'; assignments.fill(null); previous.clear()");
const pair=make('Joy-Con (L/R) (STANDARD GAMEPAD)',2,[0,0,0,0]);gamepads=[pair];run('pads()');
press(pair,2);
assert.deepEqual(json('[...assignments]'),[null,-101],'combined right button only joins P2');
press(pair,13);run('start()');pair.axes=[0,1,0,-1];
assert.deepEqual(json('[input(0).x,input(1).x]'),[1,1]);
pair.buttons[13].pressed=true;pair.buttons[2].pressed=true;
assert.deepEqual(json('[input(0).fire,input(1).fire]'),[true,true],'combined preset retained');
run("mode='ready'; assignments.fill(null); previous.clear()");
const full=make('Standard full gamepad',9);gamepads=[full];
assert.equal(run('pads()[0]'),full,'full pad untouched');
gamepads=[left];run('bindings["Joy-Con (L) (STANDARD GAMEPAD)"]={fire:7,bomb:6,pause:8}');
left.buttons[7].pressed=true;
assert.equal(run('config(pads()[0]).fire'),7,'physical saved remap retained');
assert.equal(run('pads()[0].buttons[7].pressed'),true);
left.buttons[7].pressed=false;
run('delete bindings["Joy-Con (L) (STANDARD GAMEPAD)"]');
// Calibrate a non-standard device, then reload just the profile module.
const custom=make('Custom half',12);gamepads=[custom];
run("$('#half-reset').click(); $('#settings').showModal(); $('#half-p1').click()");
const read=()=>run('pads()');
const neutral=()=>{read();clock+=600;read();};neutral();
for(const [axis,value] of [[0,-1],[1,1]]) {custom.axes[axis]=value;read();custom.axes[axis]=0;neutral();}
for(const b of [4,5,8]) {custom.buttons[b].pressed=true;read();custom.buttons[b].pressed=false;neutral();}
assert.equal(run('halfControllers.snapshot().profiles[0].buttons[0]'),4);
assert.equal(run('halfControllers.snapshot().calibration'),null);
vm.runInContext(fs.readFileSync('src/half-controllers.js','utf8'),sandbox);
sandbox.halfControllers=sandbox.window.halfControllers;
assert.match(el('#half-status').textContent,/Saved half-controller calibration loaded/);
custom.index=20;read();
assert.equal(run('halfControllers.snapshot().profiles[0].index'),20,'saved calibration rebinds');
custom.axes[0]=-.8;assert.equal(run('pads()[0].axes[0]'),.8,'saved movement retained');
const profileKey='catfighter-half-controllers-v1';
const calibrated=JSON.parse(saved.get(profileKey));calibrated.defaultsEnabled=true;
saved.set(profileKey,JSON.stringify(calibrated));
vm.runInContext(fs.readFileSync('src/half-controllers.js','utf8'),sandbox);
sandbox.halfControllers=sandbox.window.halfControllers;
gamepads=[custom,left,right];
assert.equal(run('pads().filter(p=>p.index===-100).length'),1,'automatic defaults do not duplicate a calibrated slot');
assert.equal(run('pads().find(p=>p.index===-100).axes[0]'),.8,'connected calibration takes priority over automatic left half');
assert.equal(run('pads().find(p=>p.index===-101).preferredSlot'),1,'uncalibrated right half remains automatic');
run('bindings["Standard full gamepad"]={fire:4,bomb:5,pause:8}');
run("$('#settings').close(); $('#half-default').click()");gamepads=[left,right];
left.buttons[1].pressed=true;read();
assert.deepEqual(json('pads()'),[],'restore waits for held buttons to release');
left.buttons[1].pressed=false;read();
assert.deepEqual(json('pads().map(p=>p.index)'),[-100,-101],'restore automatic defaults');
assert.equal(run('bindings["Standard full gamepad"].fire'),4,'restore preserves unrelated full-pad remaps');
assert.equal(run('halfControllers.snapshot().defaultsEnabled'),true);
run("mode='ready'; controllerSetup.poll(); $('#settings').showModal(); controllerSetup.poll()");
assert.match(el('#joycon-ready-0').textContent,/LEFT JOY-CON · READY · P1/);
assert.match(el('#joycon-ready-1').textContent,/RIGHT JOY-CON · READY · P2/);
run('assignments[0]=9; controllerSetup.poll()');
assert.match(el('#joycon-ready-0').textContent,/READY · P2/,'readiness follows the available player slot');
run('assignments[1]=10; controllerSetup.poll()');
assert.match(el('#joycon-ready-0').textContent,/Player slots occupied/);
run('assignments.fill(null)');
gamepads=[];run("mode='ready'; controllerSetup.poll()");
assert.equal(run('touchOnly()'),true,'no hardware returns to touch mode');
console.log('PASS: fresh standalone right-first P1/P2, movement/fire/bomb/pause, combined preset, full pads, saved remap/calibration reload, restore defaults, readiness and touch fallback (Node VM; simulated gamepads).');

// Both connection orders and browsers that withhold devices until interaction.
run("$('#settings').close(); mode='ready'; assignments.fill(null); previous.clear()");
gamepads=[left,right];press(left,1);press(right,3);
assert.deepEqual(json('[...assignments]'),[-100,-101],'left-first retains side association');
sandbox.window.lan={active:true};gamepads=[];run('controllerSetup.poll()');
assert.equal(run('touchOnly()'),false,'LAN session does not change input mode');
sandbox.window.lan=null;
// Storage can be unavailable: known standard singles still work without setup.
const storage=sandbox.localStorage;
sandbox.localStorage={getItem(){throw new Error('Storage unavailable');},setItem(){throw new Error('Storage unavailable');}};
vm.runInContext(fs.readFileSync('src/half-controllers.js','utf8'),sandbox);
sandbox.halfControllers=sandbox.window.halfControllers;
gamepads=[left,right];run("mode='ready'; assignments.fill(null); previous.clear(); controllerSetup.poll()");
press(right,3);press(left,1);
assert.deepEqual(json('[...assignments]'),[-100,-101],'unavailable storage does not require calibration');
assert.deepEqual(json('halfControllers.snapshot().profiles'),[null,null]);
run("$('#half-default').click()");
sandbox.localStorage=storage;
// Optional remapping must see buttons outside the automatic fire/bomb/pause trio.
gamepads=[left,right];read();
run("$('#settings').showModal(); capture={index:-100,action:'fire'}");
press(left,7);
assert.equal(run('config(pads().find(p=>p.index===-100)).fire'),23);
assert.equal(JSON.parse(saved.get('catfighter-bindings'))['Half Joy-Con P1'].fire,23);
run("$('#settings').close(); assignments[0]=-100");
left.buttons[7].pressed=true;
assert.equal(run('input(0).fire'),true,'optional remap drives actual player input');
left.buttons[7].pressed=false;
// Calibrate a known standalone without disabling automatic defaults. Its saved
// axes/buttons must take priority while the other side remains automatic.
left.axes.fill(0);right.axes.fill(0);
run("$('#settings').showModal(); $('#half-p1').click()");neutral();
for (const [axis,value] of [[0,-1],[1,1]]) {left.axes[axis]=value;read();left.axes[axis]=0;neutral();}
for (const b of [4,5,8]) {left.buttons[b].pressed=true;read();left.buttons[b].pressed=false;neutral();}
assert.equal(run('halfControllers.snapshot().defaultsEnabled'),true);
assert.equal(run('halfControllers.snapshot().profiles[0].buttons[0]'),4);
vm.runInContext(fs.readFileSync('src/half-controllers.js','utf8'),sandbox);
sandbox.halfControllers=sandbox.window.halfControllers;
left.index=24;left.axes[0]=-.8;read();
assert.equal(run('pads().find(p=>p.index===-100).axes[0]'),.8);
assert.equal(run('pads().filter(p=>p.index===-100).length'),1,'saved calibration replaces automatic single');
assert.equal(run('pads().find(p=>p.index===-101).preferredSlot'),1,'other side stays automatic');
left.buttons[7].pressed=true;
assert.equal(run('input(0).fire'),true,'saved spare-button remap survives calibration and reload');
left.buttons[7].pressed=false;
run("$('#half-default').click()");left.axes[0]=0;read();
assert.equal(run('config(pads().find(p=>p.index===-100)).fire'),1,'restore removes optional remap');
assert.deepEqual(json('halfControllers.snapshot().profiles'),[null,null]);
console.log('PASS: optional spare-button remap, standalone calibration with automatic defaults enabled, saved reload/reconnect and restore.');
const unknown=make('Unknown controller',30), nonstandard=make('Joy-Con (L)',31);
nonstandard.mapping='';gamepads=[unknown,nonstandard];
assert.equal(run('pads()[0]'),unknown);
assert.equal(run('pads()[1]'),nonstandard,'unrecognized layouts remain available for optional calibration');
const html=fs.readFileSync('index.html','utf8'), css=fs.readFileSync('style.css','utf8');
assert.match(html, /id="test"(?![^>]*hidden)[^>]*aria-controls="settings"/);
assert.match(html, /id="demo-controllers"[^>]*aria-controls="settings"/);
assert.match(html, /<dialog id="settings" aria-labelledby="controller-title">/);
assert.ok(!css.includes('.arcade-shell #test,') && !css.includes(':is(#test,'),'settings no longer hidden by shell/touch selectors');
console.log('PASS: both join orders, LAN input-mode guard and discoverable settings markup (visual QA still requires browser).');
