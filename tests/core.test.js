// Unit tests for the survey and anti-collision calculations. Run with:  node --test tests/core.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { console };
vm.createContext(context);
const source = ['mincurve', 'parsers', 'collision'].map(n => fs.readFileSync(path.join(__dirname, '..', 'js', n + '.js'), 'utf8')).join('\n;\n');
vm.runInContext(source + `\n;globalThis.W = { DEG, UNITS, toLen, fromLen, calcMC, interpAtMD, computeWell, densify, detectSurveyColumns, extractSurvey, sampleData,
    degreeLengths, surfaceOffset, latLonFromOffset, placeWell, uncertaintyRadius, separationFactor, sfStatus, prepareOffset, closestOnWell, evaluate,
    scanOffset, alertIntervals, summarizeOffset, tableRecords, travellerPoint, jProfile, estimateJ };`, context);
const W = context.W;

const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const plain = v => JSON.parse(JSON.stringify(v));
const st = (md, inc, azi) => ({ md, inc, azi });
const well = (stations, north = 0, east = 0, up = 0) => W.placeWell(W.calcMC(stations), { north, east, up });
const P = (extra = {}) => ({ rDesign:0.15, rOffset:0.15, useUncertainty:false, depthFactor:0.0035, incError:0.2, aziError:0.5, sigma:1, warn:1.5, crit:1, ...extra });
const scan = (design, offset, p = P()) => W.scanOffset(design, W.prepareOffset(offset), p);
const lowest = (list, k) => list.reduce((a, b) => b[k] < a[k] ? b : a);

test('parallel vertical wells keep their spacing at every depth', () => {
    const r = scan(well([st(0, 0, 0), st(1000, 0, 0)]), well([st(0, 0, 0), st(1500, 0, 0)], 30, 40));
    r.forEach(x => { near(x.distance, 50, 1e-9); near(x.offsetMD, x.designMD, 1e-6); near(x.sf, 50 / 0.3, 1e-6); });
});

test('wells that cross between survey stations are found (the v1 defect)', () => {
    const design = well([st(0, 0, 90), st(500, 0, 90), st(600, 30, 90), st(1000, 30, 90)]);
    const offset = well([st(0, 0, 90), st(1000, 0, 90)], 0, 100);      // two stations only
    const min = lowest(scan(design, offset), 'distance');
    assert.ok(min.distance < 0.05, `closest distance ${min.distance}`);
    assert.strictEqual(W.sfStatus(min.sf, P()), 'critical');
});

test('crossing point is refined between the design evaluation points', () => {
    // a horizontal design well passing 2 m east of a vertical well at an awkward depth
    const design = well([st(0, 90, 0), st(1000, 90, 0)]);
    const offset = W.placeWell(W.calcMC([st(0, 0, 0), st(100, 0, 0)]), { north:502.3, east:2, up:50 });
    const min = lowest(scan(design, offset), 'distance');
    near(min.distance, 2, 1e-4); near(min.designMD, 502.3, 0.05); near(min.offsetMD, 50, 0.05);
});

test('closest approach to a curved offset matches brute force', () => {
    const design = well([st(0, 0, 45), st(500, 0, 45), st(950, 45, 45), st(2800, 45, 45)]);
    const offset = well([st(0, 0, 0), st(300, 0, 200), st(900, 40, 250), st(2400, 40, 260)], 700, 900);
    const min = lowest(scan(design, offset), 'distance');
    const a = W.densify(design, 1), b = W.densify(offset, 1);
    let brute = Infinity;
    a.forEach(p => b.forEach(q => { brute = Math.min(brute, Math.hypot(p.north - q.north, p.east - q.east, p.tvd - q.tvd)); }));
    assert.ok(min.distance <= brute + 1e-3 && min.distance > brute - 1, `scan ${min.distance}, brute ${brute}`);
});

test('both hole radii enter the separation factor', () => {
    const a = well([st(0, 0, 0), st(1000, 0, 0)]), b = well([st(0, 0, 0), st(1000, 0, 0)], 0, 1);
    near(scan(a, b, P({ rDesign:0.15 }))[10].sf, 1 / 0.3, 1e-9);
    near(scan(a, b, P({ rDesign:0.85 }))[10].sf, 1, 1e-9);
});

test('the uncertainty model drives the separation factor and status', () => {
    const a = well([st(0, 0, 0), st(1000, 0, 0)]), b = well([st(0, 0, 0), st(1000, 0, 0)], 0, 1);
    const on = P({ useUncertainty:true }), rec = scan(a, b, on).at(-1);
    const u = Math.hypot(0.0035 * 1000, 0.2 * W.DEG * 1000);
    near(rec.uDesign, u, 1e-9); near(rec.sf, 1 / (0.3 + 2 * u), 1e-9); near(rec.ratio, 1 / 0.3, 1e-9);
    assert.strictEqual(W.sfStatus(rec.sf, on), 'critical');
    near(W.separationFactor(10, u, u, P({ useUncertainty:true, sigma:2 })), 10 / (0.3 + 4 * u), 1e-9);
});

