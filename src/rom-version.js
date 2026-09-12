'use strict';
(() => {
  // Single game-version source. Update manually for each release.
  const ROM_VERSION = '0.9.12';
  // Build preparation injects this before the version script; raw source runs use dev.
  const BUILD_SHA = window.CatBuildInfo?.sha || 'dev';
  document.getElementById('rom-version').textContent = `ROM Ver. ${ROM_VERSION} · ${BUILD_SHA}`;
})();
