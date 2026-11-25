/* =============================================================
   Anti-Collision Analyst — process.js
   Well import and cards, analysis parameters, trajectory
   designer and the recalculation pipeline. Results are rebuilt
   after every change, so they always match the inputs.
   ============================================================= */

/* ===== WELLS ===== */
function newWell(role, name){
  const base = designWell();
  const used = offsetWells().map(w => w.color);
  return { id:S.nextId++, role, name,
    color: role === 'design' ? DESIGN_COLOR : OFFSET_COLORS.find(c => !used.includes(c)) || OFFSET_COLORS[offsetWells().length % OFFSET_COLORS.length],
    source:null, fileStations:[], skipped:[], tie:{ mode:'vertical', tvd:0, north:0, east:0 },
    lat: base ? base.lat : DEFAULT_LOCATION.lat, lon: base ? base.lon : DEFAULT_LOCATION.lon, elev:0,
    located: role === 'design',      // an offset follows the design wellhead until its position is given
    visible:true, designed:null, results:[], placed:[], warnings:[], open:false };
}
function uniqueName(name, ignore){
  const taken = new Set(S.wells.filter(w => w !== ignore).map(w => w.name));
  if(!taken.has(name)) return name;
  let i = 2;
  while(taken.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}
function addDesign(well){
  const old = designWell();
  if(old){ well.lat = old.lat; well.lon = old.lon; well.elev = old.elev; S.wells.splice(S.wells.indexOf(old), 1); }
  S.wells.unshift(well);
}

/* ===== IMPORT ===== */
function pickFiles(role){ const input = $(`file-${role}`); input.value = ''; input.click(); }

async function handleFiles(role, files){
  const list = Array.from(files);
  if(!list.length) return;
  for(const file of role === 'design' ? list.slice(0, 1) : list){
    try {
      const { sheets } = await readWellFile(file);
      const found = sheets.findIndex(s => detectSurveyColumns(s.rows).complete);
      const stem = file.name.replace(/\.[^.]+$/, '');
      const well = newWell(role, uniqueName(stem, role === 'design' ? designWell() : null));
      well.source = { fileName:file.name, sheets, sheet:Math.max(0, found) };
      autoDetect(well); applyMapping(well);
      if(well.fileStations.length < 2) well.open = true;
      if(role === 'design') addDesign(well); else S.wells.push(well);
      if(well.fileStations.length >= 2) toast(`${role === 'design' ? 'Design' : 'Offset'} well loaded: ${well.name} (${well.fileStations.length} stations)`);
      else toast(`Check the column mapping for ${file.name}`, 'error');
      if(role === 'design') initDesigner();
    } catch(err){
      console.error(err);
      toast(`Could not read ${file.name}: ${err.message}`, 'error');
    }
  }
  renderWellCards(); recalculate();
}
function autoDetect(well){
  const src = well.source, d = detectSurveyColumns(src.sheets[src.sheet].rows);
  src.headerRow = Math.max(0, d.headerRow);
  src.cols = d.cols;
  src.unit = d.unit || S.units;
  src.unitGuessed = !d.unit;
  src.tieFromFile = true;
}
function applyMapping(well){
  const src = well.source;
  if(!src) return;
  const r = extractSurvey(src.sheets[src.sheet].rows, src.headerRow, src.cols, src.unit);
  well.fileStations = r.stations;
  well.skipped = r.skipped;
  const first = r.stations[0];
  if(src.tieFromFile && first && first.md > MD_TOL){
    const offset = v => v === null || Math.abs(v) > MAP_COORDINATE_LIMIT ? 0 : v;
    well.tie = first.fileTvd !== null ? { mode:'values', tvd:first.fileTvd, north:offset(first.fileNorth), east:offset(first.fileEast) }
                                      : { mode:'vertical', tvd:0, north:0, east:0 };
  }
}
function setMapping(id, field, value){
  const well = wellById(id), src = well && well.source;
  if(!src) return;
  if(field === 'sheet'){ src.sheet = +value; autoDetect(well); }
  else if(field === 'headerRow'){
    src.headerRow = Math.max(0, (parseInt(value, 10) || 1) - 1);
    src.cols = matchColumns(src.sheets[src.sheet].rows[src.headerRow] || []);
    src.tieFromFile = true;
  }
  else if(field === 'unit'){ src.unit = value; src.unitGuessed = false; src.tieFromFile = true; }
  else { if(+value < 0) delete src.cols[field]; else src.cols[field] = +value; src.tieFromFile = true; }
  applyMapping(well);
  if(well.role === 'design'){ well.designed = null; initDesigner(); }
  renderWellCards(); recalculate();
}
function setTie(id, field, value){
  const well = wellById(id);
  if(!well) return;
  if(well.source) well.source.tieFromFile = false;
  if(field === 'mode'){
    const first = well.fileStations[0], now = first && well.results.length && interpAtMD(well.results, first.md);
    well.tie = value === 'values' && now ? { mode:value, tvd:now.tvd, north:now.north, east:now.east } : { ...well.tie, mode:value };
  } else {
    const v = parseFloat(value);
    if(!Number.isFinite(v)) return renderWellCards();
    well.tie[field] = fromLen(v, S.units);
  }
  renderWellCards(); recalculate();
}

/* ===== WELL SETTINGS ===== */
function setWell(id, field, value){
  const well = wellById(id);
  if(!well) return;
  if(field === 'name'){ well.name = uniqueName(value.trim() || well.name, well); }
  else if(field === 'color') well.color = value;
  else if(field === 'visible') well.visible = value;
  else {
    const v = parseFloat(value);
    if(!Number.isFinite(v)) return renderWellCards();
    const base = designWell();
    if(field === 'lat' || field === 'lon'){
      if((field === 'lat' && Math.abs(v) > 89) || (field === 'lon' && Math.abs(v) > 180)){ toast('Latitude or longitude is out of range', 'error'); return renderWellCards(); }
      well[field] = v; well.located = true;
    }
    else if(field === 'elev') well.elev = fromLen(v, S.units);
    else if((field === 'north' || field === 'east') && base && well !== base){
      const now = surfaceOffset(well, base);
      now[field] = fromLen(v, S.units);
      Object.assign(well, latLonFromOffset(base, now.north, now.east));
      well.located = true;
    }
  }
  renderWellCards(); recalculate();
}
function toggleWell(id){ const w = wellById(id); w.open = !w.open; renderWellCards(); }
function removeWell(id){
  const w = wellById(id);
  S.wells = S.wells.filter(x => x.id !== id);
  if(String(S.offsetFilter) === String(id)) S.offsetFilter = 'all';
  if(w && w.role === 'design') S.designerError = '';
  renderWellCards(); recalculate();
}

function wellCard(w){
  const design = designWell(), src = w.source;
  const shift = design && w !== design ? surfaceOffset(w, design) : { north:0, east:0 };
  const stations = w.designed || w.fileStations;
  const last = w.results[w.results.length - 1];
  const num = (field, label, value, step = 'any') => `<div class="form-group"><label>${label}</label><input type="number" step="${step}" value="${value}" onchange="setWell(${w.id},'${field}',this.value)"></div>`;
  let notes = '';
  if(stations.length < 2) notes += '<div class="import-status bad">No usable survey. Check the column mapping.</div>';
  if(src && src.unitGuessed) notes += '<div class="import-status warn">⚠ The file does not state its depth units. Confirm them below.</div>';
  if(w.skipped.length) notes += `<div class="import-status warn">⚠ ${w.skipped.length} row(s) skipped: ${w.skipped.slice(0, 3).map(s => `row ${s.line} (${esc(s.reason)})`).join(', ')}${w.skipped.length > 3 ? ', …' : ''}</div>`;
  if(w.role === 'offset' && !w.located) notes += '<div class="import-status bad">⚠ Surface position not set: assumed to share the design wellhead.</div>';
  let body = '';
  if(w.open){
    body += `<div class="form-row"><div class="form-group"><label>Well name</label><input type="text" value="${esc(w.name)}" onchange="setWell(${w.id},'name',this.value)"></div>
      ${w.role === 'offset' ? `<div class="form-group color-field"><label>Color</label><input type="color" value="${esc(w.color)}" onchange="setWell(${w.id},'color',this.value)"></div>` : ''}</div>`;
    if(w.role === 'offset' && design) body += `<div class="form-row">${num('north', `North of design (${U().len})`, dispLen(shift.north))}${num('east', `East of design (${U().len})`, dispLen(shift.east))}</div>`;
    body += `<div class="form-row">${num('lat', 'Surface latitude', +w.lat.toFixed(7))}${num('lon', 'Surface longitude', +w.lon.toFixed(7))}${num('elev', `Elevation (${U().len})`, dispLen(w.elev))}</div>`;
    if(src){
      const rows = src.sheets[src.sheet].rows, header = rows[src.headerRow] || [];
      const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const letter = i => (i >= 26 ? letter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + i % 26);
      const col = (field, label) => `<div class="form-group"><label>${label}</label><select onchange="setMapping(${w.id},'${field}',this.value)"><option value="-1">— none —</option>${
        Array.from({ length:width }, (_, i) => `<option value="${i}" ${src.cols[field] === i ? 'selected' : ''}>${letter(i)}: ${esc(String(header[i] ?? '').slice(0, 30))}</option>`).join('')}</select></div>`;
      body += `<div class="mapping"><b>${esc(src.fileName)}</b><div class="form-row">
        ${src.sheets.length > 1 ? `<div class="form-group"><label>Sheet</label><select onchange="setMapping(${w.id},'sheet',this.value)">${src.sheets.map((s, i) => `<option value="${i}" ${i === src.sheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        <div class="form-group"><label>Header row</label><input type="number" min="1" value="${src.headerRow + 1}" onchange="setMapping(${w.id},'headerRow',this.value)"></div>
        <div class="form-group"><label>Depth units</label><select onchange="setMapping(${w.id},'unit',this.value)"><option value="m" ${src.unit === 'm' ? 'selected' : ''}>Metres</option><option value="ft" ${src.unit === 'ft' ? 'selected' : ''}>Feet</option></select></div></div>
        <div class="form-row">${col('md', 'MD *')}${col('inc', 'Inc *')}${col('azi', 'Azi *')}</div>
        <div class="form-row">${col('tvd', 'TVD (check)')}${col('north', 'North (check)')}${col('east', 'East (check)')}</div></div>`;
    }
  }
  const first = stations[0];
  if(first && first.md > MD_TOL){
    const t = w.tie;
    const tn = (field, label) => `<div class="form-group"><label>${label} (${U().len})</label><input type="number" step="any" value="${dispLen(t[field], 3)}" onchange="setTie(${w.id},'${field}',this.value)"></div>`;
    body += `<div class="tie-box"><div class="form-group"><label>Tie-in at first station (MD ${fmtLen(first.md, 1)})</label><select onchange="setTie(${w.id},'mode',this.value)">
      <option value="vertical" ${t.mode === 'vertical' ? 'selected' : ''}>Assume vertical from surface</option><option value="values" ${t.mode === 'values' ? 'selected' : ''}>Enter TVD, North, East of this well</option></select></div>
      ${t.mode === 'values' ? `<div class="form-row">${tn('tvd', 'TVD')}${tn('north', 'North')}${tn('east', 'East')}</div>` : ''}</div>`;
  }
  const place = w.role === 'offset' && design ? ` | ${fmtLen(shift.north, 0)} N, ${fmtLen(shift.east, 0)} E` : '';
  return `<div class="file-card" style="border-left-color:${esc(w.color)}">
    <div class="file-head">
      <span class="well-title">${w.role === 'design' ? '<span class="badge badge-design">DESIGN</span>' : ''}${w.designed ? '<span class="badge badge-designed">DESIGNED</span>' : ''}<b>${esc(w.name)}</b></span>
      <span class="well-actions">
        ${w.role === 'offset' ? `<label class="show-toggle" title="Show in the plots"><input type="checkbox" ${w.visible ? 'checked' : ''} onchange="setWell(${w.id},'visible',this.checked)">Show</label>` : ''}
        <button class="btn btn-toggle" onclick="toggleWell(${w.id})" aria-expanded="${w.open}">${w.open ? 'Close' : 'Edit'}</button>
        <button class="btn btn-danger btn-x" aria-label="Remove ${esc(w.name)}" onclick="removeWell(${w.id})">X</button></span>
    </div>
    <div class="import-status">${stations.length} stations${last ? ` | TD ${fmtLen(last.md, 0)} MD, ${fmtLen(last.tvd, 0)} TVD` : ''}${place}</div>
    ${notes}${body}</div>`;
}
function renderWellCards(){
  const design = designWell();
  $('designCard').innerHTML = design ? wellCard(design) : '';
  $('offsetCards').innerHTML = offsetWells().map(wellCard).join('');
  $('designerSection').hidden = !design;
  const select = $('offsetFilter');
  select.innerHTML = '<option value="all">All offsets</option>' + offsetWells().map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
  select.value = String(S.offsetFilter);
}

/* ===== SAMPLE ===== */
function loadSample(){
  S.wells = [];
  sampleData().forEach((d, i) => {
    const well = newWell(i === 0 ? 'design' : 'offset', d.name);
    well.fileStations = d.stations.map(s => ({ ...s, fileTvd:null, fileNorth:null, fileEast:null }));
    well.sample = true;
    if(i === 0) addDesign(well);
    else { Object.assign(well, latLonFromOffset(designWell(), d.north, d.east)); well.located = true; S.wells.push(well); }
  });
  S.offsetFilter = 'all';
  initDesigner(); renderWellCards();
  recalculate();
  const end = designWell().results.at(-1);
  onParam('vsAz', end.closureAzi.toFixed(1)); $('inp-vsAz').value = S.params.vsAz;
  toast('Sample wells loaded (synthetic data)');
}
function clearAll(){
  S.wells = []; S.offsetFilter = 'all'; S.designerError = '';
  renderWellCards(); recalculate();
}

/* ===== PARAMETERS ===== */
const PARAM_RULES = {
  vsAz:[0, 360], rDesign:[0.01, 5], rOffset:[0.01, 5], warn:[0.01, 1000], crit:[0.01, 1000],
  depthFactor:[0, 0.1], incError:[0, 10], aziError:[0, 30], sigma:[0, 10] };
function onParam(key, value){
  if(key === 'useUncertainty') S.params.useUncertainty = value;
  else {
    let v = parseFloat(value);
    if(key === 'rDesign' || key === 'rOffset') v = radiusToM(v);
    const [lo, hi] = PARAM_RULES[key];
    if(!Number.isFinite(v) || v < lo - 1e-9 || v > hi + 1e-9){ toast('Value is out of range', 'error'); return renderParams(); }
    const next = { ...S.params, [key]:v };
    if(next.crit > next.warn){ toast('The critical threshold cannot exceed the warning threshold', 'error'); return renderParams(); }
    S.params = next;
  }
  renderParams(); scheduleRecalculate();
}
function renderParams(){
  const p = S.params;
  Object.keys(PARAM_RULES).forEach(key => {
    const el = $(`inp-${key}`);
    if(el && document.activeElement !== el) el.value = key === 'rDesign' || key === 'rOffset' ? dispRadius(p[key]) : +p[key].toFixed(4);
  });
  $('inp-useUncertainty').checked = p.useUncertainty;
  $('uncertaintyFields').hidden = !p.useUncertainty;
  $('uncertaintyOff').hidden = p.useUncertainty;
  $('formulaText').textContent = p.useUncertainty ? 'SF = distance / (hole radii + k × uncertainty radii)' : 'SF = distance / hole radii';
}

/* ===== TRAJECTORY DESIGNER ===== */
function initDesigner(){
  const w = designWell();
  S.designerError = '';
  if(!w || w.fileStations.length < 2) return;
  const j = estimateJ(w.fileStations);
  $('td-kop').value = dispLen(j.kop); $('td-td').value = dispLen(j.td);
  $('td-azi').value = j.azi; $('td-inc').value = j.inc;
  $('td-rate').value = +toDls(j.rate, S.units).toFixed(3);
}
function readDesigner(){
  const v = id => { const x = $(id).value.trim(); return x === '' ? NaN : Number(x); };
  return { kop:fromLen(v('td-kop'), S.units), rate:v('td-rate') / U().dlsFactor, inc:v('td-inc'), azi:v('td-azi'), td:fromLen(v('td-td'), S.units) };
}
function onDesignerInput(){
  if(!$('td-auto').checked) return;
  clearTimeout(window._designTimer);
  window._designTimer = setTimeout(applyDesign, 500);
}
function applyDesign(){
  const w = designWell();
  if(!w) return;
  const j = jProfile(readDesigner());
  S.designerError = j.error || (j.reached ? '' : 'Total depth is reached before the target inclination.');
  if(!j.error) w.designed = j.stations;
  renderWellCards(); recalculate();
}
function resetDesign(){
  const w = designWell();
  if(!w) return;
  w.designed = null; initDesigner(); renderWellCards(); recalculate();
}
function renderDesignerStatus(){
  const box = $('designerStatus'), w = designWell();
  let html = S.designerError ? `<div class="import-status bad">${esc(S.designerError)}</div>` : '';
  if(w && w.designed && S.scan && S.baseline){
    const card = (label, scan) => { const o = scan.overall; return `<div class="sf-card ${o.status}"><span>${label}</span><b>${fmtSF(o.minSF.sf)}</b><small>MD ${fmtLen(o.minSF.designMD, 0)} | ${esc(o.wellName)}</small></div>`; };
    html += `<div class="sf-pair">${card('Min SF, original', S.baseline)}${card('Min SF, designed', S.scan)}</div>`;
  }
  box.innerHTML = html;
  $('btnResetDesign').disabled = !(w && w.designed);
}

/* ===== RECALCULATION ===== */
function computeInFrame(well, stations, design){
  const r = computeWell(stations, well.tie, S.params.vsAz);
  const results = r.results.length >= 2 ? r.results : [];
  const shift = design && well !== design ? { ...surfaceOffset(well, design), up:well.elev - design.elev } : { north:0, east:0, up:0 };
  return { results, warnings:r.warnings, placed:placeWell(results, shift).map(p => withDerived(p, S.params.vsAz)), shift };
}
function runScan(designResults, offsets){
  const out = offsets.map(w => {
    const records = scanOffset(designResults, prepareOffset(w.placed), S.params);
    return { id:w.id, records, summary:summarizeOffset(records, S.params) };
  }).filter(o => o.summary);
  if(!out.length) return null;
  const worst = minBy(out.map(o => ({ ...o, sf:o.summary.minSF.sf })), 'sf');
  const closest = minBy(out.map(o => ({ ...o, d:o.summary.minDist.distance })), 'd');
  return { offsets:out, overall:{ minSF:worst.summary.minSF, wellName:wellById(worst.id).name, status:worst.summary.status,
    minDist:closest.summary.minDist, closestName:wellById(closest.id).name,
    alerts:out.reduce((n, o) => n + o.summary.alerts.length, 0), critical:out.reduce((n, o) => n + o.summary.alerts.filter(a => a.status === 'critical').length, 0) } };
}
function scheduleRecalculate(){ clearTimeout(window._calcTimer); window._calcTimer = setTimeout(recalculate, 150); }
function recalculate(){
  clearTimeout(window._calcTimer);
  const design = designWell();
  if(design) S.wells.filter(w => w.role === 'offset' && !w.located).forEach(w => { w.lat = design.lat; w.lon = design.lon; });
  S.wells.forEach(w => Object.assign(w, computeInFrame(w, w.designed || w.fileStations, design)));
  const offsets = offsetWells().filter(w => w.placed.length);
  const ready = design && design.placed.length && offsets.length;
  S.scan = ready ? runScan(design.placed, offsets) : null;
  S.baseline = ready && design.designed ? runScan(computeInFrame(design, design.fileStations, design).placed, offsets) : null;
  renderWarnings(); renderWellCards(); renderDesignerStatus();
  resetZoomIfMoved();
  renderKpis(); drawCharts(); renderTable(); refreshMap();
}
function warningList(){
  const out = [];
  S.wells.forEach(w => w.warnings.forEach(t => out.push(`${w.name}: ${t}`)));
  const design = designWell();
  /* data problems that change, or silently shrink, what has been assessed */
  S.wells.forEach(w => {
    if(!w.placed.length) out.push(`${w.name} is NOT included in the scan: it has no usable survey.`);
    if(w.source && w.source.unitGuessed) out.push(`${w.name}: the file does not state its depth units; ${w.source.unit === 'm' ? 'metres' : 'feet'} assumed. Confirm them under Edit.`);
    if(w.skipped.length) out.push(`${w.name}: ${w.skipped.length} survey row(s) were skipped on import.`);
  });
  if(design && design.placed.length && design.placed[0].md > 0.5) out.push(`The design well is assessed only from MD ${fmtLen(design.placed[0].md, 0)} downwards.`);
  offsetWells().forEach(w => {
    if(!design || !w.placed.length) return;
    const s = w.shift || { north:0, east:0 };
    if(Math.hypot(s.north, s.east) < SAME_SITE && Math.abs(w.elev - design.elev) < SAME_SITE)
      out.push(`${w.name} has the same surface position as the design well, so separation near surface is zero. Set its position unless that is intended.`);
  });
  (S.scan ? S.scan.offsets : []).forEach(o => {
    if(o.summary.endLimited) out.push(`${wellById(o.id).name}: the closest point is at the start or end of its survey. Separation outside the surveyed interval is not assessed.`);
  });
  if(!S.params.useUncertainty) out.push('Positional uncertainty is off: the separation factor only compares distance with hole size and is not a collision-risk measure.');
  return out;
}
function renderWarnings(){ $('warnings').innerHTML = warningList().map(w => `<div>⚠ ${esc(w)}</div>`).join(''); }

/* ===== UNITS AND VIEW ===== */
function setUnits(u){
  if(!UNITS[u]) return;
  const design = designWell(), keep = design ? readDesigner() : null;
  S.units = u;
  try { localStorage.setItem('aca-units', u); } catch(e){ /* storage may be unavailable */ }
  S.view.radius = 'auto';
  applyUnitLabels(); renderParams(); renderTableControls(); renderCylinderRadius();
  if(keep && Number.isFinite(keep.kop)){
    $('td-kop').value = dispLen(keep.kop); $('td-td').value = dispLen(keep.td);
    $('td-rate').value = +toDls(keep.rate, u).toFixed(3);
  }
  renderWellCards(); recalculate();
}
function applyUnitLabels(){
  document.querySelectorAll('.u-len').forEach(el => { el.textContent = U().len; });
  document.querySelectorAll('.u-radius').forEach(el => { el.textContent = U().radius; });
  document.querySelectorAll('.u-dls').forEach(el => { el.textContent = U().dls; });
  document.querySelectorAll('.unit-switch button').forEach(b => {
    const on = b.dataset.unit === S.units;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
  });
}
function onViewToggle(key, value){ S.view[key] = value; resetZoom(); drawCharts(); }
function onOffsetFilter(value){ S.offsetFilter = value === 'all' ? 'all' : +value; drawCharts(); renderTable(); }

/* ===== MAP (loaded only on request: map tiles reveal the area to the tile server) ===== */
let leafletMap = null, mapLayers = null;
function loadAsset(tag, attrs){
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement(tag), attrs);
    el.onload = resolve; el.onerror = () => { el.remove(); reject(new Error('Could not load the map library')); };
    document.head.appendChild(el);
  });
}
async function showMap(){
  if(!designWell()) return toast('Load the design well first', 'error');
  try {
    if(!window.L){
      await loadAsset('link', { rel:'stylesheet', href:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' });
      await loadAsset('script', { src:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' });
    }
    S.view.map = true;
    $('mapPrompt').hidden = true; $('mapBox').hidden = false;
    if(!leafletMap){
      leafletMap = L.map('mapBox');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(leafletMap);
      mapLayers = L.layerGroup().addTo(leafletMap);
    }
    refreshMap(true);
  } catch(err){ console.error(err); toast(err.message, 'error'); }
}
function refreshMap(fit){
  const design = designWell();
  if(!leafletMap || !S.view.map) return;
  mapLayers.clearLayers();
  if(!design || !design.placed.length) return;
  const at = p => { const g = latLonFromOffset(design, p.north, p.east); return [g.lat, g.lon]; };
  const bounds = [];
  S.wells.filter(w => w.visible && w.placed.length).forEach(w => {
    const line = w.placed.map(at); bounds.push(...line);
    L.polyline(line, { color:w.color, weight:w.role === 'design' ? 4 : 2.5 }).bindTooltip(esc(w.name), { sticky:true }).addTo(mapLayers);
    L.circleMarker(line[0], { radius:w.role === 'design' ? 7 : 5, color:'#fff', weight:2, fillColor:w.color, fillOpacity:1 }).bindTooltip(`${esc(w.name)} wellhead`).addTo(mapLayers);
  });
  (S.scan ? S.scan.offsets : []).forEach(o => {
    const r = o.summary.minSF;
    L.polyline([at(r.design), at(r.offset)], { color:STATUS_COLORS[o.summary.status], weight:2, dashArray:'5,4' })
      .bindTooltip(`${esc(wellById(o.id).name)}: SF ${fmtSF(r.sf)} at MD ${fmtLen(r.designMD, 0)}`).addTo(mapLayers);
    L.circleMarker(at(r.design), { radius:6, color:STATUS_COLORS[o.summary.status], weight:2, fillOpacity:0.6 }).addTo(mapLayers);
  });
  if(fit && bounds.length) leafletMap.fitBounds(bounds, { padding:[40, 40] });
  leafletMap.invalidateSize();
}
