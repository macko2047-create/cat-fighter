"use strict";

// Classic-script factory keeps file:// startup working without a build step.
// State is read-only by contract; this module owns only Canvas drawing.
function createRenderer(ctx, W, H, background, clamp, playerAssets = null, enemyAssets = null) {
  function enemySprite(enemy) {
    const image = enemyAssets?.image(enemy.type);
    const definition = enemyAssets?.definition(enemy.type);
    if (!image || !definition) return false;
    const size = definition.cell.width * definition.displayScale;
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    if (enemy.type !== "boat") {
      ctx.shadowColor = "#021b3299";
      ctx.shadowOffsetX = -14;
      ctx.shadowOffsetY = 20;
      ctx.shadowBlur = 3;
    }
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
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
    // Fixed upper-right world light; shadows follow the actual sprite alpha.
    ctx.shadowColor = "#021b3299";
    ctx.shadowOffsetX = -14;
    ctx.shadowOffsetY = 20;
    ctx.shadowBlur = 3;
    ctx.drawImage(
      image,
      frame.column * definition.cell.width,
      frame.row * definition.cell.height,
      definition.cell.width,
      definition.cell.height,
      -definition.pivot.x * width,
      -definition.pivot.y * height,
      width,
      height,
    );
    ctx.restore();
    return true;
  }
  function draw({
    mode,
    ambient,
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
        ctx.fillStyle = "#14292b";
        ctx.fillRect(60, 25, 480, 9);
        ctx.fillStyle = "#eaaf7e";
        ctx.fillRect(60, 25, 480 * Math.max(0, e.hp / e.max), 9);
        ctx.fillStyle = "#f3dfb3";
        ctx.font = "11px monospace";
        ctx.fillText("鼠王 / IRON WHISKER", 60, 20);
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
    for (const d of drops) {
      ctx.fillStyle =
        d.type === "W" ? "#efd58d" : d.type === "+" ? "#91e3bd" : "#a2d3ed";
      ctx.fillRect(d.x - 12, d.y - 12, 24, 24);
      ctx.fillStyle = "#123344";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.type, d.x, d.y + 6);
      ctx.textAlign = "left";
    }
    for (const [index, p] of players.entries())
      if (p.hp > 0 && (p.inv <= 0 || Math.floor(ambient * 15) % 2 === 0))
        if (!playerSprite(p, playerVisuals?.[index]))
          plane(p.x, p.y, p.index ? "#8bd2be" : "#dec67e");
    function tracer(x,y,color,length,width) {
      ctx.save();ctx.globalCompositeOperation="lighter";
      ctx.shadowColor=color;ctx.shadowBlur=12;ctx.fillStyle=color;
      ctx.beginPath();ctx.ellipse(x,y,width,length,0,0,7);ctx.fill();
      ctx.shadowBlur=4;ctx.fillStyle="#fff9dc";
      ctx.beginPath();ctx.ellipse(x,y-1,width*.4,length*.78,0,0,7);ctx.fill();ctx.restore();
    }
    for (const s of shots) tracer(s.x,s.y-2,s.owner?.index ? "#298dff" : "#ffb629",9,2.5);
    for (const b of hostile) tracer(b.x,b.y,"#ff4825",6,3);
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
      ctx.globalAlpha=energy;ctx.shadowColor="#ff751c";ctx.shadowBlur=14;
      ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(s.x,s.y,2+energy*4,0,7);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="#fff2ae";ctx.beginPath();ctx.arc(s.x+1,s.y-1,1+energy*1.8,0,7);ctx.fill();
    }
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,239,187,${flash * 2})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = "#0619230a";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  }

  return draw;
}
