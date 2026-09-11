'use strict';
// Shared wire boundary: copy only known fields, never remote object prototypes.
((root) => {
  const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const number = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12;
  const bool = v => typeof v === 'boolean';
  const text = v => typeof v === 'string' && v.length <= 160;
  const choice = values => v => values.includes(v);
  function object(value, schema, required) {
    if (!record(value)) throw Error('Invalid network object');
    const out = {};
    for (const key of required) if (!Object.hasOwn(value, key)) throw Error('Missing '+key);
    for (const [key, check] of Object.entries(schema)) {
      if (!Object.hasOwn(value, key)) continue;
      if (!check(value[key])) throw Error('Invalid '+key);
      out[key] = value[key];
    }
    return out;
  }
  const numbers = names => Object.fromEntries(names.split(' ').map(n => [n, number]));
  const player = {...numbers('netId x y lives rejoinRemaining respawn bombs level cool inv index controlSlot aircraft noticeUntil'), entering:bool, rapid:bool, notice:text};
  const enemy = {...numbers('netId x y hp max v phase shoot age difficulty flight startX startY direction visibleAge chargeDuration chargeVX chargeVY chargeAge flightDelay chargeTimer chargeTargetX chargeTargetY damageReactUntil revealUntil damageStage'),
    type:choice(['small','heavy','boat','boss']), chargeState:choice(['ready','windup','charging','spent']), exited:bool};
  const reward = v => object(v,{type:choice(['W','B','1UP']),weapon:choice(['rapid','double','spread'])},['type']);
  function enemyValue(v) { const out=object(v,enemy,['type','x','y','hp','age']);if(Object.hasOwn(v,'reward'))out.reward=reward(v.reward);return out; }
  const vector = numbers('netId x y vx vy');
  function array(v, limit, copy) {
    if(!Array.isArray(v)||v.length>limit)throw Error('Invalid network list');
    return v.map(copy);
  }
  function state(v) {
    const out=object(v,{mode:choice(['ready','playing','paused','over']),...numbers('elapsed score wave loop loopTransition flash ambient'),bossSpawned:bool},
      ['mode','elapsed','score','wave','loop','loopTransition','flash','ambient','bossSpawned']);
    out.players=array(v.players,2,p=>object(p,player,['x','y','lives','respawn','entering','bombs','level','rapid','cool','inv','index']));
    if(out.players.some((p,i)=>p.index!==i||![1,2,3].includes(p.level))||(out.mode!=='ready'&&out.players.length!==2))throw Error('Invalid players');
    out.enemies=array(v.enemies,512,enemyValue);
    out.shots=array(v.shots,2048,s=>({...object(s,{...vector,dead:bool},['x','y','vx']),owner:object(s.owner,{index:choice([0,1])},['index'])}));
    out.hostile=array(v.hostile,4096,s=>object(s,vector,['x','y','vx','vy']));
    out.drops=array(v.drops,256,s=>({...object(s,numbers('netId x y'),['x','y']),...reward(s)}));
    out.sparks=array(v.sparks,8192,s=>object(s,{...vector,life:number,color:text},['x','y','vx','vy','life','color']));
    out.bossDebris=array(v.bossDebris,240,s=>object(s,{...vector,...numbers('angle spin width height life duration'),color:text},['x','y','vx','vy','angle','spin','width','height','life','duration','color']));
    out.bossWreck=v.bossWreck===null?null:enemyValue(v.bossWreck);
    out.aircraft=array(v.aircraft,2,a=>{if(a!==0&&a!==1)throw Error('Invalid aircraft');return a;});
    if(out.aircraft.length!==2)throw Error('Invalid aircraft');
    if (Object.hasOwn(v,'aircraftReady')) {
      out.aircraftReady=array(v.aircraftReady,2,b=>{if(!bool(b))throw Error('Invalid aircraft readiness');return b;});
      if(out.aircraftReady.length!==2)throw Error('Invalid aircraft readiness');
    }
    return out;
  }
  function input(v) {
    const out=object(v,{x:number,y:number,fire:bool},['x','y','fire']);
    out.x=Math.max(-1,Math.min(1,out.x));out.y=Math.max(-1,Math.min(1,out.y));
    out.target=null;
    if(v.target!==null){out.target=object(v.target,numbers('x y'),['x','y']);out.target.x=Math.max(24,Math.min(576,out.target.x));out.target.y=Math.max(60,Math.min(775,out.target.y));}
    out.actions=array(v.actions,8,a=>{if(!['bomb','rejoin','pause','aircraft-0','aircraft-1','confirm-aircraft','cancel-aircraft'].includes(a))throw Error('Invalid action');return a;});
    return out;
  }
  root.CatNetProtocol={state,input,MAX_BYTES:512*1024};
  if(typeof module!=='undefined')module.exports=root.CatNetProtocol;
})(typeof window==='undefined'?globalThis:window);
