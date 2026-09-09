'use strict';
(() => {
  // Short gameplay beats interrupt the lessons; every chapter is skippable.
  const chapters = [
    {id:'title',seconds:6,title:'CAT FIGHTER',copy:'貓貓飛行隊 · 珊瑚海出擊'},
    {id:'drag',seconds:7,title:'按住並拖動',copy:'跟隨手指前方 · 按住自動射擊'},
    {id:'release',seconds:3,title:'放開，戰機停下',copy:'停止移動及射擊 · 戰鬥仍會繼續'},
    {id:'rapid',seconds:5,title:'RAPID · 快射',copy:'拾取閃電 → 射擊速度加倍',reward:{type:'W',weapon:'rapid'}},
    {id:'battle',seconds:4,title:'穿越敵陣',copy:'命中、擊落、得分！'},
    {id:'double',seconds:5,title:'2-WAY · 雙線',copy:'拾取雙箭頭 → 雙線火力',reward:{type:'W',weapon:'double'}},
    {id:'bomb',seconds:6,title:'同一位置，輕觸兩下',copy:'雙擊 → 炸彈清除彈幕'},
    {id:'supply',seconds:4,title:'BOMB · 補給',copy:'拾取炸彈 → 補充一枚',reward:{type:'B'}},
    {id:'spread',seconds:5,title:'3-WAY · 散射',copy:'拾取三箭頭 → 擴闊攻擊範圍',reward:{type:'W',weapon:'spread'}},
    {id:'life',seconds:4,title:'1UP · 再一次機會',copy:'拾取貓貓金幣 → 增加一條生命',reward:{type:'1UP'}},
    {id:'boss',seconds:11,title:'空中堡壘 · 決戰',copy:'頭目已受損 · 閃避火網，完成最後一擊'},
  ];
  let phase='off', clock=0, index=0, time=0, scene=null, simulating=false;
  let steering={x:0,y:0,fire:false}, trail=[], bombUsed=false, overTime=0;
  let lastScore=0, feedback='', feedbackUntil=0, lastFieldHeight=0;
  const body=document.body, neutral=()=>({x:0,y:0,fire:false});
  const setPhase=value=>{phase=value;body.dataset.arcade=value;};
  const planeY=()=>Math.min(540,Math.max(200,H*.78-155*H/canvas.getBoundingClientRect().height));
  const enemy=(x,y,type='small')=>({type,x,y,hp:ENEMY_DEFINITIONS[type].baseHP,
    v:type==='heavy'?ENEMY_DEFINITIONS.heavy.speed:LEVEL1.enemySpeedBase,phase:0,shoot:2.5,age:0});
  function inScene(callback) {
    simulating=true;
    try {runGamePreview(scene,callback);} finally {simulating=false;}
  }
  function beginChapter() {
    const c=chapters[index], p={...pilot(0),x:300,y:planeY(),aircraft:0,inv:0};
    if(c.id==='spread')p.level=2;
    if(c.id==='boss'){p.level=3;p.rapid=true;}
    scene={mode:'playing',elapsed:0,score:0,players:[p],enemies:[],shots:[],hostile:[],drops:[],sparks:[],bossDebris:[],
      wave:999,loop:1,loopTransition:0,bossSpawned:true,bossWreck:null,nextSupply:Infinity,
      extraLifeSpawned:true,recoveryRewardPending:false,flash:0,ambient:clock};
    if(c.reward)scene.drops.push({...c.reward,x:300,y:p.y-115});
    else if(c.id==='boss')scene.enemies.push({type:'boss',x:300,y:100,hp:LEVEL1.bossHP1P*.3,max:LEVEL1.bossHP1P,age:0,shoot:.8});
    else if(c.id==='bomb') {
      scene.enemies=[enemy(170,160,'heavy'),enemy(430,170,'heavy')];
      scene.hostile=Array.from({length:16},(_,i)=>({x:55+i*32,y:p.y-280+(i%3)*20,vx:0,vy:80}));
    } else if(c.id!=='release') scene.enemies=[enemy(300,120),enemy(170,70),enemy(430,30)];
    trail=[];bombUsed=false;steering=neutral();lastScore=0;feedback='';feedbackUntil=0;
    $('#attract').dataset.chapter=c.id;
    $('#demo-chapter').textContent=c.reward?'SUPPLY / 補給': ['drag','release','bomb'].includes(c.id)?'HOW TO PLAY':'PACIFIC PAWS / 1943';
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
      let targetX=p.x,targetY=planeY();
      if(c.id==='drag')targetX=300+Math.sin(time*.9)*120;
      else if(c.id==='title'||c.id==='battle'||c.id==='boss') {
        targetX=(drops[0]||enemies.find(e=>e.y>0)||{x:300}).x;
        // Move away from approaching bullets instead of ignoring damage.
        const threat=hostile.find(b=>b.y<p.y&&p.y-b.y<110&&Math.abs(b.x-p.x)<48);
        if(threat)targetX=clamp(p.x+(threat.x>=p.x?-100:100),60,540);
      }
      if(c.id==='release')targetY=p.y;
      let x=targetX-p.x,y=targetY-p.y;
      const scale=Math.max(260*dt,Math.hypot(x,y));
      steering={x:x/scale,y:y/scale,fire:c.id!=='release'&&(c.id!=='bomb'||time>2.5)};
      if(c.id==='bomb'&&!bombUsed&&time>=2.25){bomb(p);bombUsed=true;feedback='BOMB −1 · 彈幕清除';feedbackUntil=time+1.8;}
      ambient+=dt;update(dt);updateEffects(dt);
      if(score>lastScore){feedback=`擊落 +${score-lastScore}`;feedbackUntil=time+1;lastScore=score;}
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
    $('#demo-gesture').textContent=c.id==='drag'?'按住 → 拖動':c.id==='release'?'放開':time<2?'同一位置':time<2.25?'① TAP':'② TAP · BOMB';
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
        if(returning){if(!frozen)overTime+=dt;$('#demo-return').textContent=`${Math.max(0,Math.ceil(15-overTime))} 秒後返回 DEMO · 按 RETRY 再出擊`;if(overTime>=15){attract();paint();return true;}}
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
  $('#boot').onclick=()=>{if(phase!=='off')return;setPhase('boot');clock=0;$('#boot').hidden=true;$('#boot-log').hidden=false;sound=true;sfx.playSfx('start');$('#sound').textContent=$('#demo-sound').textContent='聲音 ON';$('#fullscreen').onclick();};
  $('#demo-start').onclick=()=>start();
  $('#demo-lan').onclick=()=>$('#lan-open').onclick();
  $('#demo-options').onclick=()=>{dismiss();show('準備出擊','選擇戰機，單人或雙人一起出發。');};
  $('#demo-sound').onclick=()=>{$('#sound').onclick();$('#demo-sound').textContent=$('#sound').textContent;};
  $('#watch-demo').onclick=attract;$('#overlay').style.display='none';window.flightControls?.sync();
})();
