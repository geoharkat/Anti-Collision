/* =============================================================
   Anti-Collision Analyst — interactions.js
   Start-up: file inputs, drag and drop, resize handling.
   ============================================================= */

window.addEventListener('load', () => {
  const year = new Date().getFullYear();
  $('footerYear').textContent = year; $('copyYear').textContent = year;
  if(!window.d3){ document.querySelector('.plots-area').textContent = 'Could not load the D3 library. Check your network connection and reload.'; return; }

  ['design', 'offset'].forEach(role => {
    $(`file-${role}`).addEventListener('change', ev => handleFiles(role, ev.target.files));
    const zone = $(`zone-${role}`);
    zone.addEventListener('dragover', ev => { ev.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', ev => { ev.preventDefault(); zone.classList.remove('dragging'); handleFiles(role, ev.dataTransfer.files); });
  });
  window.addEventListener('dragover', ev => ev.preventDefault());          // a missed drop must not navigate away
  window.addEventListener('drop', ev => ev.preventDefault());

  applyUnitLabels(); renderParams(); renderTableControls(); renderCylinderRadius(); renderWellCards();
  recalculate();

  let frame = 0, lastSize = '';
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const size = Object.values(CHART_NODES).map(id => `${$(id).parentElement.clientWidth}x${$(id).parentElement.clientHeight}`).join();
      if(size !== lastSize){ if(lastSize) resetZoom(); lastSize = size; drawCharts(); if(leafletMap) leafletMap.invalidateSize(); }
    });
  }).observe(document.querySelector('.plots-area'));
});
