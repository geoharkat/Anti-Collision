/* =============================================================
   Anti-Collision Analyst — collision.js
   Pure anti-collision calculations (no DOM). Metres throughout.

   Separation factor
       SF = D / (rD + rO + k (uD + uO))
   D   centre-to-centre distance from a design-well point to the
       closest point of the offset well
   r   borehole radii
   u   simplified positional uncertainty radius (NOT ISCWSA)
   k   multiplier on that radius (1 = as computed)
   With the uncertainty model off the denominator is rD + rO only,
   which compares distance with hole size and is not a collision-
   risk measure.
   ============================================================= */

const DESIGN_STEP = 5;           // m between evaluation points along the design well
const PATH_STEP = 2;             // m between points used to search an offset well
const SAME_SITE = 0.5;           // m: wellheads closer than this are treated as the same location

/* ===== SURFACE LOCATIONS (WGS-84 length of a degree) ===== */
function degreeLengths(lat){
  const p = lat * DEG;
  return { lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
           lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) };
}
function surfaceOffset(well, ref){
  const len = degreeLengths((well.lat + ref.lat) / 2);
  return { north:(well.lat - ref.lat) * len.lat, east:(well.lon - ref.lon) * len.lon };
}
function latLonFromOffset(ref, north, east){
  let lat = ref.lat + north / degreeLengths(ref.lat).lat;
  lat = ref.lat + north / degreeLengths((ref.lat + lat) / 2).lat;
  return { lat, lon: ref.lon + east / degreeLengths((ref.lat + lat) / 2).lon };
}

/* ===== COMMON FRAME =====
   Positions relative to the design wellhead; a higher offset wellhead reduces its TVD. */
function placeWell(results, shift){
  return results.map(r => ({ ...r, north:r.north + shift.north, east:r.east + shift.east, tvd:r.tvd - (shift.up || 0) }));
}

/* ===== POSITIONAL UNCERTAINTY (simplified 3-term MWD estimate) ===== */
function uncertaintyRadius(md, inc, model){
  const depth = model.depthFactor * md;
  const incl = model.incError * DEG * md;
  const azim = model.aziError * DEG * md * Math.sin(inc * DEG);
  return Math.hypot(depth, incl, azim);
}
function separationFactor(distance, uDesign, uOffset, p){
  const radii = p.rDesign + p.rOffset;
  return distance / (radii + (p.useUncertainty ? p.sigma * (uDesign + uOffset) : 0));
}
const sfStatus = (sf, p) => sf < p.crit ? 'critical' : sf < p.warn ? 'warning' : 'safe';

/* ===== CLOSEST APPROACH =====
   An offset prepared for searching: results (for exact arc positions) plus a dense polyline. */
