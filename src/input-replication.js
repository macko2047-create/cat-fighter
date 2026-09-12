'use strict';
// Movement-only prediction. World simulation and gameplay results stay on P1.
((root)=>{
  const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
  function move(p,c,dt){
    if(!p||p.lives<=0||p.respawn>0||p.entering)return;
    let {x,y}=c;
    if(c.target){const dx=c.target.x-p.x,dy=c.target.y-p.y,n=Math.hypot(dx,dy),scale=n?Math.min(1,n/(260*dt))/n:0;x=dx*scale;y=dy*scale;}
    p.x=limit(p.x+x*260*dt,24,576);p.y=limit(p.y+y*260*dt,60,775);
  }
  function create(){
    let epoch=null,next=0,ack=0,pending=[],queue=new Map(),simulation=null,offset={x:0,y:0},credit=0;
    const metrics={sent:0,processed:0,reconciliations:0,errorTotal:0,maxError:0,duplicates:0,stale:0,outOfOrder:0};
    // A host-issued epoch fences off every queued command from an old session.
    function reset(e=null){epoch=e;next=ack=0;pending=[];queue.clear();simulation=null;offset={x:0,y:0};credit=0;}
    return {reset,
      get epoch(){return epoch;},
      capture(input,dt){if(epoch===null||!simulation||pending.length>=180||dt<=0)return;const c={seq:++next,dt:Math.min(dt,.035),x:input.x,y:input.y,target:input.target};pending.push(c);move(simulation,c,c.dt);metrics.sent++;},
      // Resend until ACK: transport backpressure or packet loss cannot create gaps.
      packet(){return {inputEpoch:epoch,moves:pending.map(c=>({...c}))};},
      receive(data){if(data.inputEpoch!==epoch)return;for(const c of data.moves||[]){if(c.seq<=ack){metrics.stale++;continue;}if(queue.has(c.seq)){metrics.duplicates++;continue;}if(c.seq>ack+180)continue;if(c.seq>ack+1&&!queue.has(c.seq-1))metrics.outOfOrder++;queue.set(c.seq,c);}},
      // Consume whole commands only; the snapshot ACK describes this exact state.
      process(p,dt,allowed){credit=Math.min(.1,credit+dt);while(queue.has(ack+1)){const c=queue.get(ack+1);if(c.dt>credit+1e-9)break;credit-=c.dt;queue.delete(++ack);if(allowed)move(p,c,c.dt);metrics.processed++;}},
      // Rebuild simulation first. Rendering alone keeps the small correction offset.
      reconcile(state){
        if(state.inputEpoch===undefined)return;
        if(epoch!==state.inputEpoch)reset(state.inputEpoch);
        const a=state.lastProcessedInput;if(!Number.isSafeInteger(a)||a<ack||a>next)return;
        ack=a;pending=pending.filter(c=>c.seq>a);
        const p=state.players[1],old=simulation;
        simulation=p?{...p}:null;
        if(state.mode==='playing'&&state.loopTransition===0)for(const c of pending)move(simulation,c,c.dt);
        if(old&&simulation){const error=Math.hypot(old.x-simulation.x,old.y-simulation.y);metrics.reconciliations++;metrics.errorTotal+=error;metrics.maxError=Math.max(metrics.maxError,error);
          if(error<80&&old.netId===p.netId&&old.lives===p.lives&&!p.entering&&!p.respawn&&state.mode==='playing'){offset.x+=old.x-simulation.x;offset.y+=old.y-simulation.y;}else offset={x:0,y:0};}
      },
      visual(dt){if(!simulation)return null;const decay=Math.exp(-dt/.1);offset.x*=decay;offset.y*=decay;return {...simulation,x:simulation.x+offset.x,y:simulation.y+offset.y};},
      diagnostics(){return {...metrics,lastProcessedInput:ack,pendingInputs:pending.length,queuedInputs:queue.size,avgError:metrics.errorTotal/(metrics.reconciliations||1),inputEpoch:epoch};}
    };
  }
  root.CatInputReplication={move,create};if(typeof module!=='undefined')module.exports=root.CatInputReplication;
})(typeof window==='undefined'?globalThis:window);
