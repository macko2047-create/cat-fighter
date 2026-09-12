'use strict';
((root) => {
  // Product version only. Build identity is generated separately.
  const rom = '0.9.12', channel = 'dev';
  if (typeof module !== 'undefined') module.exports = {rom,channel};
  if (!root.document) return;
  const info = root.CatBuildInfo;
  root.document.getElementById('rom-version').textContent = `ROM Ver. ${info?.rom || rom} · ${info?.channel || channel}`;
  root.document.getElementById('build-version').textContent = info?.build ? `BUILD ${info.build}` : 'BUILD unavailable — start server or build';
  if (info?.build) console.info(`Cat Fighter build: ${info.build}`);
})(globalThis);
