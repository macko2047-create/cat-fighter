// Creates review-only Normal/Roll sprites and a renderer-backed 72px preview.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const root = path.resolve(__dirname, '../../..');
const generated = '/Users/maccow/.codex/generated_images/01a07869-cb84-7ce1-a368-8a61bad849f7';
const inputs = {
  'p1-roll-left': 'exec-b792e380-8a7c-4c3f-b249-c97618843285.png',
  'p1-roll-right': 'exec-d2648751-f2c3-4459-a101-4873ecf8bb3a.png',
  'p2-roll-left': 'exec-3b47da69-f2be-42e4-af68-6e0ba893f1af.png',
  'p2-roll-right': 'exec-5bf21f81-8f94-479e-89f8-1a56d556af04.png',
};

function checkerToAlpha(data, width, height, channels) {
  const alpha = new Uint8Array(width * height).fill(255);
  const isBackdrop = (i) => {
    const r = data[i * channels], g = data[i * channels + 1], b = data[i * channels + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) < 12 && r > 220;
  };
  const seen = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (seen[p] || !isBackdrop(p)) continue;
    seen[p] = 1; alpha[p] = 0;
    const x = p % width, y = Math.floor(p / width);
    if (x) queue.push(p - 1); if (x + 1 < width) queue.push(p + 1);
    if (y) queue.push(p - width); if (y + 1 < height) queue.push(p + width);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = data[p * channels]; rgba[p * 4 + 1] = data[p * channels + 1];
    rgba[p * 4 + 2] = data[p * channels + 2]; rgba[p * 4 + 3] = alpha[p];
  }
  return rgba;
}

async function isolate(name, source) {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const rgba = info.channels === 4 ? data : checkerToAlpha(data, info.width, info.height, info.channels);
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (rgba[(y * info.width + x) * 4 + 3] > 12) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const cut = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(190, 190, { fit: 'inside' }).png().toBuffer();
  const meta = await sharp(cut).metadata();
  const left = Math.floor((256 - meta.width) / 2), top = Math.floor((256 - meta.height) / 2);
  await sharp({ create: { width: 256, height: 256, channels: 4, background: '#00000000' } })
    .composite([{ input: cut, left, top }]).png().toFile(path.join(__dirname, `${name}-master.png`));
  return { name, bounds: [left, top, meta.width, meta.height] };
}

async function main() {
  const metrics = [];
  for (const [name, file] of Object.entries(inputs)) metrics.push(await isolate(name, path.join(generated, file)));
  const canvas = createCanvas(600, 800), ctx = canvas.getContext('2d');
  const sandbox = {}; vm.createContext(sandbox);
  for (const file of ['src/world.js', 'src/assets.js', 'src/render.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  const images = {};
  for (const id of ['p1-normal', 'p2-normal']) images[id] = await loadImage(path.join(root, `assets/art-review/CF-L1-ART-02/${id.slice(0,2)}-normal-master.png`));
  for (const name of Object.keys(inputs)) images[name] = await loadImage(path.join(__dirname, `${name}-master.png`));
  const assets = { definition: () => ({ cell: { width: 256, height: 256 }, displayScale: 72 / 256, pivot: { x: .5, y: .5 }, states: { normal: { frames: [{ row: 0, column: 0 }] } } }), image: id => images[id] };
  const render = sandbox.createRenderer(ctx, 600, 800, t => sandbox.drawWorld(ctx, 600, 800, t), (v,a,b) => Math.max(a,Math.min(b,v)), assets);
  const players = [
    { index: 0, x: 170, y: 540, hp: 1, inv: 0 }, { index: 0, x: 300, y: 540, hp: 1, inv: 0 }, { index: 0, x: 430, y: 540, hp: 1, inv: 0 },
    { index: 1, x: 170, y: 670, hp: 1, inv: 0 }, { index: 1, x: 300, y: 670, hp: 1, inv: 0 }, { index: 1, x: 430, y: 670, hp: 1, inv: 0 },
  ];
  const ids = ['p1-normal','p1-roll-left','p1-roll-right','p2-normal','p2-roll-left','p2-roll-right'];
  render({ mode: 'playing', ambient: 12, players, playerVisuals: ids.map(id => ({ id, state: 'normal' })), enemies: [{type:'small',x:200,y:150},{type:'heavy',x:380,y:245}], drops: [], shots: [{x:170,y:440},{x:300,y:440},{x:430,y:440}], hostile: [{x:250,y:600},{x:360,y:610}], sparks: [], flash: 0 });
  // These labels are review-only; production PNGs remain clean.
  ctx.fillStyle = '#f3dfb3'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  for (const [x, label] of [[170, 'NORMAL'], [300, 'ROLL L'], [430, 'ROLL R']]) {
    ctx.fillText(label, x, 590); ctx.fillText(label, x, 740);
  }
  ctx.textAlign = 'left';
  fs.writeFileSync(path.join(__dirname, 'gameplay-size-preview.png'), canvas.toBuffer('image/png'));
  const detail = createCanvas(390, 280); detail.getContext('2d').drawImage(canvas, 105, 480, 390, 280, 0, 0, 390, 280);
  fs.writeFileSync(path.join(__dirname, 'gameplay-size-comparison.png'), detail.toBuffer('image/png'));
  fs.writeFileSync(path.join(__dirname, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify(metrics));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
