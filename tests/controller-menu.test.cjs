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
let gamepads = [];
const sandbox = {
  console,
  Math,
  document: { querySelector: el, addEventListener() {} },
  window: { addEventListener: (n, fn) => (events[n] = fn) },
  navigator: { getGamepads: () => gamepads },
  localStorage: { getItem: () => null, setItem() {} },
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

// Exercise the real animation-frame dispatch and controller pipeline while
// the arcade consumes the frame (as it does on the attract/start screen).
sandbox.window.arcade = {phase:'off', frame:()=>true, key:()=>true, simulationInput:()=>null,
  beforeStart(){ if(this.phase!=='demo')return false; this.phase='game';return true; }};
const pad = {id:'Test controller',index:0,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
gamepads=[pad];
let timestamp=0;
const tick=()=>run(`frame(${timestamp+=16})`);
const button=(index,pressed)=>{pad.buttons[index]={pressed,value:Number(pressed)};tick();};
button(1,true);
assert.equal(run('assignments[0]'),null,'power-off does not join players');
sandbox.window.arcade.phase='boot';tick();
assert.equal(run('assignments[0]'),null,'boot does not join players');
button(1,false);
sandbox.window.arcade.phase='demo';
// Use the actual secret key sequence to open the previously hidden panel.
for(const key of 'joypad')events.keydown({key,code:'Key'+key.toUpperCase(),target:{tagName:'BODY'},preventDefault(){}});
assert.equal(el('#settings').open,true);
pad.axes[0]=.75;tick();
assert.match(el('[data-pad="0"] pre').textContent,/0.75/,'settings axes refresh in demo');
run("capture={index:0,action:'fire'}");button(2,true);
assert.equal(run('config(pads()[0]).fire'),2,'mapping capture runs in demo');
assert.equal(run('capture'),null);
assert.equal(run('assignments[0]'),null,'configuration does not join');
button(2,false);el('#close').onclick();
el('#lan-dialog').open=true;button(2,true);
assert.equal(run('assignments[0]'),null,'network dialog does not join local players');
button(2,false);el('#lan-dialog').open=false;
button(2,true);
assert.equal(run('assignments[0]'),0,'first press joins from demo');
assert.equal(run('mode'),'ready');
button(2,false);button(2,true);
assert.equal(run('mode'),'playing','next fire press starts');
assert.equal(sandbox.window.arcade.phase,'game');
assert.equal(run('input(0).x'),.75,'assigned stick controls player');
assert.equal(run('input(0).fire'),true,'mapped fire controls player');
console.log('PASS: frame-driven demo controller detection, live settings, mapping, join/start, movement/fire, boot and network-dialog guards.');

// Hybrid input must work without controllerSetup changing the shell's mode.
sandbox.document.body = {dataset:{inputMode:'touch'}};
pad.connected=true;
gamepads=[null, {...pad,index:8,connected:false}, pad];
assert.equal(run('pads().length'),1);
assert.equal(run('pads()[0]'),pad,'touch mode exposes the connected raw controller');
let forwarded;
sandbox.window.halfControllers={read(raw){forwarded=raw;return raw;}};
assert.equal(run('pads()[0]'),pad);
assert.equal(forwarded.length,1,'half-controller pipeline retains disconnected filtering');
delete sandbox.window.halfControllers;
assert.equal(run('input(0).x'),.75);
assert.equal(run('input(0).fire'),true,'touch mode preserves custom fire mapping');
run('mode="ready"; assignments.fill(null); joined.fill(false); previous.clear()');
pad.buttons.forEach(b=>{b.pressed=false;b.value=0;});
run('poll()');
assert.equal(run('assignments.every(x=>x===null) && joined.every(x=>!x)'),true,'connection alone does not join either player');
run('start()');
assert.equal(run('players.length'),1,'touch start retains single-player default');
pad.buttons[2].pressed=true;run('poll()');
assert.equal(run('assignments[0]'),0,'button joins existing touch player');
assert.equal(run('assignments[1]'),null);
assert.equal(run('joined[1]'),false);
assert.equal(run('input(0).x'),.75);
sandbox.window.flightControls={targetFor:i=>i===0?{x:run('players[0].x')-10,y:run('players[0].y')}:null};
assert.equal(run('input(0).x'),-1,'held touch retains movement priority with gamepad connected');
assert.equal(run('input(0).fire'),true,'held touch retains automatic fire');
sandbox.window.flightControls.targetFor=()=>null;
assert.equal(run('input(0).x'),.75,'releasing touch restores gamepad movement');
pad.axes[0]=0;pad.buttons[2].pressed=false;
run('keys.add("KeyD"); keys.add("KeyF")');
assert.equal(run('input(0).x'),1);
assert.equal(run('input(0).fire'),true,'keyboard remains available in touch mode');
assert.equal(sandbox.document.body.dataset.inputMode,'touch');
console.log('PASS: hybrid touch/gamepad read, filtering, half-controller forwarding, gameplay, touch priority/release, keyboard and single-player joining.');

// A live LAN session must not bypass the shared custom-binding capture path.
sandbox.window.lan={active:true,poll(){throw Error('LAN gameplay polled inside settings');}};
el('#settings').open=true;
run("capture={index:0,action:'pause'}");pad.buttons[6].pressed=true;run('poll()');
assert.equal(run('config(pads()[0]).pause'),6);
assert.equal(run('capture'),null);
assert.equal(run('config(pads()[0]).confirm'),1,'custom gameplay actions leave menu defaults unchanged');
console.log('PASS: active LAN settings reuse binding capture without polling gameplay.');
