'use strict';
const fs = require('node:fs');
const path = require('node:path');

function build(root = path.resolve(__dirname, '..'), {requireGit = false} = {}) {
  const {generate,prepare}=require('./build-info.cjs');
  const info=generate(root,{requireGit});
  const output = path.join(root, '_site');
  // Only this ignored build directory is replaced. Source files are never rewritten.
  fs.rmSync(output, {recursive: true, force: true});
  fs.mkdirSync(output, {recursive: true});
  for (const name of ['index.html', 'style.css', 'game.js', 'src', 'assets', 'CNAME', '.nojekyll']) {
    fs.cpSync(path.join(root, name), path.join(output, name), {
      recursive: true,
      filter: source => path.basename(source) !== '.DS_Store' &&
        !['src/p2p-transport.js','src/relay-transport.js'].includes(path.relative(root,source)),
    });
  }
  const prepared=prepare(output,info);
  fs.writeFileSync(path.join(output,'src/build-info.js'),prepared.js);
  fs.writeFileSync(path.join(output,'version.json'),JSON.stringify(info,null,2)+'\n');
  fs.writeFileSync(path.join(output,'index.html'),prepared.html);
  console.log(`Prepared ${output} (BUILD ${info.build})`);
  return {output,sha:info.git,info};
}

if (require.main === module) build(undefined, {requireGit: process.argv.includes('--require-git')});
module.exports = {build};
