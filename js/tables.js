/* =============================================================
   Anti-Collision Analyst — tables.js
   Summary figures and tables. The same builders feed the screen,
   CSV, Excel and the PDF report. Each returns
   { title, head, body, status:[per row] }.
   ============================================================= */

const round = (v, d = 2) => { const f = 10 ** d; const r = Math.round(v * f) / f; return r === 0 ? 0 : r; };
const roundSF = v => round(v, v >= 100 ? 1 : 3);
const isFactorColumn = h => /^(SF$|Min SF|Distance \/ radii|Change$)/.test(h);
const stepList = () => U().tableSteps;
const currentStepM = () => S.tableStepIndex < 0 ? 0 : fromLen(stepList()[S.tableStepIndex], S.units);
const stepLabel = () => S.tableStepIndex < 0 ? 'design stations and minima' : `${stepList()[S.tableStepIndex]} ${U().len} MD step, design stations and minima`;
const scanOffsets = (scan, filtered) => (scan ? scan.offsets : []).filter(o => !filtered || S.offsetFilter === 'all' || o.id === S.offsetFilter);

function summaryTableData(scan = S.scan, filtered = false){
  const u = U(), L = v => round(toLen(v, S.units));
  const head = ['Offset well', 'Min SF', 'Status', `Design MD at min SF (${u.len})`, `Offset MD at min SF (${u.len})`, `Distance at min SF (${u.len})`,
    `Closest distance (${u.len})`, `Design MD at closest (${u.len})`, 'Alert intervals', 'Note'];
  const list = [...scanOffsets(scan, filtered)].sort((a, b) => a.summary.minSF.sf - b.summary.minSF.sf);
  return { title:'Offset Summary', head, status:list.map(o => o.summary.status), body:list.map(o => {
    const s = o.summary;
    return [wellById(o.id).name, roundSF(s.minSF.sf), STATUS_LABELS[s.status], L(s.minSF.designMD), L(s.minSF.offsetMD), L(s.minSF.distance),
      L(s.minDist.distance), L(s.minDist.designMD), s.alerts.length, s.endLimited ? 'closest point at limit of offset survey' : ''];
  }) };
}
function alertTableData(scan = S.scan, filtered = false){
  const u = U(), L = v => round(toLen(v, S.units));
  const head = ['Offset well', 'Status', `From design MD (${u.len})`, `To design MD (${u.len})`, 'Min SF', `At MD (${u.len})`, `Distance there (${u.len})`, `Closest distance (${u.len})`];
  const list = scanOffsets(scan, filtered).flatMap(o => o.summary.alerts.map(a => ({ a, name:wellById(o.id).name }))).sort((x, y) => x.a.worst.sf - y.a.worst.sf);
  return { title:'Alert Intervals (SF below the warning threshold)', head, status:list.map(x => x.a.status),
    body:list.map(({ a, name }) => [name, STATUS_LABELS[a.status], L(a.from), L(a.to), roundSF(a.worst.sf), L(a.worst.designMD), L(a.worst.distance), L(a.closest.distance)]) };
}
function scanTableData(filtered = false, scan = S.scan){
  const u = U(), L = v => round(toLen(v, S.units));
  const head = [`Design MD (${u.len})`, `Design TVD (${u.len})`, 'Offset well', `Offset MD (${u.len})`, `Distance (${u.len})`, 'SF', 'Status',
    `Uncertainty design (${u.len})`, `Uncertainty offset (${u.len})`, 'Distance / radii', 'Note'];
  const stationMds = designWell() ? designWell().placed.map(p => p.md) : [];
  const rows = scanOffsets(scan, filtered).flatMap(o => {
    const s = o.summary;
    return tableRecords(o.records, currentStepM(), stationMds).map(r => ({ r, name:wellById(o.id).name,
      note:[r === s.minSF ? 'lowest SF' : '', r === s.minDist ? 'closest approach' : '', r.atOffsetEnd ? 'limit of offset survey' : ''].filter(Boolean).join('; ') }));
  }).sort((a, b) => a.r.designMD - b.r.designMD || a.name.localeCompare(b.name));
  const on = S.params.useUncertainty;
  return { title:'Separation Factor Scan', head, status:rows.map(x => sfStatus(x.r.sf, S.params)),
    body:rows.map(({ r, name, note }) => [L(r.designMD), L(r.design.tvd), name, L(r.offsetMD), L(r.distance), roundSF(r.sf), STATUS_LABELS[sfStatus(r.sf, S.params)],
      on ? L(r.uDesign) : 'off', on ? L(r.uOffset) : 'off', roundSF(r.ratio), note]) };
}
function stationTableData(filtered = false){
  const u = U(), L = v => round(toLen(v, S.units));
  const head = ['Well', `MD (${u.len})`, 'Inc (deg)', 'Azi (deg)', `TVD (${u.len})`, `North (${u.len})`, `East (${u.len})`, `DLS (${u.dls})`, 'Note'];
  const wells = S.wells.filter(w => !filtered || S.offsetFilter === 'all' || w.role === 'design' || w.id === S.offsetFilter);
  return { title:'Well Surveys (frame of the design wellhead)', head, status:[], body:wells.flatMap(w => w.placed.map(p =>
    [w.name, L(p.md), round(p.inc), round(p.azi), L(p.tvd), L(p.north), L(p.east), round(toDls(p.dls, S.units)), p.assumed ? 'assumed' : w.designed ? 'designed' : ''])) };
}
const TABLES = {
  summary:  filtered => summaryTableData(S.scan, filtered),
  alerts:   filtered => alertTableData(S.scan, filtered),
  scan:     filtered => scanTableData(filtered),
  stations: filtered => stationTableData(filtered)
};
const EMPTY_TEXT = { summary:'Load a design well and at least one offset well.', alerts:'No interval is below the warning threshold.',
  scan:'Load a design well and at least one offset well.', stations:'Load a well.' };

