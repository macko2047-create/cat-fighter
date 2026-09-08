"use strict";

// Drawing only: the caller owns the ambient clock, including pause behavior.
function drawFallbackWorld(ctx, W, H, t) {
  // A cool high-altitude sea: background features are deliberately small and
  // slow, so the fighter sprites read as the close, playable layer.
  const skySea = ctx.createLinearGradient(0, 0, 0, H);
  skySea.addColorStop(0, "#1d6678");
  skySea.addColorStop(0.48, "#155466");
  skySea.addColorStop(1, "#0c374b");
  ctx.fillStyle = skySea;
  ctx.fillRect(0, 0, W, H);

  // Long, faint currents establish motion without looking like nearby waves.
  for (let i = 0; i < 50; i++) {
    const y = ((i * 53 + t * (16 + (i % 3) * 4)) % 900) - 40;
    const x = (i * 173 + Math.floor(t * 5)) % 640 - 20;
    ctx.fillStyle = i % 4 === 0 ? "#83b5bb19" : "#8fc4c314";
    ctx.fillRect(x, y, 18 + (i % 6) * 7, 1);
  }

  // Thin cloud shadows are far below the squadron: low contrast and a slower
  // drift sell altitude without competing with pickups or enemy silhouettes.
  for (let i = 0; i < 8; i++) {
    const y = ((i * 167 + t * (10 + (i % 2) * 3)) % 1080) - 140;
    const x = (i * 211 + 47) % 680 - 40;
    ctx.fillStyle = "#c6dfd31b";
    ctx.beginPath();
    ctx.ellipse(x, y, 42 + (i % 3) * 11, 9 + (i % 2) * 3, -0.18, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#d8ebe323";
    ctx.beginPath();
    ctx.ellipse(x + 13, y - 4, 25, 7, -0.18, 0, 7);
    ctx.fill();
  }

  // Islands are now tiny atolls seen from much higher up, instead of large
  // land masses scrolling beside the aircraft.
  for (let i = 0; i < 5; i++) {
    const y = ((i * 263 + t * 11) % 1320) - 170;
    const x = (i * 181 + 84) % 570 + 15;
    const rx = 20 + (i % 3) * 7;
    const ry = 11 + (i % 2) * 5;
    ctx.fillStyle = "#bdbd7a8c";
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 5, ry + 4, 0.42, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#4e805f";
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 1, rx, ry, 0.42, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#77a66d99";
    ctx.fillRect(Math.round(x - rx / 2), Math.round(y - 3), Math.round(rx), 3);
  }

  // Occasional pin-size glints give the ocean scale, kept clearly below the
  // visual weight of ships and aircraft.
  ctx.fillStyle = "#d9e9bd5c";
  for (let i = 0; i < 12; i++) {
    const y = ((i * 89 + t * 19) % 920) - 30;
    const x = (i * 137 + 31) % 600;
    ctx.fillRect(x, y, 3 + (i % 3) * 2, 1);
  }
}


// Image and cached tile are visual resources, independent of gameplay state.
const islandBackdrop = { image: null, tile: null, width: 0, height: 0 };
if (typeof Image !== "undefined") {
  islandBackdrop.image = new Image();
  islandBackdrop.image.src = "assets/backgrounds/whisker-islands-v2.png";
}
function drawWorld(ctx, W, H, t) {
  const art = islandBackdrop, image = art.image;
  if (!image || !image.complete || !image.naturalWidth) {
    drawFallbackWorld(ctx, W, H, t);
    return;
  }
  if (!art.tile || art.width !== W || art.height !== H) {
    const tile = document.createElement("canvas"), overlap = 80;
    tile.width = W; tile.height = H;
    const c = tile.getContext("2d");
    // Overlap the ocean-only ends once; avoid a hard horizontal loop seam.
    c.drawImage(image, 0, 0, W, H + overlap);
    for (let row = 0; row < overlap; row++) {
      c.globalAlpha = 1 - row / overlap;
      const sourceY = (H + row) / (H + overlap) * image.naturalHeight;
      c.drawImage(image, 0, sourceY, image.naturalWidth,
        image.naturalHeight / (H + overlap), 0, row, W, 1);
    }
    c.globalAlpha = 1;
    // Reduce high-frequency foam/foliage once, not with a live frame filter.
    const soft = document.createElement("canvas");
    soft.width = Math.round(W / 4); soft.height = Math.round(H / 4);
    const softContext = soft.getContext("2d");
    softContext.drawImage(tile, 0, 0, soft.width, soft.height);
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    c.drawImage(soft, 0, 0, W, H);
    c.fillStyle = "#103449"; c.globalAlpha = .44;
    c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    art.tile = tile; art.width = W; art.height = H;
  }
  const offset = (t * 16) % H;
  ctx.drawImage(art.tile, 0, offset);
  ctx.drawImage(art.tile, 0, offset - H);
}
