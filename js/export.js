/* =============================================================
   Anti-Collision Analyst — export.js
   CSV, Excel workbook and PNG / SVG plot downloads.
   ============================================================= */

const fileStem = () => ((designWell() ? designWell().name : 'wells').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'wells');
const todayText = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
function download(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ===== CSV (the table currently shown) ===== */
function csvText(table){
  const cell = v => {
    let str = String(v ?? '');
    if(typeof v === 'string' && /^[=+\-@\t\r]/.test(str)) str = "'" + str;        // spreadsheet formula guard
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [table.head, ...table.body].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
function currentCsv(){
  const table = TABLES[S.table](true);
  return table.body.length ? { text:csvText(table), name:`${fileStem()}_${S.table}_${S.units}.csv` } : null;
}
function exportCSV(){
  const c = currentCsv();
  if(!c) return toast('The selected table is empty', 'error');
  download(new Blob(['﻿' + c.text], { type:'text/csv;charset=utf-8' }), c.name);
}

/* ===== SHARED REPORT BLOCKS ===== */
const MODEL_NOTE = 'Screening tool. The positional uncertainty is a simplified 3-term MWD estimate, not an ISCWSA error model, and results have not been verified against certified anti-collision software. Do not use them as the basis for drilling decisions.';
function parameterRows(){
  const p = S.params;
  return [
    ['Separation factor', p.useUncertainty ? 'distance / (design radius + offset radius + k x (design uncertainty + offset uncertainty))' : 'distance / (design radius + offset radius). Positional uncertainty OFF'],
    ['Status thresholds', `critical below ${p.crit}, warning below ${p.warn}`],
    ['Hole radius, design / offset', `${dispRadius(p.rDesign)} / ${dispRadius(p.rOffset)} ${U().radius}`],
    ['Uncertainty model', p.useUncertainty ? `radius = RSS of ${p.depthFactor} x MD, ${p.incError} deg x MD, ${p.aziError} deg x MD x sin(inc)` : 'not applied'],
    ['Multiplier k', p.useUncertainty ? String(p.sigma) : 'not applied'],
    ['Closest approach', `design well every ${fmtLen(DESIGN_STEP, 0)} and at refined minima; offset wells searched continuously`],
    ['VS azimuth', `${p.vsAz} deg`]
  ];
}
function wellRows(){
  const design = designWell();
  return S.wells.map(w => {
    const s = w.shift || { north:0, east:0 }, first = (w.designed || w.fileStations)[0], last = w.placed[w.placed.length - 1];
    const tie = !first || first.md <= MD_TOL ? 'surface' : w.results[0] && w.results[0].assumed ? 'vertical assumed' : `given at ${fmtLen(first.md, 0)}`;
    const source = w.designed ? 'Designed J profile' : w.source ? w.source.fileName : w.sample ? 'Sample (synthetic)' : '';
    return [w.name, w.role, source, (w.designed || w.fileStations).length, last ? dispLen(last.md, 1) : '', round(toLen(s.north, S.units)), round(toLen(s.east, S.units)),
      round(toLen(design ? w.elev - design.elev : 0, S.units)), `${w.lat.toFixed(6)}, ${w.lon.toFixed(6)}`, tie + (w.role === 'offset' && !w.located ? '; position NOT SET' : '')];
  });
}
const wellHead = () => ['Well', 'Role', 'Source', 'Stations', `TD MD (${U().len})`, `North (${U().len})`, `East (${U().len})`, `Elevation (${U().len})`, 'Surface lat, lon', 'Tie-in / notes'];
function comparisonRows(){
  if(!S.baseline || !S.scan) return [];
  const L = v => round(toLen(v, S.units));
  return S.scan.offsets.map(o => {
    const b = S.baseline.offsets.find(x => x.id === o.id);
    if(!b) return null;
    const a = b.summary, c = o.summary;
    return [wellById(o.id).name, roundSF(a.minSF.sf), roundSF(c.minSF.sf), roundSF(c.minSF.sf - a.minSF.sf), L(a.minDist.distance), L(c.minDist.distance), a.alerts.length, c.alerts.length,
      `${STATUS_LABELS[a.status]} -> ${STATUS_LABELS[c.status]}`];
  }).filter(Boolean);
}
const comparisonHead = () => ['Offset well', 'Min SF original', 'Min SF designed', 'Change', `Closest original (${U().len})`, `Closest designed (${U().len})`, 'Alerts original', 'Alerts designed', 'Status'];

/* ===== EXCEL ===== */
function sheet(aoa, filter = false){
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = Math.max(...aoa.map(r => r.length));
  ws['!cols'] = Array.from({ length:cols }, (_, c) => ({ wch:Math.min(70, Math.max(9, ...aoa.map(r => String(r[c] ?? '').length + 2))) }));
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let R = 1; R <= range.e.r; R++) for(let c = 0; c <= range.e.c; c++){
    const cell = ws[XLSX.utils.encode_cell({ r:R, c })];
    if(cell && cell.t === 'n' && !Number.isInteger(cell.v)) cell.z = Math.abs(cell.v) < 0.01 ? '0.0000' : '#,##0.00';
  }
  if(filter) ws['!autofilter'] = { ref:ws['!ref'] };
  return ws;
}
function buildWorkbook(){
  const wb = XLSX.utils.book_new();
  const add = (name, ws) => XLSX.utils.book_append_sheet(wb, ws, name);
  const o = S.scan && S.scan.overall;
  add('Summary', sheet([
    ['Item', 'Value'], ['IMPORTANT', MODEL_NOTE], ['Design well', designWell() ? designWell().name : ''], ['Date', todayText()],
    ['Field / location', $('metaField').value.trim()], ['Prepared by', $('metaPreparedBy').value.trim()],
    ['Unit system', S.units === 'm' ? 'Metric (m, hole radius m)' : 'Field (ft, hole radius in)'], [],
    ...(o ? [['Minimum separation factor', roundSF(o.minSF.sf)], ['Status', STATUS_LABELS[o.status]], ['Worst offset', o.wellName],
      [`Design MD at minimum (${U().len})`, dispLen(o.minSF.designMD)], [`Closest distance (${U().len})`, dispLen(o.minDist.distance)], ['Closest offset', o.closestName], ['Alert intervals', o.alerts], []] : []),
    ['Parameter', 'Value'], ...parameterRows(), [], ...warningList().map(w => ['Warning', w])
  ]));
  add('Wells', sheet([wellHead(), ...wellRows()]));
  const put = (name, t, filter) => { if(t.body.length) add(name, sheet([t.head, ...t.body], filter)); };
  put('Offset Summary', summaryTableData());
  put('Alert Intervals', alertTableData(), true);
  put('SF Scan', scanTableData(), true);
  if(S.scan){
    const base = S.scan.offsets[0].records.filter(r => !r.minimum || Math.abs(r.designMD % DESIGN_STEP) < 1e-6);
    const mds = tableRecords(base, currentStepM(), designWell().placed.map(p => p.md)).map(r => r.designMD);
    const nearest = (records, md) => records.reduce((a, b) => Math.abs(b.designMD - md) < Math.abs(a.designMD - md) ? b : a);
    add('Distance Profile', sheet([[`Design MD (${U().len})`, ...S.scan.offsets.map(x => `${wellById(x.id).name} distance (${U().len})`)],
      ...mds.map(md => [dispLen(md), ...S.scan.offsets.map(x => dispLen(nearest(x.records, md).distance))])]));
  }
  if(comparisonRows().length) add('Design Comparison', sheet([comparisonHead(), ...comparisonRows()]));
  put('Surveys', stationTableData(), true);
  return wb;
}
function exportExcel(){
  if(!S.wells.some(w => w.placed.length)) return toast('Load a well first', 'error');
  XLSX.writeFile(buildWorkbook(), `${fileStem()}_AntiCollision_${S.units}.xlsx`);
}

/* ===== PLOTS ===== */
const PLOT_SPECS = {
  sf:       { title:'Separation Factor',   w:1100, h:640 },
  distance: { title:'Separation Distance', w:1100, h:640 },
  cylinder: { title:'Travelling Cylinder', w:900,  h:900 },
  plan:     { title:'Plan View',           w:900,  h:800 },
  section:  { title:'Vertical Section',    w:1000, h:740 },
  view3d:   { title:'3D Well Paths',       w:1000, h:760 }
};
function offscreenChart(key, width, height, options = {}){
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.appendChild(svg); document.body.appendChild(holder);
  const camera = { ...($('chart3d').__camera || Charts.VIEWS.iso) };
  Charts[key](svg, buildModel(), { width, height, interactive:false, camera, ...options });
  return { svg, remove:() => holder.remove() };
}
function plotSvgString(key){
  const spec = PLOT_SPECS[key], design = designWell();
  const r = offscreenChart(key, spec.w, spec.h, { title:`${spec.title}${design ? ' - ' + design.name : ''}`,
    subtitle:`${S.units === 'm' ? 'Metric' : 'Field'} units  |  ${todayText()}  |  screening tool, simplified uncertainty${S.params.useUncertainty ? '' : ' (OFF)'}` });
  const str = new XMLSerializer().serializeToString(r.svg);
  r.remove();
  return { str, w:spec.w, h:spec.h, name:`${fileStem()}_${spec.title.replace(/\s+/g, '_')}` };
}
function plotPngBlob(key, scale = 3){
  const p = plotSvgString(key);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([p.str], { type:'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = p.w * scale; cv.height = p.h * scale;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(b => b ? resolve({ blob:b, name:p.name + '.png' }) : reject(new Error('PNG encoding failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not rasterise the plot')); };
    img.src = url;
  });
}
async function exportPlot(key, format){
  if(!chartAvailable(key)) return toast('There is nothing to export yet', 'error');
  try {
    if(format === 'svg'){
      const p = plotSvgString(key);
      download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + p.str], { type:'image/svg+xml' }), p.name + '.svg');
    } else { const r = await plotPngBlob(key); download(r.blob, r.name); }
  } catch(err){ console.error(err); toast(`Export failed: ${err.message}`, 'error'); }
}