function renderTableControls(){
  $('stepSelect').innerHTML = stepList().map((s, i) => `<option value="${i}">${s} ${U().len}</option>`).join('') + '<option value="-1">Stations only</option>';
  $('stepSelect').value = S.tableStepIndex;
}
function renderTable(){
  const t = TABLES[S.table](true);
  const cell = (v, i) => typeof v === 'number' ? (isFactorColumn(t.head[i]) ? fmtSF(v) : /^Alerts?( |$)|Stations/.test(t.head[i]) ? v : v.toFixed(2))
    : STATUS_LABELS[String(v).toLowerCase()] === v ? `<span class="status ${String(v).toLowerCase()}">${v}</span>` : esc(v);
  $('dataTable').innerHTML = t.body.length
    ? `<table><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.body.map((r, i) =>
        `<tr class="${t.status[i] && t.status[i] !== 'safe' ? 'row-' + t.status[i] : ''}">${r.map((v, k) => `<td>${cell(v, k)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<div class="table-empty">${S.table === 'alerts' && !S.scan ? EMPTY_TEXT.scan : EMPTY_TEXT[S.table]}</div>`;
  $('tableInfo').textContent = t.body.length ? `${t.body.length} row${t.body.length === 1 ? '' : 's'}${S.table === 'scan' ? ' | ' + stepLabel() : ''}` : '';
  $('stepControl').hidden = S.table !== 'scan';
}
function onTableChange(v){ S.table = v; renderTable(); }
function onStepChange(v){ S.tableStepIndex = +v; renderTable(); }

function summaryTiles(){
  const u = U(), o = S.scan && S.scan.overall;
  if(!o) return [['Minimum separation factor', '—', '', ''], ['Closest distance', '—', u.len, ''], ['Design MD at minimum SF', '—', u.len, ''],
    ['Worst offset well', '—', '', ''], ['Alert intervals', '—', '', ''], ['Offset wells', String(offsetWells().length), '', '']];
  const L = (v, d = 1) => toLen(v, S.units).toFixed(d);
  return [
    ['Minimum separation factor', fmtSF(o.minSF.sf), STATUS_LABELS[o.status], o.status],
    ['Closest distance', L(o.minDist.distance, 2), `${u.len} to ${o.closestName}`, ''],
    ['Design MD at minimum SF', L(o.minSF.designMD, 0), u.len, ''],
    ['Worst offset well', o.wellName, 'lowest SF', ''],
    ['Alert intervals', String(o.alerts), `${o.critical} critical`, o.critical ? 'critical' : o.alerts ? 'warning' : 'safe'],
    ['Offset wells scanned', String(S.scan.offsets.length), S.params.useUncertainty ? 'uncertainty on' : 'uncertainty OFF', S.params.useUncertainty ? '' : 'warning']
  ];
}
function renderKpis(){
  $('kpiStrip').innerHTML = summaryTiles().map(([label, value, unit, status]) =>
    `<div class="kpi ${status}"><span class="kpi-label">${label}</span><span class="kpi-value">${esc(value)}</span><span class="kpi-unit">${esc(unit)}</span></div>`).join('');
}
