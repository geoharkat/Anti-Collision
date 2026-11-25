/* =============================================================
   Anti-Collision Analyst — mincurve.js
   Pure survey calculations (no DOM): units, minimum curvature,
   arc interpolation, tie-in, statistics.
   Internal units are always metres and degrees per 30 m.
   ============================================================= */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const M_PER_FT = 0.3048;
const VERTICAL_INC = 0.5;        // deg: below this a heading is not meaningful
const MD_TOL = 1e-6;

/* ===== UNITS ===== */
const UNITS = {
  m:  { key:'m',  len:'m',  lenFactor:1,            dls:'deg/30m',   dlsFactor:1,                    cropAbove:50,
        radius:'m',  radiusFactor:1,                 tableSteps:[10,30,50,100], defaultStep:30 },
  ft: { key:'ft', len:'ft', lenFactor:1 / M_PER_FT, dls:'deg/100ft', dlsFactor:(100 * M_PER_FT) / 30, cropAbove:150 * M_PER_FT,
        radius:'in', radiusFactor:12 / M_PER_FT,     tableSteps:[30,100,200,500], defaultStep:100 }
};
const toLen   = (m, u) => m * UNITS[u].lenFactor;
const fromLen = (v, u) => v / UNITS[u].lenFactor;
const toDls   = (d, u) => d * UNITS[u].dlsFactor;

/* ===== ANGLES ===== */
function normAz(a){ const r = ((a % 360) + 360) % 360; return r > 360 - 1e-9 ? 0 : r; }
function shortestTurn(from, to){ let d = normAz(to) - normAz(from); if(d > 180) d -= 360; if(d <= -180) d += 360; return d; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ===== VECTOR HELPERS (north, east, down) ===== */
function tangent(inc, azi){
  const i = inc * DEG, a = azi * DEG;
  return [Math.sin(i) * Math.cos(a), Math.sin(i) * Math.sin(a), Math.cos(i)];
}
function doglegAngle(t1, t2){
  const dot = clamp(t1[0]*t2[0] + t1[1]*t2[1] + t1[2]*t2[2], -1, 1);
  const cx = t1[1]*t2[2] - t1[2]*t2[1], cy = t1[2]*t2[0] - t1[0]*t2[2], cz = t1[0]*t2[1] - t1[1]*t2[0];
  return Math.atan2(Math.hypot(cx, cy, cz), dot);                 // stable for very small angles
}
const ratioFactor = dl => dl > 1e-8 ? (2 / dl) * Math.tan(dl / 2) : 1;

function withDerived(p, vsAz){
  p.vs = p.north * Math.cos(vsAz * DEG) + p.east * Math.sin(vsAz * DEG);
  p.closure = Math.hypot(p.north, p.east);
  p.closureAzi = p.closure > 1e-6 ? normAz(Math.atan2(p.east, p.north) * RAD) : 0;
  return p;
}

/* ===== MINIMUM CURVATURE over a station list (sorted by MD) ===== */
function calcMC(stations, vsAz = 0, origin = null){
  if(!stations || !stations.length) return [];
  const o = origin || { tvd:0, north:0, east:0 };
  const res = [withDerived({ ...stations[0], tvd:o.tvd, north:o.north, east:o.east, dls:0, dogleg:0 }, vsAz)];
  for(let i = 1; i < stations.length; i++){
    const prev = res[res.length - 1], cur = stations[i];
    const dmd = cur.md - prev.md;
    if(!(dmd > MD_TOL)) continue;
    const t1 = tangent(prev.inc, prev.azi), t2 = tangent(cur.inc, cur.azi);
    const dl = doglegAngle(t1, t2), k = dmd / 2 * ratioFactor(dl);
    res.push(withDerived({ ...cur,
      north: prev.north + k * (t1[0] + t2[0]),
      east:  prev.east  + k * (t1[1] + t2[1]),
      tvd:   prev.tvd   + k * (t1[2] + t2[2]),
      dogleg: dl * RAD, dls: dl * RAD / dmd * 30 }, vsAz));
  }
  return res;
}

/* ===== INTERPOLATION along the minimum-curvature arc.
   Returns null outside the surveyed interval: nothing is extrapolated. ===== */
function interpAtMD(results, md, vsAz = 0){
  if(!results || !results.length) return null;
  const n = results.length;
  if(md < results[0].md - 1e-4 || md > results[n-1].md + 1e-4) return null;
  if(md <= results[0].md)   return withDerived({ ...results[0] }, vsAz);
  if(md >= results[n-1].md) return withDerived({ ...results[n-1] }, vsAz);
  let lo = 0, hi = n - 1;
  while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(results[mid].md < md) lo = mid; else hi = mid; }
  const a = results[lo], b = results[hi];
  const f = (md - a.md) / (b.md - a.md);
  const t1 = tangent(a.inc, a.azi), t2 = tangent(b.inc, b.azi);
  const dl = doglegAngle(t1, t2);
  let t = t2;
  if(dl > 1e-8){
    const w1 = Math.sin((1 - f) * dl) / Math.sin(dl), w2 = Math.sin(f * dl) / Math.sin(dl);
    t = [0, 1, 2].map(k => w1 * t1[k] + w2 * t2[k]);
  }
  const len = Math.hypot(t[0], t[1], t[2]);
  t = t.map(v => v / len);
  const k = (md - a.md) / 2 * ratioFactor(dl * f);
  const horiz = Math.hypot(t[0], t[1]);
  return withDerived({ md,
    inc: Math.atan2(horiz, t[2]) * RAD,
    azi: horiz > 1e-7 ? normAz(Math.atan2(t[1], t[0]) * RAD) : b.azi,
    dls: b.dls, dogleg: b.dogleg * f,
    north: a.north + k * (t1[0] + t[0]),
    east:  a.east  + k * (t1[1] + t[1]),
    tvd:   a.tvd   + k * (t1[2] + t[2]) }, vsAz);
}

