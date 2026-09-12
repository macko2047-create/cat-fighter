'use strict';
// Render-only copies. Never write into snapshots or run simulation on the guest.
((root)=>{
  const groups=['players','enemies','shots','hostile','drops','sparks','bossDebris'];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const compatible=(a,b)=>a&&b&&a.netId!=null&&a.netId===b.netId&&a.type===b.type&&a.lives===b.lives&&a.respawn===b.respawn&&a.entering===b.entering&&!b.dead&&Math.hypot(a.x-b.x,a.y-b.y)<100;
  function create(){
    let history=[],predicted=null,lastFrame=null,renderTime=null;
    const samples={arrivals:[],frames:[],corrections:[]};
    const record=(key,value)=>{samples[key].push(value);if(samples[key].length>1800)samples[key].shift();};
    const stats=values=>{const a=[...values].sort((a,b)=>a-b),mean=a.reduce((s,x)=>s+x,0)/(a.length||1);return {count:a.length,mean,p95:a[Math.ceil(a.length*.95)-1]??0,max:a.at(-1)??0,std:Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length||1))};};
    let frameKind='inactive',frameCorrection=0,appliedCorrection=0,entityFallbacks=0,pendingSnap=false;
    function reset(){history=[];predicted=null;lastFrame=null;renderTime=null;pendingSnap=false;}
    function accept(state,time){
      const previous=history.at(-1);
      record('arrivals',{time,interval:previous?time-previous.time:null,simulationMs:previous?(state.elapsed-previous.state.elapsed)*1000:null});
      if(predicted&&state.players[1])record('corrections',Math.hypot(predicted.x-state.players[1].x,predicted.y-state.players[1].y));
      if(previous&&(state.mode!==previous.state.mode||state.loop!==previous.state.loop||state.elapsed<previous.state.elapsed||time-previous.time>250||Math.abs((state.elapsed-previous.state.elapsed)*1000-(time-previous.time))>250))reset();
      history.push({state,time,clock:state.elapsed*1000});if(history.length>12)history.shift();
      const p=state.players[1];
      if(!p||!compatible(predicted,p)||p.lives<=0||p.respawn>0||p.entering){pendingSnap=!!predicted;predicted=null;}
    }
    function render(state,now,input,ready){
      const dt=lastFrame!==null?clamp((now-lastFrame)/1000,0,.035):0;lastFrame=now;
      const latest=history.at(-1);
      if(!ready||state.mode!=='playing'||!latest||now-latest.time>250){if(ready&&state.mode==='playing')frameKind='frozen';predicted=null;return state;}
      // Use the existing simulation timestamp, not packet spacing, for motion.
      // Slew the local clock by at most 2%; packet jitter cannot jump it.
      const target=now-Math.min(...history.map(s=>s.time-s.clock))-100;
      const step=dt*1000;
      renderTime=renderTime===null?target:renderTime+step+clamp(target-renderTime-step,-step*.02,step*.02);
      const time=renderTime;let a=history[0],b=a;
      for(const item of history){if(item.clock<=time)a=item;if(item.clock>=time){b=item;break;}b=item;}
      frameKind=a===b?'frozen':'interpolated';
      const alpha=a===b?1:clamp((time-a.clock)/(b.clock-a.clock),0,1);
      const out={...state};
      for(const group of groups){
        const old=new Map(a.state[group].map(o=>[o.netId,o])),next=new Map(b.state[group].map(o=>[o.netId,o]));
        // Membership and all nonvisual fields always come from the newest state.
        out[group]=state[group].map(o=>{
          const x=old.get(o.netId),y=next.get(o.netId);
          if(!compatible(x,y)||!compatible(y,o)){entityFallbacks++;return {...o};}
          const copy={...o,x:x.x+(y.x-x.x)*alpha,y:x.y+(y.y-x.y)*alpha};
          if(group==='bossDebris')copy.angle=x.angle+(y.angle-x.angle)*alpha;
          return copy;
        });
      }
      out.ambient=a.state.ambient+(b.state.ambient-a.state.ambient)*alpha;
      out.elapsed=a.state.elapsed+(b.state.elapsed-a.state.elapsed)*alpha;
      const p=state.players[1];
      if(state.inputEpoch===undefined&&p&&p.lives>0&&p.respawn===0&&!p.entering&&state.loopTransition===0){
        if(!compatible(predicted,p))predicted={...p};
        let x=input.x,y=input.y;
        if(input.target){x=input.target.x-predicted.x;y=input.target.y-predicted.y;const n=Math.hypot(x,y);if(n){const scale=Math.min(1,n/(260*Math.max(dt,.001)))/n;x*=scale;y*=scale;}}
        predicted.x=clamp(predicted.x+x*260*dt,24,576);predicted.y=clamp(predicted.y+y*260*dt,60,775);
        // Advance the reconciliation target between packets too. A stationary
        // target fought local integration every frame and caused a 20 Hz ripple.
        // Bound stale-state projection to 50 ms (13 px), including the lead.
        const lead=260*clamp((renderTime+100-latest.clock)/1000,0,.05);
        let tx=clamp(p.x+x*lead,24,576),ty=clamp(p.y+y*lead,60,775);
        if(input.target){const dx=input.target.x-p.x,dy=input.target.y-p.y,n=Math.hypot(dx,dy),scale=n?Math.min(1,lead/n):0;tx=clamp(p.x+dx*scale,24,576);ty=clamp(p.y+dy*scale,60,775);}
        const error=Math.hypot(tx-predicted.x,ty-predicted.y);
        frameCorrection=error;
        const blend=error>80?1:1-Math.exp(-dt/0.1);
        appliedCorrection=error*blend;
        predicted.x+=(tx-predicted.x)*blend;predicted.y+=(ty-predicted.y)*blend;
        out.players[1]={...p,x:predicted.x,y:predicted.y};
      }else predicted=null;
      return out;
    }
    return {accept,reset,
      render(state,now,input,ready){
        const previous=lastFrame;frameKind='inactive';frameCorrection=appliedCorrection=entityFallbacks=0;
        const out=render(state,now,input,ready);
        record('frames',{interval:previous!==null?now-previous:null,kind:frameKind,predicted:!!predicted,
          corrected:appliedCorrection>.01,snapped:pendingSnap||frameCorrection>80,correction:frameCorrection,appliedCorrection,entityFallbacks,
          delay:renderTime===null?null:now-Math.min(...history.map(s=>s.time-s.clock))-renderTime,
          buffered:history.filter(s=>s.clock>renderTime).length,stale:!!history.length&&now-history.at(-1).time>250});
        pendingSnap=false;return out;
      },
      resetDiagnostics(){for(const key in samples)samples[key]=[];},
      diagnostics(){
        const frames=samples.frames,total=frames.length;
        const categories=Object.fromEntries(['interpolated','frozen','inactive','predicted','corrected','snapped','stale'].map(k=>{
          const count=frames.filter(f=>f.kind===k||f[k]===true).length;
          return [k,{count,percent:total?100*count/total:0}];
        }));
        return {
          scope:'last 1800 samples per series; milliseconds and game pixels',
          arrivalMs:stats(samples.arrivals.map(s=>s.interval).filter(x=>x!==null)),
          simulationMs:stats(samples.arrivals.map(s=>s.simulationMs).filter(x=>x!==null)),
          frameMs:stats(frames.map(s=>s.interval).filter(x=>x!==null)),
          renderDelayMs:100,frames:total,categories,
          arrivalCorrectionPx:stats(samples.corrections),
          appliedCorrectionPx:stats(frames.map(f=>f.appliedCorrection)),
          effectiveRenderDelayMs:stats(frames.map(f=>f.delay).filter(x=>x!==null)),
          entityFallbacks:stats(frames.map(f=>f.entityFallbacks)),
          reconciliationErrorPx:stats(frames.map(f=>f.correction)),
          bufferedSnapshots:stats(frames.map(f=>f.buffered)),
        };
      }

    };
  }
  root.CatPresentation={create};
  if(typeof module!=='undefined')module.exports=root.CatPresentation;
})(typeof window==='undefined'?globalThis:window);