function prepareOffset(results){
  return { results, path:densify(results, PATH_STEP) };
}
function closestOnWell(offset, p){
  const path = offset.path;
  let best = Infinity, bestMd = path[0].md;
  for(let i = 1; i < path.length; i++){
    const a = path[i-1], b = path[i];
    const dn = b.north - a.north, de = b.east - a.east, dv = b.tvd - a.tvd;
    const wn = p.north - a.north, we = p.east - a.east, wv = p.tvd - a.tvd;
    const len2 = dn*dn + de*de + dv*dv;
    let t = len2 > 0 ? (wn*dn + we*de + wv*dv) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = wn - t*dn, y = we - t*de, z = wv - t*dv;
    const d2 = x*x + y*y + z*z;
    if(d2 < best){ best = d2; bestMd = a.md + t * (b.md - a.md); }
  }
  const q = interpAtMD(offset.results, bestMd);
  return { md:bestMd, point:q, distance:Math.hypot(q.north - p.north, q.east - p.east, q.tvd - p.tvd) };
}
function evaluate(design, offset, designMd, p){
  const d = interpAtMD(design, designMd);
  const c = closestOnWell(offset, d);
  const uD = uncertaintyRadius(d.md, d.inc, p), uO = uncertaintyRadius(c.md, c.point.inc, p);
  const start = offset.results[0].md, end = offset.results[offset.results.length - 1].md;
  const limited = (c.md >= end - 0.5 || (start > 0.5 && c.md <= start + 0.5)) && c.distance > 0;
  return { designMD:d.md, offsetMD:c.md, distance:c.distance, uDesign:uD, uOffset:uO,
           sf:separationFactor(c.distance, uD, uO, p), ratio:c.distance / (p.rDesign + p.rOffset),
           atOffsetEnd:limited, design:d, offset:c.point, minimum:false };
}
function goldenMinimum(f, lo, hi){
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for(let i = 0; i < 28; i++){
    if(fc.v < fd.v){ b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return fc.v < fd.v ? fc.rec : fd.rec;
}

/* Scans the design well against one offset: regular points along the design well (plus its
   stations), then every local minimum of distance and of SF refined between those points. */
function scanOffset(design, offset, p){
  if(!design || design.length < 2 || !offset || offset.results.length < 2) return [];
  const mds = densify(design, DESIGN_STEP).map(r => r.md);
  const records = mds.map(md => evaluate(design, offset, md, p));
  const extra = [];
  ['distance', 'sf'].forEach(key => {
    for(let i = 0; i < records.length; i++){
      const here = records[i][key], before = i > 0 ? records[i-1][key] : Infinity, after = i < records.length - 1 ? records[i+1][key] : Infinity;
      if(!(here <= before && here < after)) continue;
      const lo = mds[Math.max(0, i - 1)], hi = mds[Math.min(mds.length - 1, i + 1)];
      const found = goldenMinimum(md => { const rec = evaluate(design, offset, md, p); return { v:rec[key], rec }; }, lo, hi);
      const best = found[key] < here ? found : records[i];
      best.minimum = true;
      if(best !== records[i]) extra.push(best);
    }
  });
  const all = records.concat(extra).sort((a, b) => a.designMD - b.designMD);
  const out = [];
  all.forEach(r => {
    const last = out[out.length - 1];
    if(last && Math.abs(last.designMD - r.designMD) < 0.01){
      if(r.sf < last.sf || r.distance < last.distance){ r.minimum = r.minimum || last.minimum; out[out.length - 1] = r; }
      else last.minimum = last.minimum || r.minimum;
    } else out.push(r);
  });
  return out;
}

/* ===== SUMMARIES ===== */
const minBy = (list, key) => list.reduce((a, b) => b[key] < a[key] ? b : a);

/* Continuous design-MD intervals where SF is below the warning threshold. */
function alertIntervals(records, p){
  const out = [];
  let run = null;
  records.forEach(r => {
    if(r.sf < p.warn){
      if(!run) run = { from:r.designMD, to:r.designMD, worst:r, closest:r };
      run.to = r.designMD;
      if(r.sf < run.worst.sf) run.worst = r;
      if(r.distance < run.closest.distance) run.closest = r;
    } else if(run){ out.push(run); run = null; }
  });
  if(run) out.push(run);
  return out.map(a => ({ ...a, status:sfStatus(a.worst.sf, p) }));
}
function summarizeOffset(records, p){
  if(!records.length) return null;
  const minSF = minBy(records, 'sf'), minDist = minBy(records, 'distance');
  return { minSF, minDist, status:sfStatus(minSF.sf, p), alerts:alertIntervals(records, p),
           endLimited:minDist.atOffsetEnd || minSF.atOffsetEnd };
}
/* Records to list: every design station, a regular MD step, and all refined minima. */
function tableRecords(records, stepM, stationMds){
  if(!records.length) return [];
  const wanted = new Set();
  const nearest = md => {
    let lo = 0, hi = records.length - 1;
    while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(records[mid].designMD < md) lo = mid; else hi = mid; }
    return Math.abs(records[lo].designMD - md) <= Math.abs(records[hi].designMD - md) ? lo : hi;
  };
  const exact = md => {
    const i = nearest(md);
    return Math.abs(records[i].designMD - md) < 0.01 ? records[i] : null;
  };
  (stationMds || []).forEach(md => { const r = exact(md); if(r) wanted.add(r); });
  if(stepM > 0){
    const start = records[0].designMD, end = records[records.length - 1].designMD;
    for(let k = Math.ceil(start / stepM - 1e-9); k * stepM <= end + 1e-6; k++) wanted.add(records[nearest(k * stepM)]);
  }
  /* the refined minima that matter: the overall worst and the worst of each alert interval */
  wanted.add(minBy(records, 'sf')); wanted.add(minBy(records, 'distance'));
  records.filter(r => r.minimum).forEach(r => wanted.add(r));
  wanted.add(records[records.length - 1]);
  return [...wanted].sort((a, b) => a.designMD - b.designMD);
}

/* ===== TRAVELLING CYLINDER =====
   Direction of the offset point seen from the design point, in the plane across the design
   well. angle: clockwise from the reference (grid north or high side), radius: distance. */
function travellerPoint(rec, reference){
  const t = tangent(rec.design.inc, rec.design.azi);
  const v = [rec.offset.north - rec.design.north, rec.offset.east - rec.design.east, rec.offset.tvd - rec.design.tvd];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const across = a => { const k = dot(a, t); return [a[0] - k*t[0], a[1] - k*t[1], a[2] - k*t[2]]; };
  const unit = a => { const n = Math.hypot(a[0], a[1], a[2]); return n > 1e-9 ? [a[0]/n, a[1]/n, a[2]/n] : null; };
  let up = reference === 'highside' ? unit(across([0, 0, -1])) : null;      // vertical hole has no high side
  if(!up) up = unit(across([1, 0, 0])) || unit(across([0, 0, -1]));          // grid north
  const right = [t[1]*up[2] - t[2]*up[1], t[2]*up[0] - t[0]*up[2], t[0]*up[1] - t[1]*up[0]];
  return { angle:normAz(Math.atan2(dot(v, right), dot(v, up)) * RAD), radius:rec.distance };
}

/* ===== J-PROFILE DESIGNER ===== */
function jProfile({ kop, rate, inc, azi, td }){
  if(![kop, rate, inc, azi, td].every(Number.isFinite)) return { error:'Fill in every designer field.' };
  if(kop < 0) return { error:'Kick-off depth cannot be negative.' };
  if(!(td > kop)) return { error:'Total depth must be deeper than the kick-off depth.' };
  if(!(rate > 0)) return { error:'Build rate must be greater than zero.' };
  if(!(inc >= 0 && inc <= 120)) return { error:'Target inclination must be between 0 and 120 deg.' };
  const eob = kop + inc / rate * 30;
  const marks = new Set([0, kop, Math.min(eob, td), td]);
  for(let md = 30; md < td; md += 30) marks.add(md);
  const stations = [...marks].sort((a, b) => a - b).filter((md, i, all) => i === 0 || md - all[i-1] > 0.001)
    .map(md => ({ md, inc: md <= kop ? 0 : Math.min(inc, (md - kop) * rate / 30), azi:normAz(azi) }));
  return { stations, reached:eob <= td + 1e-6 };
}
/* Starting values for the designer, read from a loaded survey. */
function estimateJ(stations){
  const maxInc = Math.max(...stations.map(s => s.inc));
  let first = stations.findIndex(s => s.inc > 0.5);
  const kop = first > 0 ? stations[first - 1].md : 0;
  const inclined = stations.filter(s => s.inc > 2);
  const x = inclined.reduce((a, s) => a + Math.cos(s.azi * DEG), 0), y = inclined.reduce((a, s) => a + Math.sin(s.azi * DEG), 0);
  const azi = inclined.length ? normAz(Math.atan2(y, x) * RAD) : 0;
  let rate = 3;
  const top = stations.find(s => s.inc >= maxInc - 0.5);
  if(top && top.md > kop && maxInc > 0.5) rate = top.inc / (top.md - kop) * 30;
  return { kop, rate:Math.max(0.1, +rate.toFixed(2)), inc:+maxInc.toFixed(2), azi:+azi.toFixed(2), td:stations[stations.length - 1].md };
}