/* First measured depth at which fn(point) reaches zero or changes sign. */
function firstCrossing(results, fn){
  if(!results || results.length < 2) return null;
  const TOL = 1e-6;
  let a = results[0], fa = fn(a);
  for(let i = 1; i < results.length; i++){
    const b = results[i], fb = fn(b);
    if(Math.abs(fa) <= TOL) return a.md;
    if(fa * fb < 0){
      let lo = a.md, hi = b.md;
      for(let k = 0; k < 60; k++){
        const mid = (lo + hi) / 2;
        if(fn(interpAtMD(results, mid)) * fa > 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    a = b; fa = fb;
  }
  return Math.abs(fa) <= TOL ? a.md : null;
}
/* VS is recomputed from N/E so the search does not depend on cached values. */
function interpAtTVD(results, tvd, vsAz = 0){
  const md = firstCrossing(results, p => p.tvd - tvd);
  return md === null ? null : interpAtMD(results, md, vsAz);
}
function interpAtVS(results, vs, vsAz = 0){
  const md = firstCrossing(results, p => p.north * Math.cos(vsAz * DEG) + p.east * Math.sin(vsAz * DEG) - vs);
  return md === null ? null : interpAtMD(results, md, vsAz);
}

/* Densified path for drawing, hover and closest-distance search. */
function densify(results, spacing, vsAz = 0){
  const out = [];
  for(let i = 0; i < results.length; i++){
    if(i > 0){
      const a = results[i-1], b = results[i];
      const n = Math.ceil((b.md - a.md) / spacing);
      for(let j = 1; j < n; j++) out.push(interpAtMD(results, a.md + (b.md - a.md) * j / n, vsAz));
    }
    out.push(results[i]);
  }
  return out;
}

/* ===== TIE-IN =====
   tie.mode: 'vertical' (assume a vertical station at MD 0), 'values' (given position of the
   first station) or 'plan' (position of the plan at the first station's MD).             */
function computeWell(stations, tie, vsAz = 0, planResults = null){
  const warnings = [];
  if(!stations || !stations.length) return { results:[], warnings };
  let list = stations.map(s => ({ md:s.md, inc:s.inc, azi:normAz(s.azi), manual:!!s.manual }));
  let origin = null;
  if(list[0].md > MD_TOL){
    const mode = (tie && tie.mode) || 'vertical';
    if(mode === 'values') origin = { tvd:tie.tvd, north:tie.north, east:tie.east };
    else if(mode === 'plan'){
      const p = planResults && interpAtMD(planResults, list[0].md);
      if(p) origin = { tvd:p.tvd, north:p.north, east:p.east };
      else warnings.push('The plan does not cover the first station, so it cannot be used as the tie-in.');
    }
    if(!origin){
      list.unshift({ md:0, inc:0, azi:list[0].azi, assumed:true });
      warnings.push('The first station is below surface with no tie-in: a vertical station at MD 0 is assumed.');
    }
  }
  return { results:calcMC(list, vsAz, origin), warnings };
}

/* ===== TRAJECTORY STATISTICS ===== */
function trajectoryStats(results){
  if(!results || results.length < 2) return null;
  const last = results[results.length - 1];
  const s = { startMD:results[0].md, startTVD:results[0].tvd, endMD:last.md, endTVD:last.tvd, endN:last.north, endE:last.east,
    endVS:last.vs, endClosure:last.closure, endClosureAzi:last.closureAzi,
    maxInc:0, maxIncMD:results[0].md, maxDLS:0, maxDLSMD:results[0].md, kickoffMD:null, kickoffTVD:null, landingMD:null, landingTVD:null };
  let md = 0, weighted = 0;
  results.forEach((r, i) => {
    if(r.inc > s.maxInc){ s.maxInc = r.inc; s.maxIncMD = r.md; }
    if(r.dls > s.maxDLS){ s.maxDLS = r.dls; s.maxDLSMD = r.md; }
    if(s.kickoffMD === null && r.inc > 2){ s.kickoffMD = r.md; s.kickoffTVD = r.tvd; }
    if(s.landingMD === null && r.inc >= 85){ s.landingMD = r.md; s.landingTVD = r.tvd; }
    if(i > 0){ const d = r.md - results[i-1].md; md += d; weighted += r.dls * d; }
  });
  s.avgDLS = md > 0 ? weighted / md : 0;
  return s;
}
