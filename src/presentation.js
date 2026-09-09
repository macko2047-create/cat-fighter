'use strict';
// Render-only copies. Never write into snapshots or run simulation on the guest.
((root)=>{
  const groups=['players','enemies','shots','hostile','drops','sparks','bossDebris'];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const compatible=(a,b)=>a&&b&&a.netId!=null&&a.netId===b.netId&&a.type===b.type&&a.lives===b.lives&&a.respawn===b.respawn&&a.entering===b.entering&&!b.dead&&Math.hypot(a.x-b.x,a.y-b.y)<100;
  function create(){
    let history=[],predicted=null,lastFrame=0;
    function reset(){history=[];predicted=null;lastFrame=0;}
    function accept(state,time){
      const previous=history.at(-1);
      if(previous&&(state.mode!==previous.state.mode||state.loop!==previous.state.loop||state.elapsed<previous.state.elapsed||time-previous.time>250))reset();
      history.push({state,time});if(history.length>12)history.shift();
      const p=state.players[1];
      if(!p||!compatible(predicted,p)||p.lives<=0||p.respawn>0||p.entering)predicted=null;
    }
    function render(state,now,input,ready){
      const dt=lastFrame?clamp((now-lastFrame)/1000,0,.035):0;lastFrame=now;
      const latest=history.at(-1);
      if(!ready||state.mode!=='playing'||!latest||now-latest.time>250){predicted=null;return state;}
      const time=now-100;let a=history[0],b=a;
      for(const item of history){if(item.time<=time)a=item;if(item.time>=time){b=item;break;}b=item;}
      const alpha=a===b?1:clamp((time-a.time)/(b.time-a.time),0,1);
      const out={...state};
      for(const group of groups){
        const old=new Map(a.state[group].map(o=>[o.netId,o])),next=new Map(b.state[group].map(o=>[o.netId,o]));
        // Membership and all nonvisual fields always come from the newest state.
        out[group]=state[group].map(o=>{
          const x=old.get(o.netId),y=next.get(o.netId);
          if(!compatible(x,y)||!compatible(y,o))return {...o};
          const copy={...o,x:x.x+(y.x-x.x)*alpha,y:x.y+(y.y-x.y)*alpha};
          if(group==='bossDebris')copy.angle=x.angle+(y.angle-x.angle)*alpha;
          return copy;
        });
      }
      out.ambient=a.state.ambient+(b.state.ambient-a.state.ambient)*alpha;
      out.elapsed=a.state.elapsed+(b.state.elapsed-a.state.elapsed)*alpha;
      const p=state.players[1];
      if(p&&p.lives>0&&p.respawn===0&&!p.entering&&state.loopTransition===0){
        if(!compatible(predicted,p))predicted={...p};
        let x=input.x,y=input.y;
        if(input.target){x=input.target.x-predicted.x;y=input.target.y-predicted.y;const n=Math.hypot(x,y);if(n){const scale=Math.min(1,n/(260*Math.max(dt,.001)))/n;x*=scale;y*=scale;}}
        predicted.x=clamp(predicted.x+x*260*dt,24,576);predicted.y=clamp(predicted.y+y*260*dt,60,775);
        // No input acknowledgements are introduced: limit visual lead to 50 ms.
        let tx=clamp(p.x+x*13,24,576),ty=clamp(p.y+y*13,60,775);
        if(input.target){const dx=input.target.x-p.x,dy=input.target.y-p.y,n=Math.hypot(dx,dy),scale=n?Math.min(1,13/n):0;tx=clamp(p.x+dx*scale,24,576);ty=clamp(p.y+dy*scale,60,775);}
        const error=Math.hypot(tx-predicted.x,ty-predicted.y);
        const blend=error>80?1:1-Math.exp(-dt/0.1);
        predicted.x+=(tx-predicted.x)*blend;predicted.y+=(ty-predicted.y)*blend;
        out.players[1]={...p,x:predicted.x,y:predicted.y};
      }else predicted=null;
      return out;
    }
    return {accept,render,reset};
  }
  root.CatPresentation={create};
  if(typeof module!=='undefined')module.exports=root.CatPresentation;
})(typeof window==='undefined'?globalThis:window);
