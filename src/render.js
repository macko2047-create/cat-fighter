"use strict";

// Classic-script factory keeps file:// startup working without a build step.
// State is read-only by contract; this module owns only Canvas drawing.
function createRenderer(ctx, W, H, background, clamp, playerAssets = null, enemyAssets = null) {
  const spriteStamps = new WeakMap(), glowStamps = new Map();
  const canCache = typeof document !== "undefined" && typeof document.createElement === "function";
  // Cache at display resolution, including alpha-correct directional shadows.
  function spriteStamp(image, sx, sy, sw, sh, width, height, shadow) {
    if (!canCache) return null;
    let frames = spriteStamps.get(image);
    if (!frames) { frames = new Map(); spriteStamps.set(image, frames); }
    const key = [sx,sy,sw,sh,width,height,shadow].join(":");
    if (!frames.has(key)) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width + 64); canvas.height = Math.ceil(height + 64);
      const c = canvas.getContext("2d");
      if (shadow) { c.shadowColor="#021b3299"; c.shadowOffsetX=-14; c.shadowOffsetY=20; c.shadowBlur=3; }
      c.drawImage(image,sx,sy,sw,sh,32,32,width,height);
      frames.set(key,canvas);
    }
    return frames.get(key);
  }
  function glowStamp(color, length, width) {
    if (!canCache) return null;
    const key = [color,length,width].join(":");
    if (!glowStamps.has(key)) {
      const canvas=document.createElement("canvas");canvas.width=48;canvas.height=56;
      const c=canvas.getContext("2d");
      c.shadowColor=color;c.shadowBlur=10;c.fillStyle=color;
      c.beginPath();c.ellipse(24,28,width,length,0,0,7);c.fill();
      c.shadowBlur=0;c.fillStyle="#fff9dc";
      c.beginPath();c.ellipse(24,27,width*.4,length*.78,0,0,7);c.fill();
      // Particle colors are caller-provided; keep the visual cache bounded.
      if (glowStamps.size >= 24) glowStamps.delete(glowStamps.keys().next().value);
      glowStamps.set(key,canvas);
    }
    return glowStamps.get(key);
  }
  function tracer(x,y,color,length,width) {
    const stamp=glowStamp(color,length,width);
    if(stamp) ctx.drawImage(stamp,Math.round(x)-24,Math.round(y)-28);
    else {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,width,length,0,0,7);ctx.fill();}
  }
  function chargeCue(enemy, ambient) {
    if (enemy.chargeState !== "windup" && enemy.chargeState !== "charging") return;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.chargeState === "windup") {
      const pulse = .5 + Math.sin(ambient * 24) * .5;
      ctx.strokeStyle = `rgba(255,207,117,${.6 + pulse * .4})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(0, 0, 31 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffcf75";
      ctx.font = "bold 19px monospace"; ctx.textAlign = "center";
      ctx.fillText("!", 0, -43);
    } else {
      const speed = Math.hypot(enemy.chargeVX, enemy.chargeVY) || 1;
      const dx = enemy.chargeVX / speed, dy = enemy.chargeVY / speed;
      ctx.strokeStyle = "#ffdc9688"; ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        const x = -dy * side * 9, y = dx * side * 9;
        ctx.beginPath(); ctx.moveTo(x - dx * 21, y - dy * 21);
        ctx.lineTo(x - dx * 64, y - dy * 64); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function sortieBanner(mode, score, loop, loopTransition) {
    if (mode !== "over" && loopTransition <= 0) return;
    const over = mode === "over", top = over ? H * .20 : H * .34;
    ctx.save();
    if (!over) ctx.globalAlpha = Math.min(1, loopTransition * 2);
    ctx.fillStyle = over ? "#08212dbb" : "#08212de8";
    ctx.fillRect(0, top, W, over ? 188 : 172);
    ctx.strokeStyle = "#e4c77c"; ctx.lineWidth = 2;
    for (const y of [top + 1, top + (over ? 187 : 171)]) {
      ctx.beginPath(); ctx.moveTo(58, y); ctx.lineTo(W - 58, y); ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#97cfc3"; ctx.font = "bold 13px monospace";
    ctx.fillText(over ? "PACIFIC PAWS · SORTIE ENDED" : `LOOP ${String(loop).padStart(2, "0")} COMPLETE`, W / 2, top + 33);
    ctx.font = over ? "900 76px 'Space Grotesk', sans-serif" : "900 53px 'Space Grotesk', sans-serif";
    ctx.lineWidth = 7; ctx.lineJoin = "round"; ctx.strokeStyle = "#102c35";
    const title = over ? "GAME OVER" : "MISSION CLEAR";
    ctx.strokeText(title, W / 2, top + 111, W - 62);
    ctx.fillStyle = "#f4df9b"; ctx.fillText(title, W / 2, top + 111, W - 62);
    ctx.fillStyle = "#f0ebd3"; ctx.font = "bold 16px monospace";
    ctx.fillText(over ? `SCORE ${String(score).padStart(6, "0")}  /  LOOP ${String(loop).padStart(2, "0")}` : `LOOP ${String(loop + 1).padStart(2, "0")} INCOMING`, W / 2, top + 149);
    ctx.restore();
  }
  function enemySprite(enemy) {
    const stage = enemy.type === "boss" ? bossDamageStage(enemy) : 0;
    const id = stage && enemyAssets?.isReady("bossDamage") ? "bossDamage" : enemy.type;
    const image = enemyAssets?.image(id);
    const definition = enemyAssets?.definition(id);
    if (!image || !definition) return false;
    const size = definition.cell.width * definition.displayScale;
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    const sx = id === "bossDamage" ? ((stage - 1) % 2) * definition.cell.width : 0;
    const sy = id === "bossDamage" ? Math.floor((stage - 1) / 2) * definition.cell.height : 0;
    const stamp = spriteStamp(image,sx,sy,definition.cell.width,definition.cell.height,size,size,enemy.type !== "boat");
    if (stamp) ctx.drawImage(stamp, -size/2-32, -size/2-32);
    else ctx.drawImage(image, sx, sy, definition.cell.width, definition.cell.height, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
  }
  function bossEmotion(e, elapsed) {
    const stage = bossDamageStage(e);
    if (!stage) return;
    const reacting = e.hp > 0 && e.damageReactUntil > elapsed;
    ctx.save(); ctx.translate(e.x, e.y);
    if (reacting) {
      // Pause-safe reaction clock; no gameplay random numbers consumed by art.
      const progress = 1 - (e.damageReactUntil - elapsed) / .8;
      ctx.strokeStyle = "#153849"; ctx.lineWidth = 1.5;
      for (const [x, offset] of [[-25, 0], [25, .3], [34, .6]]) {
        const y = -22 + ((progress + offset) % 1) * 22;
        ctx.fillStyle = "#8ff2ff";
        ctx.beginPath(); ctx.moveTo(x, y - 9);
        ctx.quadraticCurveTo(x - 8, y + 4, x, y + 5);
        ctx.quadraticCurveTo(x + 8, y + 4, x, y - 9);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = "#fff0b3"; ctx.font = 'bold 23px monospace';
      ctx.fillText("!", -5, -41);
      ctx.strokeStyle = "#ffe2a3";
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * 40, -27); ctx.lineTo(side * 49, -35); ctx.stroke();
      }
    } else if (stage === 4) {
      ctx.strokeStyle = "#ff654c"; ctx.lineWidth = 3;
      // Four bent veins beside the pilot make rage readable at game scale.
      for (const [x, y, dx, dy] of [[26,-32,1,1],[40,-32,-1,1],[26,-18,1,-1],[40,-18,-1,-1]]) {
        ctx.beginPath(); ctx.moveTo(x, y + dy * 5);
        ctx.quadraticCurveTo(x + dx * 5, y + dy * 5, x + dx * 5, y); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function plane(x, y, color, enemy = false, size = 1, type = "small") {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(size, size);
    if (enemy) ctx.rotate(Math.PI);
    ctx.fillStyle = "#08203088";
    ctx.fillRect(-25 + 8, -7 + 10, 50, 11);
    ctx.fillStyle = color;
    ctx.fillRect(-6, -24, 12, 48);
    ctx.fillRect(-31, -5, 62, 10);
    ctx.fillRect(-25, -9, 50, 6);
    ctx.fillRect(-17, 17, 34, 7);
    ctx.fillStyle = "#e7debd";
    ctx.fillRect(-5, -27, 10, 7);
    ctx.fillStyle = "#203b45";
    ctx.fillRect(-4, -10, 8, 15);
    ctx.fillStyle = enemy ? "#b8a6a0" : "#eac894";
    ctx.fillRect(-4, -4, 8, 7);
    if (enemy) {
      ctx.fillRect(-7, -7, 4, 5);
      ctx.fillRect(3, -7, 4, 5);
    } else {
      ctx.beginPath();
      ctx.moveTo(-5, -2);
      ctx.lineTo(-5, -8);
      ctx.lineTo(0, -3);
      ctx.lineTo(5, -8);
      ctx.lineTo(5, -2);
      ctx.fill();
    }
    ctx.fillStyle = "#304b4f";
    ctx.fillRect(-22, -5, 6, 8);
    ctx.fillRect(16, -5, 6, 8);
    ctx.fillStyle = "#f9eab499";
    ctx.fillRect(-19, -30, 38, 2);
    ctx.fillStyle = "#d9d3ac";
    ctx.fillRect(-2, 20, 4, 7);
    ctx.restore();
  }
  function playerSprite(player, visual) {
    const id = visual?.id || playerAssetId(player.index);
    const state = visual?.state || "normal";
    const definition = playerAssets?.definition(id),
      image = playerAssets?.image(id),
      stateDefinition = definition?.states[state],
      frame = stateDefinition?.frames?.[0] || stateDefinition;
    if (!definition || !image || !frame) return false;
    const width = definition.cell.width * definition.displayScale,
      height = definition.cell.height * definition.displayScale;
    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    const stamp = spriteStamp(image,frame.column*definition.cell.width,frame.row*definition.cell.height,
      definition.cell.width,definition.cell.height,width,height,true);
    if (stamp) ctx.drawImage(stamp,-definition.pivot.x*width-32,-definition.pivot.y*height-32);
    else ctx.drawImage(image,frame.column*definition.cell.width,frame.row*definition.cell.height,
      definition.cell.width,definition.cell.height,-definition.pivot.x*width,-definition.pivot.y*height,width,height);
    ctx.restore();
    return true;
  }
  function draw({
    mode,
    ambient,
    elapsed = 0,
    score = 0,
    loop = 1,
    loopTransition = 0,
    bossWreck = null,
    enemies,
    drops,
    players,
    shots,
    hostile,
    sparks,
    flash,
    playerVisuals,
  }) {
    background(ambient);
    if (mode === "ready") {
      if (!playerSprite({index:0,x:245,y:590}, {state:"normal"})) plane(245, 590, "#dec67e");
      if (!playerSprite({index:1,x:360,y:665}, {state:"normal"})) plane(360, 665, "#8bd2be");
    }
    for (const e of enemies) {
      chargeCue(e, ambient);
      if (e.type === "boat") {
        ctx.save(); ctx.strokeStyle = "#d3f6eb77"; ctx.lineWidth = 2;
        for (let i=0;i<4;i++) {
          const drift=(ambient*22+i*12)%48;
          ctx.globalAlpha=1-drift/55;
          ctx.beginPath();ctx.moveTo(e.x-14-drift*.28,e.y-drift-20);
          ctx.lineTo(e.x,e.y-drift-8);ctx.lineTo(e.x+14+drift*.28,e.y-drift-20);ctx.stroke();
        }
        ctx.restore();
      }
      if (e.type === "boss") {
        if (!enemySprite(e)) {
          plane(e.x, e.y, "#9b9e89", true, 2.8);
          ctx.fillStyle = "#303e43";
          ctx.fillRect(e.x - 75, e.y - 5, 18, 27);
          ctx.fillRect(e.x + 57, e.y - 5, 18, 27);
        }
        bossEmotion(e, elapsed);
        ctx.fillStyle = "#14292b";
        ctx.fillRect(60, 96, 480, 9);
        ctx.fillStyle = "#eaaf7e";
        ctx.fillRect(60, 96, 480 * Math.max(0, e.hp / e.max), 9);
        ctx.fillStyle = "#f3dfb3";
        ctx.font = '12px "Cat Arcade", monospace';
        ctx.fillText("IRON WHISKER", 60, 88);
      } else if (enemySprite(e)) {
        // Sprite already drawn.
      } else if (e.type === "boat") {
        ctx.fillStyle = "#273b40";
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - 36);
        ctx.lineTo(e.x + 18, e.y - 12);
        ctx.lineTo(e.x + 18, e.y + 36);
        ctx.lineTo(e.x - 18, e.y + 36);
        ctx.lineTo(e.x - 18, e.y - 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#9aa796";
        ctx.fillRect(e.x - 10, e.y - 14, 20, 32);
        ctx.fillStyle = "#344d4a";
        ctx.fillRect(e.x - 5, e.y - 26, 10, 20);
      } else
        plane(
          e.x,
          e.y,
          e.type === "heavy" ? "#a9a397" : "#bb8874",
          true,
          e.type === "heavy" ? 1.5 : 0.85,
        );
    }
    if (bossWreck && loopTransition > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, loopTransition / .6);
      if (!enemySprite(bossWreck)) plane(bossWreck.x, bossWreck.y, "#655349", true, 2.8);
      bossEmotion(bossWreck, elapsed);
      ctx.restore();
    }
    for (const d of drops) {
      const color = d.type === "W" ? (d.weapon === "rapid" ? "#ff91cd" : "#efd58d") : d.type === "1UP" ? "#91e3bd" : "#a2d3ed";
      ctx.save();
      ctx.translate(d.x, d.y + Math.sin(ambient * 3 + d.x) * 3);
      if (d.type === "1UP") {
        // A minted treasure token: the centre contains only the arcade 1UP mark.
        ctx.shadowColor = "#96f5cb"; ctx.shadowBlur = 13;
        ctx.fillStyle = "#183d35"; ctx.strokeStyle = "#f5d994"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        const enamel = ctx.createLinearGradient(0, -21, 0, 21);
        enamel.addColorStop(0, "#438e69"); enamel.addColorStop(.45, "#245b48"); enamel.addColorStop(1, "#102f2d");
        ctx.fillStyle = enamel; ctx.strokeStyle = "#9ae1b6"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff3c3"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -1, 23, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
        ctx.fillStyle = "#fff4c8";
        const gleam = .65 + Math.sin(ambient * 4) * .25;
        ctx.globalAlpha = gleam;
        for (const [x, y, size] of [[-20, -19, 4], [22, 15, 3]]) {
          ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + 1, y - 1);
          ctx.lineTo(x + size, y); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x, y + size);
          ctx.lineTo(x - 1, y + 1); ctx.lineTo(x - size, y); ctx.lineTo(x - 1, y - 1); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = '18px "Cat Arcade", monospace';
        ctx.strokeStyle = "#102d2a"; ctx.lineWidth = 3; ctx.lineJoin = "miter";
        ctx.strokeText("1UP", 0, 1, 37);
        ctx.fillStyle = "#fff2b3"; ctx.fillText("1UP", 0, 1, 37);
        ctx.restore();
        continue;
      }
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.fillStyle = "#0b2536"; ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -1, 17, Math.PI, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = color;
      if (d.type === "W") {
        const arrows = d.weapon === "rapid" ? [-6, 6] : [-8, 0, 8];
        for (const x of arrows) {
          ctx.beginPath(); ctx.moveTo(x - 3, 6); ctx.lineTo(x - 3, -5);
          ctx.lineTo(x, -10); ctx.lineTo(x + 3, -5); ctx.lineTo(x + 3, 6); ctx.closePath(); ctx.fill();
        }
      } else if (d.type === "B") {
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(5, -13); ctx.lineTo(10, -11); ctx.stroke();
        ctx.fillStyle = "#fff9dc"; ctx.beginPath(); ctx.arc(-3, -3, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = color; ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.type === "W" ? (d.weapon === "rapid" ? "RAPID" : "3-WAY") : "BOMB", 0, 15);
      ctx.restore();
    }
    for (const [index, p] of players.entries())
      if (p.lives > 0 && !p.respawn && (p.entering || p.inv <= 0 || Math.floor(ambient * 15) % 2 === 0))
        if (!playerSprite(p, playerVisuals?.[index]))
          plane(p.x, p.y, p.index ? "#8bd2be" : "#dec67e");
    ctx.save(); ctx.textAlign = "center"; ctx.font = "bold 14px monospace";
    ctx.fillStyle = "#fff0b5"; ctx.shadowColor = "#071e2f"; ctx.shadowBlur = 5;
    for (const p of players)
      if (p.noticeUntil > elapsed) ctx.fillText(p.notice, clamp(p.x, 85, W - 85), p.y - 45 - (1.5 - (p.noticeUntil - elapsed)) * 12);
    ctx.restore();
    ctx.save();ctx.globalCompositeOperation="lighter";
    for (const s of shots) tracer(s.x,s.y-2,s.owner?.index ? "#298dff" : "#ffb629",9,2.5);
    for (const b of hostile) tracer(b.x,b.y,"#ff4825",6,3);
    ctx.restore();
    // Existing particles supply position/lifetime; lighting never advances state.
    ctx.save();
    for (const s of sparks) {
      const energy=clamp(s.life*2,0,1);
      ctx.globalAlpha=energy*.32;ctx.fillStyle="#172b31";
      ctx.beginPath();ctx.arc(s.x-6,s.y+8,6+(1-energy)*10,0,7);ctx.fill();
    }
    ctx.globalCompositeOperation="lighter";
    for (const s of sparks) {
      const energy=clamp(s.life*2,0,1);
      ctx.globalAlpha=energy;
      const stamp=glowStamp(s.color,5,5);
      if(stamp) {
        const scale=.45+energy*.55;
        ctx.drawImage(stamp,s.x-24*scale,s.y-28*scale,48*scale,56*scale);
      } else {ctx.fillStyle=s.color;ctx.fillRect(s.x,s.y,5,5);}
    }
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,239,187,${flash * 2})`;
      ctx.fillRect(0, 0, W, H);
    }
    sortieBanner(mode, score, loop, loopTransition);
  }

  return draw;
}
