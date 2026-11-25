/* =============================================================
   Anti-Collision Analyst — pdf.js
   Landscape PDF report (jsPDF + AutoTable) with vector plots
   drawn by svg2pdf.
   ============================================================= */

/* The built-in PDF fonts only cover Windows-1252: transliterate anything else. */
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SWAPS = { '→':'->', '−':'-', '∞':'infinite', '≥':'>=', '≤':'<=', '≈':'~', '◆':'*', '●':'o' };
const pdfText = v => Array.from(String(v ?? '')).map(ch => {
  const c = ch.codePointAt(0);
  if(c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.includes(ch)) return ch;
  return SWAPS[ch] || '?';
}).join('');

async function buildPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4', compress:true });
  const W = 297, H = 210, M = 12, NAVY = [15, 23, 42], TEAL = [13, 148, 136], GREY = [100, 116, 139];
  const RGB = { critical:[220, 38, 38], warning:[217, 119, 6], safe:[5, 150, 105] };
  const FILL = { critical:[254, 242, 242], warning:[255, 247, 237] };
  const design = designWell(), name = design.name, date = todayText(), o = S.scan.overall;
  const field = $('metaField').value.trim(), by = $('metaPreparedBy').value.trim();
  const write = (str, x, y, opt = {}) => {
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal'); doc.setFontSize(opt.size || 9);
    doc.setTextColor(...(opt.color || NAVY)); doc.text(pdfText(str), x, y, opt.align ? { align:opt.align } : undefined);
  };
  const paragraph = (str, x, y, width, opt = {}) => {
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal'); doc.setFontSize(opt.size || 8);
    const lines = doc.splitTextToSize(pdfText(str), width);
    lines.forEach((l, i) => write(l, x, y + i * ((opt.size || 8) * 0.45), opt));
    return y + lines.length * ((opt.size || 8) * 0.45);
  };
  const heading = (str, y, x = M) => { doc.setFillColor(...TEAL); doc.rect(x, y - 3.6, 1.4, 4.6, 'F'); write(str, x + 3.5, y, { bold:true, size:11 }); };
  const baseStyles = { font:'helvetica', fontSize:7, cellPadding:1.15, textColor:NAVY, lineColor:[226, 232, 240], lineWidth:0.2, halign:'right' };
  const nf = (v, head) => typeof v !== 'number' ? v : isFactorColumn(head) ? (v < 0 ? '-' : '') + fmtSF(Math.abs(v)) : /^Alerts?( |$)|Stations/.test(head) ? String(v)
    : v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const table = (head, body, opts = {}, status = []) => {
    doc.autoTable({
      head:[head.map(pdfText)], body:body.map(r => r.map((v, i) => pdfText(nf(v, head[i])))), theme:'grid', margin:{ top:22, bottom:15, left:M, right:M },
      styles:baseStyles, headStyles:{ fillColor:NAVY, textColor:255, halign:'center', fontSize:6.8 }, columnStyles:{ 0:{ halign:'left' } },
      didParseCell:d => {
        if(d.section !== 'body') return;
        const s = status[d.row.index];
        if(s && FILL[s]) d.cell.styles.fillColor = FILL[s];
        const label = String(d.cell.raw).toLowerCase();
        if(RGB[label]){ d.cell.styles.textColor = RGB[label]; d.cell.styles.fontStyle = 'bold'; d.cell.styles.halign = 'center'; }
      },
      ...opts });
    return doc.lastAutoTable.finalY;
  };
  const room = (y, need) => { if(y + need > H - 16){ doc.addPage(); return 25; } return y; };
  const chart = async (key, x, y, w, h) => {
    const PX = 3.6;
    const r = offscreenChart(key, Math.round(w * PX), Math.round(h * PX), { font:'helvetica', text:pdfText });
    doc.setFont('helvetica', 'normal');
    try { await doc.svg(r.svg, { x, y, width:w, height:h }); }
    finally { r.remove(); }
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.25); doc.rect(x, y, w, h);
  };

  /* ---- 1. summary ---- */
  let y = 26;
  write(name, M, y + 2, { bold:true, size:20 });
  const facts = [['Field / location', field], ['Prepared by', by], ['Date', date], ['Units', S.units === 'm' ? 'metric (m)' : 'field (ft, hole radius in)']].filter(f => f[1]).map(f => `${f[0]}: ${f[1]}`).join('     |     ');
  write(facts, M, y + 9, { color:GREY });
  y += 13;
  doc.setFillColor(254, 242, 242); doc.setDrawColor(...RGB.critical); doc.setLineWidth(0.4); doc.roundedRect(M, y, W - 2 * M, 13, 1.5, 1.5, 'FD');
  paragraph((S.params.useUncertainty ? '' : 'POSITIONAL UNCERTAINTY WAS OFF: the separation factor below is not a collision-risk measure. ') + MODEL_NOTE, M + 3, y + 5, W - 2 * M - 6, { bold:true, size:8.5, color:[153, 27, 27] });
  y += 18;
  const tiles = summaryTiles(), tw = (W - 2 * M - 5 * 3) / 6;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 3), s = t[3];
    doc.setFillColor(...(FILL[s] || [240, 253, 250])); doc.setDrawColor(...(RGB[s] || [153, 246, 228])); doc.setLineWidth(0.3); doc.roundedRect(x, y, tw, 19, 1.5, 1.5, 'FD');
    write(t[0], x + 3, y + 5.5, { size:7, color:GREY });
    let size = 14; doc.setFont('helvetica', 'bold'); doc.setFontSize(size);
    while(size > 7 && doc.getTextWidth(pdfText(t[1])) > tw - 6){ size -= 0.5; doc.setFontSize(size); }
    write(t[1], x + 3, y + 12.5, { size, bold:true, color:RGB[s] || NAVY });
    write(t[2], x + 3, y + 16.7, { size:7, color:GREY });
  });
  y += 27;
  heading('Offset well summary', y);
  const sum = summaryTableData();
  y = table(sum.head, sum.body, { startY:y + 3 }, sum.status) + 8;
  const cmp = comparisonRows();
  if(cmp.length){
    y = room(y, 30);
    heading('Original survey compared with the designed profile', y);
    y = table(comparisonHead(), cmp, { startY:y + 3 }) + 8;
  }
  const warnings = warningList();
  if(warnings.length){
    y = room(y, 12);
    write('Warnings', M, y, { bold:true, color:[194, 65, 12] });
    y += 4.5;
    warnings.forEach(w => { y = room(y, 5); y = paragraph('- ' + w, M, y, W - 2 * M) + 1; });
  }

  /* ---- 2. inputs ---- */
  doc.addPage(); y = 25;
  heading('Wells', y);
  y = table(wellHead(), wellRows(), { startY:y + 3, styles:{ ...baseStyles, halign:'left' } }) + 9;
  y = room(y, 50);
  heading('Analysis parameters', y);
  table(['Parameter', 'Value'], parameterRows(), { startY:y + 3, styles:{ ...baseStyles, halign:'left', fontSize:8 }, columnStyles:{ 0:{ fontStyle:'bold', cellWidth:58 } } });

  /* ---- plots ---- */
  const page = async (left, leftTitle, right, rightTitle) => {
    doc.addPage();
    heading(leftTitle, 24); heading(rightTitle, 24, M + 139);
    await chart(left, M, 28, 134, 165);
    await chart(right, M + 139, 28, 134, 165);
  };
  for(const [key, title] of [['sf', 'Separation factor against design MD'], ['distance', 'Centre-to-centre distance against design MD']]){
    doc.addPage(); heading(title, 24); await chart(key, M, 28, W - 2 * M, 165);
  }
  await page('plan', 'Plan view', 'cylinder', 'Travelling cylinder');
  await page('section', 'Vertical section', 'view3d', '3D well paths');

  /* ---- alert intervals and scan listing ---- */
  doc.addPage(); y = 25;
  const alerts = alertTableData();
  heading(alerts.title, y);
  if(alerts.body.length) y = table(alerts.head, alerts.body, { startY:y + 3 }, alerts.status) + 9;
  else { write('No interval is below the warning threshold.', M, y + 6); y += 15; }
  y = room(y, 30);
  const scan = scanTableData();
  heading(`Separation factor listing (${stepLabel()})`, y);
  y = table(scan.head, scan.body, { startY:y + 3, styles:{ ...baseStyles, fontSize:6.6, cellPadding:0.9 }, columnStyles:{ 2:{ halign:'left' }, 10:{ halign:'left' } } }, scan.status) + 8;
  y = room(y, 28);
  write('Disclaimer', M, y, { bold:true });
  y = paragraph(MODEL_NOTE + ' The software is provided "as is" without warranty of any kind. Anti-collision clearance must be confirmed by a qualified directional engineer using company-approved software and procedures.', M, y + 5, W - 2 * M, { color:GREY, size:7.5 });
  write(`Anti-Collision Analyst v${APP_VERSION}  |  (c) ${date.slice(0, 4)} Ismail Harkat  |  MIT License`, M, y + 5, { size:7.5, color:GREY });

  /* ---- header and footer on every page ---- */
  const pages = doc.getNumberOfPages();
  for(let p = 1; p <= pages; p++){
    doc.setPage(p);
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 14, 'F');
    doc.setFillColor(...TEAL); doc.rect(0, 14, W, 0.8, 'F');
    write('ANTI-COLLISION SCREENING REPORT', M, 9, { bold:true, size:10, color:[255, 255, 255] });
    write(`${name}   |   ${date}`, W - M, 9, { size:9, color:[203, 213, 225], align:'right' });
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2); doc.line(M, H - 10, W - M, H - 10);
    write('Screening only - simplified uncertainty, not ISCWSA - not for operational anti-collision decisions.', M, H - 6, { size:7, color:GREY });
    write(`Page ${p} of ${pages}`, W - M, H - 6, { size:7.5, color:GREY, align:'right' });
  }
  doc.setProperties({ title:pdfText(`Anti-collision screening report - ${name}`), creator:`Anti-Collision Analyst v${APP_VERSION}`, author:pdfText(by) });
  return doc;
}

async function exportPDFReport(){
  if(!S.scan) return toast('Load a design well and at least one offset well', 'error');
  const button = $('btnPdf');
  button.disabled = true; button.textContent = 'Building report…';
  const filter = S.offsetFilter;
  S.offsetFilter = 'all';                    // the report always covers every offset that is shown
  try { (await buildPDF()).save(`${fileStem()}_AntiCollision_Report_${todayText()}.pdf`); }
  catch(err){ console.error(err); toast(`PDF export failed: ${err.message}`, 'error'); }
  finally { S.offsetFilter = filter; button.disabled = false; button.textContent = 'PDF report'; }
}
