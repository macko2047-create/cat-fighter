"use strict";
// Export only controller data. Reading a report must not advance calibration.
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  function snapshot() {
    let raw = [], inputError = null;
    try { raw = Array.from(navigator.getGamepads?.() || []).filter(Boolean); }
    catch (error) { inputError = String(error.message || error); }
    return {
      schema: 'cat-fighter-controller-report',
      version: 1,
      exportedAt: new Date().toISOString(),
      controllerMode: 'manual-calibration',
      environment: { userAgent: navigator.userAgent, protocol: location.protocol },
      game: { mode, keyboard2, assignments: [...assignments] },
      deadzone: { value: deadzone, percent: Math.round(deadzone * 100) },
      bindings: clone(bindings),
      halfControllers: window.halfControllers.snapshot(),
      devices: raw.map(pad => ({
        id: pad.id,
        index: pad.index,
        mapping: pad.mapping,
        connected: pad.connected !== false,
        axes: Array.from(pad.axes),
        buttons: Array.from(pad.buttons, (button, index) => ({
          index, pressed: !!button.pressed, value: button.value ?? 0, touched: !!button.touched,
        })),
      })),
      ...(inputError ? { inputError } : {}),
    };
  }
  window.controllerReport = { snapshot };
  const output = $('#controller-report'), status = $('#controller-export-status');
  function prepare() {
    const report = snapshot();
    output.value = JSON.stringify(report, null, 2);
    $('#controller-export-preview').hidden = false;
    return report;
  }
  $('#export-controller').onclick = () => {
    const report = prepare();
    const url = URL.createObjectURL(new Blob([output.value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cat-fighter-controller-settings-${report.exportedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '已產生 JSON 下載。將檔案附加到對話，或按「複製設定」貼給我。';
  };
  $('#copy-controller').onclick = async () => {
    prepare();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      status.textContent = '已複製設定，可直接貼到對話。';
    } catch {
      $('#controller-export-preview').open = true;
      output.focus();
      output.select();
      status.textContent = '瀏覽器未允許自動複製；已選取下方設定，請按 ⌘C／Ctrl+C 再貼到對話。';
    }
  };
})();
