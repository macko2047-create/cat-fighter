'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.env.CAT_ROOT || path.resolve(__dirname, '..');
function setup(visual) {
  const events = {}, viewportEvents = {}, properties = {};
  const element = {addEventListener() {}, hasPointerCapture() {return false;}};
  const document = {documentElement:{style:{setProperty(k,v) {properties[k]=v;}}},
    body:{classList:{toggle() {}},dataset:{}},addEventListener() {}};
  const window = {innerWidth:960,innerHeight:1280,addEventListener(k,v) {events[k]=v;}};
  if (visual) window.visualViewport = {...visual,addEventListener(k,v) {viewportEvents[k]=v;}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/controls.js'),'utf8'), {
    window,document,$:()=>element,mode:'ready',players:[],loopTransition:0,
  });
  return {window,events,viewportEvents,properties};
}
test('iPad visible area follows browser chrome, rotation and viewport offsets', () => {
  const s=setup({width:960,height:1170,offsetTop:0,offsetLeft:0});
  assert.equal(s.properties['--play-height'],'1170px');
  for (const [width,height,top,left,event] of [[960,1080,0,0,'resize'],[1280,850,0,0,'resize'],[960,1100,12,4,'scroll']]) {
    Object.assign(s.window.visualViewport,{width,height,offsetTop:top,offsetLeft:left});
    s.window.flightControls.active=true;
    s.viewportEvents[event]();
    assert.deepEqual(s.properties,{'--play-width':`${width}px`,'--play-height':`${height}px`,'--play-top':`${top}px`,'--play-left':`${left}px`});
    assert.equal(s.window.flightControls.active,false);
  }
});
test('fallback tracks window size without VisualViewport', () => {
  const s=setup();
  assert.equal(s.properties['--play-height'],'1280px');
  s.window.innerHeight=700;s.events.resize();
  assert.equal(s.properties['--play-height'],'700px');
  assert.equal(s.properties['--play-top'],'0px');
});
