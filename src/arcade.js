'use strict';
// Attract mode renders isolated, scripted scenes through the game's renderer.
// It never advances the live simulation or spends a player's rewards.
(() => {
  const chapters = [
    [6, 'PACIFIC PAWS / 1943', 'CAT FIGHTER', '貓貓飛行隊 · 輕觸 START 出擊'],
    [8, 'HOW TO PLAY / 01', '按住並拖動', '戰機跟隨手指前方 · 按住時自動射擊'],
    [4, 'HOW TO PLAY / 02', '放開即可停下', '放開手指：停止移動及射擊 · 敵機仍會進攻'],
    [6, 'HOW TO PLAY / 03', '快速輕觸兩下', '同一位置雙擊 → BOMB · 清除彈幕並攻擊敵機'],
    [6, 'REWARD / RAPID', '快射升級', '拾取閃電標記 · 加快射擊速度'],
    [6, 'REWARD / 2-WAY', '雙線火力', '拾取雙箭頭 · 同時射出兩發子彈'],
    [6, 'REWARD / 3-WAY', '三向散射', '拾取三箭頭 · 擴闊攻擊範圍'],
    [5, 'REWARD / BOMB', '炸彈補給', '拾取炸彈 · 補充一枚 BOMB'],
    [5, 'REWARD / 1UP', '多一次機會', '拾取 1UP · 增加一條生命'],
    [8, 'MISSION / BOSS', '空中堡壘來襲', '閃避火網，擊敗頭目 · 挑戰下一輪'],
  ];
  const duration = chapters.reduce((sum, c) => sum + c[0], 0);
  let phase = 'off', clock = 0, previousChapter = -1;
  const body = document.body;
  const setPhase = value => { phase = value; body.dataset.arcade = value; };
  function dismiss() {
    if (phase === 'off' || phase === 'boot') return false;
    setPhase('game'); $('#attract').hidden = true;
    keys.clear(); window.flightControls?.reset();
    return true;
  }
  function attract() {
    if (window.lan?.active) return;
    mode = 'ready'; joined.fill(false); players = []; enemies = []; shots = [];
    hostile = []; drops = []; sparks = []; bossDebris = []; score = elapsed = 0;
    loop = 1; loopTransition = 0; bossWreck = null; flash = 0;
    clock = 0; previousChapter = -1; keys.clear();
    setPhase('demo'); $('#boot-screen').hidden = true;
    $('#overlay').style.display = 'none'; $('#attract').hidden = false;
    $('#demo-sound').textContent = $('#sound').textContent;
    updateHUD();
  }
  function demoFrame() {
    let t = clock % duration, chapter = 0;
    while (t >= chapters[chapter][0]) t -= chapters[chapter++][0];
    const [length, label, title, copy] = chapters[chapter];
    if (previousChapter !== chapter) {
      $('#demo-chapter').textContent = label;
      $('#demo-title').textContent = title;
      $('#demo-copy').textContent = copy;
      previousChapter = chapter;
    }
    const reward = chapter >= 4 && chapter <= 8;
    const collected = reward && t >= 2.5;
    const bombing = chapter === 3 && t >= 2.25;
    const fieldHeight = canvas.getBoundingClientRect().height;
    const p = {...pilot(0), x: 300 + (chapter === 2 || chapter === 3 || reward ? 0 : Math.sin(t * .85) * 125),
      y:Math.min(550, Math.max(240, H * .78 - 142 * H / fieldHeight)), inv: 0};
    const level = collected && chapter === 5 ? 2 : collected && chapter === 6 ? 3 : 1;
    const demoShots = [];
    if (chapter !== 2) {
      const spacing = collected && chapter === 4 ? 34 : 72;
      for (let row = 0; row < Math.ceil(520 / spacing); row++) {
        const travel = (t * 400 + row * spacing) % 520;
        for (let lane = 0; lane < level; lane++) {
          const vx = level === 3 ? (lane - 1) * 170 : 0;
          demoShots.push({x:p.x + (lane - (level - 1) / 2) * 12 + vx * travel / 550,
            y:p.y - 25 - travel, vx, vy:-550, owner:p});
        }
      }
    }
    const demoEnemies = chapter === 9 ? [{type:'boss', x:300 + Math.sin(t) * 65,
      y:Math.min(160, -120 + t * 130), hp:800, max:1050, age:t}] :
      bombing ? [] : Array.from({length:5}, (_, i) => ({type:'small', x:90 + i * 105,
        y:90 + ((t * 48 + i * 47) % 260), age:t, hp:2}));
    const demoHostile = bombing ? [] : Array.from({length:chapter === 9 ? 24 : 10}, (_, i) => ({
      x:55 + (i * 57) % 490, y:200 + (t * 92 + i * 60) % 550, vx:0, vy:150}));
    const rewards = [{type:'W',weapon:'rapid'}, {type:'W',weapon:'double'},
      {type:'W',weapon:'spread'}, {type:'B'}, {type:'1UP'}];
    render({mode:'playing', ambient:clock, elapsed:t, score:0, loop:1, loopTransition:0,
      players:[p], playerVisuals:[{id:playerAssetId(0),state:'normal'}], enemies:demoEnemies,
      shots:demoShots, hostile:demoHostile, sparks:[],
      drops:reward && !collected ? [{...rewards[chapter-4],x:p.x,y:p.y - 250 + t * 100}] : [],
      flash:bombing ? Math.max(0, .5 - (t - 2.25)) : 0});
    if (bombing && t < 3.6) {
      ctx.save(); ctx.strokeStyle='#fff0b5'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.arc(p.x,p.y,(t-2.25)*650,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
    const finger = $('#demo-finger');
    finger.hidden = ![1,2,3].includes(chapter);
    finger.style.left = `${p.x / W * 100}%`;
    // Match the live touch offset in CSS pixels on every viewport size.
    finger.style.top = `calc(${p.y / H * 100}% + 72px)`;
    finger.dataset.gesture = chapter === 2 ? 'release' : chapter === 3 ? 'tap' : 'drag';
    finger.style.opacity = chapter === 2 ? '.25' : '1';
    finger.style.scale = chapter === 3 && ((t >= 2 && t < 2.12) || (t >= 2.25 && t < 2.37)) ? '.8' : '1';
    $('#demo-gesture').textContent = chapter === 3 ? (t < 2 ? '準備雙擊' : t < 2.25 ? 'TAP' : 'TAP ×2 · BOMB!') : chapter === 2 ? '放開' : '按住拖動';
    $('#score').textContent = 'DEMO'; $('#status').textContent = 'PRESS START';
    $('#flight-health').textContent = `P1 ♥ ×${collected && chapter === 8 ? 4 : 3}　 BOMB ×${bombing ? 2 : collected && chapter === 7 ? 4 : 3}`;
    $('#demo-chapter').dataset.progress = String(Math.floor(t / length * 100));
  }
  const arcade = window.arcade = {
    get phase() { return phase; },
    beforeStart() { return dismiss(); },
    dismiss,
    key(e) {
      if (phase === 'game') return false;
      // Let focused native buttons activate themselves without the game Enter handler.
      if (e.target?.tagName === 'BUTTON') return true;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return false;
      if (e.code === 'Enter' && !e.repeat && phase === 'demo' && !$('#lan-dialog').open) start();
      e.preventDefault(); return true;
    },
    frame(dt) {
      $('#watch-demo').disabled = !!window.lan?.active;
      if (phase === 'game') return false;
      if (!document.hidden && !$('#lan-dialog').open) clock += dt;
      if (phase === 'boot') {
        const lines = ['DISPLAY ................ OK','TOUCH INPUT ............ READY','SPRITES ................ LOADING','PACIFIC PAWS ........... READY'];
        $('#boot-text').textContent = lines.slice(0,Math.min(4,1+Math.floor(clock/.6))).join('\n');
        if (clock >= 2.8) attract();
      }
      if (phase === 'demo') demoFrame();
      return true;
    },
  };
  $('#boot').onclick = () => {
    if (phase !== 'off') return;
    setPhase('boot'); clock = 0;
    $('#boot').hidden = true; $('#boot-log').hidden = false;
    sound = true; sfx.playSfx('start');
    $('#sound').textContent = $('#demo-sound').textContent = '聲音 ON';
    $('#fullscreen').onclick();
  };
  $('#demo-start').onclick = () => start();
  $('#demo-lan').onclick = () => $('#lan-open').onclick();
  $('#demo-options').onclick = () => {
    dismiss(); show('準備出擊', '選擇戰機，單人或雙人一起出發。');
  };
  $('#demo-sound').onclick = () => { $('#sound').onclick(); $('#demo-sound').textContent = $('#sound').textContent; };
  $('#watch-demo').onclick = attract;
  $('#overlay').style.display = 'none';
  window.flightControls?.sync();
})();