test('surface positions and elevation place wells in one frame', () => {
    const ref = { lat:30.45, lon:5.82 };
    const ll = W.latLonFromOffset(ref, 520, 482), back = W.surfaceOffset(ll, ref);
    near(back.north, 520, 0.01); near(back.east, 482, 0.01);
    near(W.degreeLengths(0).lat, 110574, 2); near(W.degreeLengths(0).lon, 111319, 2);
    const higher = well([st(0, 0, 0), st(100, 0, 0)], 0, 0, 25);
    near(higher[1].tvd, 75);
});

test('alert intervals, offset summary and table rows', () => {
    const design = well([st(0, 90, 0), st(1000, 90, 0)]);
    const offset = W.placeWell(W.calcMC([st(0, 0, 0), st(100, 0, 0)]), { north:500, east:0.2, up:50 });
    const p = P({ rDesign:1, rOffset:1, warn:5, crit:2 });
    const records = scan(design, offset, p), s = W.summarizeOffset(records, p);
    assert.strictEqual(s.status, 'critical');
    assert.strictEqual(s.alerts.length, 1);
    near(s.alerts[0].from, 490, 5.01); near(s.alerts[0].to, 510, 5.01);
    const rows = W.tableRecords(records, 100, [0, 1000]);
    assert.ok(rows.includes(s.minSF) && rows.includes(s.minDist), 'worst points listed');
    assert.ok(rows.length < records.length / 5);
    assert.deepStrictEqual(plain(rows.filter((r, i) => i && r.designMD <= rows[i-1].designMD)), []);
});

test('a closest point at the end of the offset survey is flagged', () => {
    const design = well([st(0, 0, 0), st(1000, 0, 0)]), short = well([st(0, 0, 0), st(200, 0, 0)], 0, 20);
    const r = scan(design, short);
    assert.ok(r.at(-1).atOffsetEnd);
    assert.ok(!r[5].atOffsetEnd);
});

test('travelling cylinder angles: north reference and high side', () => {
    const design = { inc:0, azi:0, north:0, east:0, tvd:100 };
    const at = (north, east, tvd, d, ref) => W.travellerPoint({ design:d, offset:{ north, east, tvd }, distance:10 }, ref).angle;
    near(at(10, 0, 100, design, 'north'), 0, 1e-6); near(at(0, 10, 100, design, 'north'), 90, 1e-6); near(at(0, -10, 100, design, 'north'), 270, 1e-6);
    const heading = { inc:90, azi:0, north:0, east:0, tvd:100 };          // horizontal, going north
    near(at(0, 0, 90, heading, 'highside'), 0, 1e-6);                      // above
    near(at(0, 10, 100, heading, 'highside'), 90, 1e-6);                   // right
    near(at(0, 0, 110, heading, 'highside'), 180, 1e-6);                   // below
    const east = { inc:90, azi:90, north:0, east:0, tvd:100 };
    near(at(-10, 0, 100, east, 'highside'), 90, 1e-6);                     // south is on the right when heading east
});

test('J profile accepts zero kick-off and azimuth and rejects impossible input', () => {
    const j = W.jProfile({ kop:0, rate:3, inc:30, azi:0, td:900 });
    const r = W.calcMC(j.stations);
    assert.strictEqual(r[0].md, 0); near(r.at(-1).east, 0, 1e-9); near(r.at(-1).inc, 30);
    assert.ok(W.jProfile({ kop:500, rate:3, inc:45, azi:0, td:300 }).error);
    assert.ok(W.jProfile({ kop:500, rate:0, inc:45, azi:0, td:900 }).error);
    assert.strictEqual(W.jProfile({ kop:500, rate:1, inc:90, azi:0, td:900 }).reached, false);
    const est = W.estimateJ(W.sampleData()[0].stations);
    near(est.kop, 500); near(est.inc, 45); near(est.azi, 45); near(est.td, 2800); near(est.rate, 3, 0.01);
});

test('blank cells are skipped, not read as zero', () => {
    const rows = [['MD', 'INC', 'AZI'], [0, 0, 0], [500, '', ''], [600, 5, ''], [700, 6, 45]];
    const r = W.extractSurvey(rows, 0, { md:0, inc:1, azi:2 }, 'm');
    assert.deepStrictEqual(plain(r.stations.map(s => s.md)), [0, 700]);
    assert.strictEqual(r.skipped.length, 2);
});

test('a survey starting below surface is not placed at TVD 0', () => {
    const r = W.computeWell([st(2000, 0, 0), st(2030, 0, 0)], { mode:'vertical' });
    near(r.results.find(x => x.md === 2000).tvd, 2000);
});

test('sample files match the built-in sample data', () => {
    for (const w of W.sampleData()) {
        const text = fs.readFileSync(path.join(__dirname, '..', 'sample-data', w.name + '.csv'), 'utf8').trim().split(/\r?\n/);
        const rows = text.map(l => l.split(','));
        const d = W.detectSurveyColumns(rows), r = W.extractSurvey(rows, d.headerRow, d.cols, 'm');
        assert.deepStrictEqual(plain(r.stations.map(s => [s.md, s.inc, s.azi])), plain(w.stations.map(s => [s.md, s.inc, s.azi])), w.name);
    }
});
