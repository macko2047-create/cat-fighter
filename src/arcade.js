'use strict';
(() => {
  // Short gameplay beats interrupt the lessons; every chapter is skippable.
  const chapters = [
    {id:'title',seconds:6,title:'CAT FIGHTER',copy:'Cat squadron · Coral Sea sortie'},
    {id:'drag',seconds:7,title:'HOLD & DRAG',copy:'Fly ahead of your finger · Hold to fire'},
    {id:'release',seconds:3,title:'RELEASE TO STOP',copy:'Movement and fire stop · Battle continues'},
    {id:'rapid',seconds:6,title:'KAMIKAZE → RAPID',copy:'Every kamikaze carries RAPID · Shoot it down, then collect',carrier:'small'},
    {id:'battle',seconds:4,title:'BREAK THROUGH',copy:'Hit, destroy, score!'},
    {id:'double',seconds:6,title:'FIRST FLEET → 2-WAY',copy:'One boat carries 2-WAY · Sink it, then collect',carrier:'boat',wave:LEVEL1.boatWaveCadence},
    {id:'bomb',seconds:6,title:'Double Tap',copy:'Tap the same spot twice to drop a bomb'},
    {id:'supply',seconds:6,title:'MID-BOSS · BOMB 50%',copy:'Drop example · 10% 1UP · 40% no reward',carrier:'heavy',roll:0},
    {id:'spread',seconds:6,title:'NEXT FLEET → 3-WAY',copy:'One boat carries 3-WAY · Then 2-WAY / 3-WAY repeat',carrier:'boat',wave:LEVEL1.boatWaveCadence*2},
    {id:'life',seconds:6,title:'MID-BOSS · 1UP 10%',copy:'Rare drop example · Defeat the carrier → Collect +1 life',carrier:'heavy',roll:LEVEL1.heavyBombChance},
    {id:'boss',seconds:11,title:'FLYING FORTRESS',copy:'Final phase: dense fire, slower bullets · Dodge and finish it'},
    {id:'loop',seconds:7,title:`NEXT LOOP · +${Math.round(LEVEL1.loopDifficultyStep*100)}%`,copy:'Each loop: faster enemies & fire · More Boss HP'},
  ];
  let phase='off', clock=0, index=0, time=0, scene=null, simulating=false;
  let steering={x:0,y:0,fire:false}, trail=[], bombUsed=false, overTime=0;
  let lastScore=0, feedback='', feedbackUntil=0, lastFieldHeight=0;
  const body=document.body, neutral=()=>({x:0,y:0,fire:false});
  const setPhase=value=>{phase=value;body.dataset.arcade=value;};
  const planeY=()=>Math.min(540,Math.max(200,H*.78-180*H/canvas.getBoundingClientRect().height));
  const enemy=(x,y,type='small')=>({type,x,y,hp:ENEMY_DEFINITIONS[type].baseHP ?? ENEMY_DEFINITIONS.small.baseHP,
    v:type==='heavy'?ENEMY_DEFINITIONS.heavy.speed:LEVEL1.enemySpeedBase,phase:0,shoot:2.5,age:0});
  function inScene(callback) {
    simulating=true;
    try {runGamePreview(scene,callback);} finally {simulating=false;}
  }
  function beginChapter() {
    const c=chapters[index], p={...pilot(0),x:300,y:planeY(),aircraft:0,inv:0};
    $('#attract').dataset.chapter=c.id;
    $('#demo-title').textContent=c.title; $('#demo-copy').textContent=c.copy;
    if(c.carrier) {
      const rect=canvas.getBoundingClientRect();
      p.y=clamp(($('#demo-start').getBoundingClientRect().top-rect.top-40)*H/rect.height,200,H-60);
    }
    if(c.id==='spread')p.level=2;
    if(c.id==='boss'){p.level=3;p.rapid=true;}
    scene={mode:'playing',elapsed:0,score:0,players:[p],enemies:[],shots:[],hostile:[],drops:[],sparks:[],bossDebris:[],
      wave:999,loop:1,loopTransition:0,bossSpawned:true,bossWreck:null,
      flash:0,ambient:clock};
    if(c.carrier) {
      const rect=canvas.getBoundingClientRect();
      const belowCaption=($('.demo-caption').getBoundingClientRect().bottom-rect.top+25)*H/rect.height;
      const carrierY=Math.max(belowCaption,p.y-200);
      const carrier=enemy(300,carrierY,c.carrier);
      if(c.carrier==='small') {
        configureSmallFlight(carrier,4,4,5);
        carrier.x=carrier.startX=300;carrier.y=carrier.startY=carrierY;
      } else {
        carrier.reward=formationReward(c.carrier,c.wave || LEVEL1.heavyWaveCadence,c.roll);
      }
      scene.enemies.push(carrier);
      if(c.carrier!=='small')scene.enemies.push(enemy(430,carrier.y-70,c.carrier));
    }
    else if(c.id==='loop') {
      // Show the next loop with the real formation speed/HP/firing multiplier.
      scene.loop=2;scene.wave=0;inScene(()=>spawn());
    }
    else if(c.id==='boss')scene.enemies.push({type:'boss',x:300,y:100,hp:LEVEL1.bossHP1P*.3,max:LEVEL1.bossHP1P,age:0,shoot:.8});
    else if(c.id==='bomb') {
      scene.enemies=[enemy(170,160,'heavy'),enemy(430,170,'heavy')];
      scene.hostile=Array.from({length:16},(_,i)=>({x:55+i*32,y:p.y-280+(i%3)*20,vx:0,vy:80}));
    } else if(c.id!=='release') scene.enemies=[enemy(300,120),enemy(170,70),enemy(430,30)];
    trail=[];bombUsed=false;steering=neutral();lastScore=0;feedback='';feedbackUntil=0;
    $('#attract').dataset.chapter=c.id;
    $('#demo-chapter').textContent=c.carrier==='heavy'?'DROP EXAMPLE · NOT GUARANTEED':c.carrier?'SHOOT → DROP → COLLECT':c.id==='loop'?'LOOP 2 · EXAMPLE': ['drag','release','bomb'].includes(c.id)?'HOW TO PLAY':'PACIFIC PAWS / 1943';
    $('#demo-title').textContent=c.title; $('#demo-copy').textContent=c.copy;
    $('#demo-counter').textContent=`${String(index+1).padStart(2,'0')} / ${chapters.length}`;
  }
  function dismiss() {
    if(phase==='off'||phase==='boot')return false;
    setPhase('game');$('#attract').hidden=true;scene=null;overTime=0;
    $('#demo-return').hidden=true;keys.clear();window.flightControls?.reset();return true;
  }
  function attract() {
    if(window.lan?.active)return;
    window.aircraftMenu?.reset();
    mode='ready';joined.fill(false);players=[];enemies=[];shots=[];hostile=[];drops=[];sparks=[];
    bossDebris=[];score=elapsed=0;loop=1;loopTransition=0;bossWreck=null;flash=0;
    clock=time=index=overTime=0;keys.clear();setPhase('demo');
    $('#boot-screen').hidden=true;$('#overlay').style.display='none';$('#attract').hidden=false;
    $('#demo-return').hidden=true;$('#demo-sound').textContent=$('#sound').textContent;
    updateHUD();beginChapter();
  }
  function step(dt) {
    const c=chapters[index];
    inScene(()=>{
      const p=players[0];
      let targetX=p.x,targetY=c.carrier ? p.y : planeY();
      if(c.id==='drag')targetX=300+Math.sin(time*.9)*120;
      else if(c.carrier || ['title','battle','boss','loop'].includes(c.id)) {
        targetX=(drops[0]||enemies.find(e=>e.reward && e.y>0)||(!c.carrier && enemies.find(e=>e.y>0))||{x:p.x}).x;
        // Move away from approaching bullets instead of ignoring damage.
        const threat=hostile.find(b=>b.y<p.y&&p.y-b.y<110&&Math.abs(b.x-p.x)<48);
        if(threat && !drops.length)targetX=clamp(p.x+(threat.x>=p.x?-100:100),60,540);
      }
      if(c.id==='release')targetY=p.y;
      let x=targetX-p.x,y=targetY-p.y;
      const scale=Math.max(260*dt,Math.hypot(x,y));
      steering={x:x/scale,y:y/scale,fire:c.id!=='release'&&(c.id!=='bomb'||time>2.5)};
      if(c.id==='bomb'&&!bombUsed&&time>=2.25){bomb(p);bombUsed=true;feedback='BOMB −1 · ENEMY FIRE CLEARED';feedbackUntil=time+1.8;}
      ambient+=dt;update(dt);updateEffects(dt);
      if(score>lastScore){feedback=`KILL +${score-lastScore}`;feedbackUntil=time+1;lastScore=score;}
      if(p.noticeUntil>elapsed){feedback=p.notice;feedbackUntil=time+.25;}
      if((c.id==='title'||c.id==='battle')&&enemies.length===0&&time<c.seconds-1)
        enemies.push(enemy(clamp(p.x,90,510),50),enemy(150,0),enemy(450,-50));
    });
    if(c.id==='drag') {
      const p=scene.players[0];trail.push({x:p.x,y:p.y});if(trail.length>24)trail.shift();
    }
  }
  function paint() {
    const c=chapters[index],p=scene.players[0],fieldHeight=canvas.getBoundingClientRect().height;
    if(fieldHeight!==lastFieldHeight){p.y=planeY();trail=[];lastFieldHeight=fieldHeight;}
    inScene(()=>draw());
    const finger=$('#demo-finger'), teaching=['drag','release','bomb'].includes(c.id);
    finger.hidden=!teaching;
    finger.dataset.gesture=c.id;
    finger.style.left=`${p.x/W*100}%`;
    finger.style.top=`calc(${p.y/H*100}% + 72px)`;
    const pressing=c.id==='drag'||(c.id==='bomb'&&((time>=2&&time<2.12)||(time>=2.25&&time<2.37)));
    finger.dataset.pressed=String(pressing);
    $('#demo-gesture').textContent=c.id==='drag'?'HOLD → DRAG':c.id==='release'?'RELEASE':'Double Tap';
    if(teaching) {
      const offset=72*H/fieldHeight;
      ctx.save();ctx.strokeStyle='#fff0b5';ctx.lineWidth=3;
      if(c.id==='drag'&&trail.length){ctx.globalAlpha=.5;ctx.beginPath();trail.forEach((v,i)=>i?ctx.lineTo(v.x,v.y+offset):ctx.moveTo(v.x,v.y+offset));ctx.stroke();}
      const tapAge=c.id==='bomb' ? time>=2.25?time-2.25:time>=2?time-2:99 : 0;
      if(c.id==='drag'||tapAge<.45){ctx.globalAlpha=c.id==='drag'?.8:1-tapAge/.45;ctx.beginPath();ctx.arc(p.x,p.y+offset,16+tapAge*85,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    }
    $('#demo-feedback').textContent=time<feedbackUntil?feedback:'';
    $('#demo-feedback').hidden=time>=feedbackUntil;
    $('#demo-progress').style.width=`${time/c.seconds*100}%`;
    $('#score').textContent=String(scene.score).padStart(6,'0');$('#status').textContent='DEMO';
    $('#flight-health').textContent=`P1 ♥ ×${p.lives}　 BOMB ×${p.bombs}`;
  }
  window.arcade={
    get phase(){return phase;},get simulating(){return simulating;},
    // Read-only diagnostics for simulation/integration checks.
    get demoState(){return scene?JSON.parse(JSON.stringify(scene)):null;},
    get chapter(){return chapters[index].id;},
    simulationInput(i){return simulating?(i===0?steering:neutral()):null;},
    beforeStart:dismiss,dismiss,
    key(e){
      if(phase==='game')return false;
      if(e.target?.tagName==='BUTTON')return true;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))return false;
      if(e.code==='Enter'&&!e.repeat&&phase==='demo'&&!$('#lan-dialog').open)start();
      e.preventDefault();return true;
    },
    frame(dt){
      $('#watch-demo').disabled=!!window.lan?.active;
      const frozen=document.hidden||$('#lan-dialog').open||$('#settings').open;
      if(phase==='game') {
        const returning=mode==='over'&&!window.lan?.active;
        $('#demo-return').hidden=!returning;
        if(returning){if(!frozen)overTime+=dt;$('#demo-return').textContent=`${Math.max(0,Math.ceil(15-overTime))}s until DEMO · Press RETRY to fly again`;if(overTime>=15){attract();paint();return true;}}
        else overTime=0;
        return false;
      }
      if(phase==='boot'&&!frozen){clock+=dt;$('#boot-text').textContent=['DISPLAY ................ OK','TOUCH INPUT ............ READY','SPRITES ................ LOADING','PACIFIC PAWS ........... READY'].slice(0,Math.min(4,1+Math.floor(clock/.6))).join('\n');if(clock>=2.8)attract();}
      else if(phase==='demo'&&!frozen) {
        // Fixed substeps preserve actual collision/shot timing even in probes.
        let remaining=Math.min(Math.max(dt,0),120);
        while(remaining>1e-8){const stepSize=Math.min(remaining,1/60,chapters[index].seconds-time);time+=stepSize;clock+=stepSize;step(stepSize);remaining-=stepSize;
          if(time>=chapters[index].seconds-1e-8){index=(index+1)%chapters.length;time=0;beginChapter();}}
      }
      if(phase==='demo')paint();return true;
    },
  };
  $('#boot').onclick=()=>{if(phase!=='off')return;setPhase('boot');clock=0;$('#boot').hidden=true;$('#boot-log').hidden=false;sound=true;sfx.playSfx('start');$('#sound').textContent=$('#demo-sound').textContent='SOUND ON';$('#fullscreen').onclick();};
  $('#demo-start').onclick=()=>start();
  $('#demo-lan').onclick=()=>$('#lan-open').onclick();
  $('#demo-options').onclick=()=>{dismiss();show('READY FOR TAKEOFF','Choose your aircraft and fly solo or with a friend.');};
  $('#demo-sound').onclick=()=>{$('#sound').onclick();$('#demo-sound').textContent=$('#sound').textContent;};
  $('#watch-demo').onclick=attract;$('#overlay').style.display='none';window.flightControls?.sync();
})();
