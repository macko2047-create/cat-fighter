'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function build(root = path.resolve(__dirname, '..'), {requireGit = false} = {}) {
  let sha = 'dev';
  try {
    // Do not accidentally use a parent repository for an exported source folder.
    if (!fs.existsSync(path.join(root, '.git'))) throw new Error('No Git metadata');
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    if (!/^[0-9a-f]{4,40}$/.test(sha)) throw new Error('Invalid Git SHA');
  } catch (error) {
    if (requireGit) throw new Error('Pages release requires Git HEAD', {cause: error});
    sha = 'dev';
    console.warn('Git HEAD unavailable; ROM build identifier is dev.');
  }
  const output = path.join(root, '_site');
  // Only this ignored build directory is replaced. Source files are never rewritten.
  fs.rmSync(output, {recursive: true, force: true});
  fs.mkdirSync(output, {recursive: true});
  for (const name of ['index.html', 'style.css', 'game.js', 'src', 'assets', 'CNAME', '.nojekyll']) {
    fs.cpSync(path.join(root, name), path.join(output, name), {
      recursive: true,
      filter: source => path.basename(source) !== '.DS_Store',
    });
  }
  fs.writeFileSync(path.join(output, 'src/build-info.js'),
    `// Generated during build; do not commit.\nwindow.CatBuildInfo = Object.freeze(${JSON.stringify({sha})});\n`);
  const entry = path.join(output, 'index.html');
  const html = fs.readFileSync(entry, 'utf8');
  const versionScript = /<script src="src\/rom-version\.js(?:\?v=[^"]+)?"><\/script>/g;
  if ([...html.matchAll(versionScript)].length !== 1) throw new Error('Expected one ROM version script');
  fs.writeFileSync(entry, html.replace(versionScript, '<script src="src/build-info.js"></script>\n    $&'));
  execFileSync(process.execPath, [path.join(__dirname, 'version-assets.cjs'), '--root', output], {stdio: 'pipe'});
  console.log(`Prepared ${output} (ROM build ${sha})`);
  return {output, sha};
}

if (require.main === module) build(undefined, {requireGit: process.argv.includes('--require-git')});
module.exports = {build};
