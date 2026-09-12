'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {build} = require('../tools/build-pages.cjs');
const repo = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-rom-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'assets'));
  for (const name of ['style.css', 'game.js', 'CNAME', '.nojekyll']) fs.writeFileSync(path.join(root, name), '');
  fs.copyFileSync(path.join(repo, 'src/rom-version.js'), path.join(root, 'src/rom-version.js'));
  fs.writeFileSync(path.join(root, 'index.html'), '<button id="boot">BOOT <span id="rom-version"></span><span>TOUCH TO POWER ON</span></button><script src="src/rom-version.js"></script>');
  return root;
}
function display(root, generated) {
  const label = {};
  const context = {window: {}, document: {getElementById: () => label}};
  vm.createContext(context);
  if (generated) vm.runInContext(fs.readFileSync(path.join(root, '_site/src/build-info.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/rom-version.js'), 'utf8'), context);
  return label.textContent;
}
test('Git HEAD produces a hashed build artifact without modifying source; rebuild replaces stale SHA', t => {
  const root = fixture(t);
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd: repo, encoding: 'utf8'}).trim();
  fs.writeFileSync(path.join(root, '.git'), `gitdir: ${gitDir}\n`);
  const expected = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
  const before = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(build(root, {requireGit: true}).sha, expected);
  assert.equal(display(root, true), `ROM Ver. 0.9.12 · ${expected}`);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), before);
  const html = fs.readFileSync(path.join(root, '_site/index.html'), 'utf8');
  assert.match(html, /src\/build-info\.js\?v=[0-9a-f]{12}/);
  assert.ok(html.indexOf('src/build-info.js') < html.indexOf('src/rom-version.js'));
  execFileSync(process.execPath, [path.join(repo, 'tools/version-assets.cjs'), '--root', path.join(root, '_site'), '--check']);
  fs.unlinkSync(path.join(root, '.git'));
  assert.equal(build(root).sha, 'dev');
  assert.equal(display(root, true), 'ROM Ver. 0.9.12 · dev');
});
test('source and Git-free builds show dev; formal release fails without Git', t => {
  const root = fixture(t);
  assert.equal(display(root, false), 'ROM Ver. 0.9.12 · dev');
  assert.equal(build(root).sha, 'dev');
  assert.equal(display(root, true), 'ROM Ver. 0.9.12 · dev');
  assert.throws(() => build(root, {requireGit: true}), /requires Git HEAD/);
});
