/* =============================================================
   Anti-Collision Analyst — plots.js
   D3 (SVG) charts: separation factor, distance, travelling
   cylinder, plan view, vertical section and 3D view. Every chart
   uses presentation attributes only, so the same code feeds the
   screen, the PNG / SVG downloads and the PDF.
   ============================================================= */
const Charts = (() => {
    'use strict';

    const INK = { text:'#1e293b', muted:'#64748b', grid:'#e8edf3', axis:'#c2ccd8',
                  surface:'#ffffff', wall:'#f7f9fc', path:'#0f172a', ref:'#94a3b8', accent:'#0d9488' };
    const SCREEN_FONT = 'Helvetica, Arial, sans-serif';
    let clipSeq = 0;

    /* ---------------- helpers ---------------- */
    const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits:d, minimumFractionDigits:d });
    const tickFmt = ticks => {
        const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
        const d = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));
        return v => fmt(v, d);
    };
    const measureCtx = document.createElement('canvas').getContext('2d');
    const textWidth = (s, size, bold) => {
        measureCtx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
        return measureCtx.measureText(s).width;
    };

    function base(node, o) {
        const svg = d3.select(node);
        svg.selectAll('*').remove();
        svg.attr('xmlns', 'http://www.w3.org/2000/svg').attr('width', o.width).attr('height', o.height)
           .attr('viewBox', `0 0 ${o.width} ${o.height}`).attr('font-family', o.font || SCREEN_FONT)
           .attr('font-weight', 'normal').attr('font-style', 'normal');
        const root = svg.append('g').attr('pointer-events', 'none');
        root.append('rect').attr('width', o.width).attr('height', o.height).attr('fill', INK.surface);
        return root;
    }
    function text(g, o, x, y, s, attrs = {}) {
        const t = g.append('text').attr('x', x).attr('y', y).attr('fill', attrs.fill || INK.text)
            .attr('font-size', attrs.size || 11).attr('font-weight', attrs.bold ? 'bold' : 'normal').text(o.text ? o.text(s) : s);
        if (attrs.anchor) t.attr('text-anchor', attrs.anchor);
        if (attrs.rotate !== undefined) t.attr('transform', `rotate(${attrs.rotate},${x},${y})`);
        return t;
    }
    function line(g, x1, y1, x2, y2, color, w = 1, dash) {
        const l = g.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
            .attr('stroke', color).attr('stroke-width', w);
        if (dash) l.attr('stroke-dasharray', dash);
        return l;
    }
    const pathD = pts => pts.length ? 'M' + pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L') : '';
    function stroke(g, pts, color, w, opacity) {
        const p = g.append('path').attr('d', pathD(pts)).attr('fill', 'none').attr('stroke', color)
            .attr('stroke-width', w).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
        if (opacity !== undefined) p.attr('stroke-opacity', opacity);
        return p;
    }
    function clip(g, x, y, w, h) {
        const id = `wpclip${++clipSeq}_${Math.random().toString(36).slice(2, 7)}`;
        g.append('defs').append('clipPath').attr('id', id).append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h);
        return g.append('g').attr('clip-path', `url(#${id})`);
    }
    function symbol(g, type, x, y, size, fill, strokeColor = INK.surface, sw = 1.6) {
        g.append('path').attr('d', d3.symbol(type, size)()).attr('transform', `translate(${x},${y})`)
            .attr('fill', fill).attr('stroke', strokeColor).attr('stroke-width', sw);
    }

    /* Legend rows below the plot; returns the height used. */
    function legendLayout(items, width, o) {
        let x = 0, row = 0;
        const placed = items.map(it => {
            const w = 24 + textWidth(o.text ? o.text(it.label) : it.label, 10.5) + 14;
            if (x + w > width && x > 0) { x = 0; row++; }
            const out = { ...it, x, row };
            x += w;
            return out;
        });
        return { placed, height: items.length ? (row + 1) * 16 + 4 : 0 };
    }
    function drawLegend(g, o, layout, x0, y0) {
        layout.placed.forEach(it => {
            const x = x0 + it.x, y = y0 + it.row * 16;
            if (it.type === 'line' || it.type === 'dash')
                line(g, x, y, x + 18, y, it.color, it.type === 'line' ? 2.5 : 1.2, it.type === 'dash' ? '3,3' : null);
            else symbol(g, it.type === 'star' ? d3.symbolStar : d3.symbolDiamond, x + 9, y, 55, it.color);
            text(g, o, x + 24, y + 3.5, it.label, { size:10.5, fill:INK.muted });
        });
    }

    /* Greedy label placement: avoids other labels, the well path and the plot edges. */
    function placeLabels(g, o, items, bounds, obstacles, reserved = []) {
        const boxes = [...reserved];
        const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                                  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        items.filter(it => it.x >= bounds.x - 1 && it.x <= bounds.x + bounds.w + 1 &&
                           it.y >= bounds.y - 1 && it.y <= bounds.y + bounds.h + 1)
             .forEach(it => {
            const rows = it.lines.map(s => o.text ? o.text(s) : s);
            const w = Math.max(...rows.map((s, i) => textWidth(s, 10, i === 0))) + 12;
            const h = rows.length * 12 + 6;
            let best = null;
            [12, 26, 44, 68, 96].forEach(dist => [-30, -150, 30, 150, -75, 105, 0, 180].forEach(deg => {
                const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
                const cx = it.x + c * dist, cy = it.y + s * dist;
                const box = { x: c > 0.3 ? cx : c < -0.3 ? cx - w : cx - w / 2,
                              y: s < -0.3 ? cy - h : s > 0.3 ? cy : cy - h / 2, w, h };
                let cost = dist * 2 + (w * h - overlap(box, bounds)) * 20;
                boxes.forEach(b => { cost += overlap(box, { x:b.x - 2, y:b.y - 2, w:b.w + 4, h:b.h + 4 }) * 12; });
                obstacles.forEach(p => {
                    if (p[0] > box.x - 3 && p[0] < box.x + w + 3 && p[1] > box.y - 3 && p[1] < box.y + h + 3) cost += 45;
                });
                if (!best || cost < best.cost) best = { ...box, cost };
            }));
            boxes.push(best);
            const ex = Math.max(best.x, Math.min(it.x, best.x + best.w));
            const ey = Math.max(best.y, Math.min(it.y, best.y + best.h));
            line(g, it.x, it.y, ex, ey, it.color, 1);
            g.append('rect').attr('x', best.x).attr('y', best.y).attr('width', best.w).attr('height', best.h)
                .attr('rx', 3).attr('fill', '#ffffff').attr('fill-opacity', 0.94).attr('stroke', it.color).attr('stroke-width', 1);
            rows.forEach((s, i) => text(g, { }, best.x + 6, best.y + 12.5 + i * 12, s,
                { size:10, bold:i === 0, fill:i === 0 ? INK.text : INK.muted }));
        });
    }

    /* ---------------- tooltip ---------------- */
    let tipEl = null;
    function showTip(ev, title, rows) {
        if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
        tipEl.textContent = '';
        const h = document.createElement('div'); h.className = 'chart-tip-title'; h.textContent = title; tipEl.appendChild(h);
        rows.forEach(([k, v]) => {
            const r = document.createElement('div'); r.className = 'chart-tip-row';
            const a = document.createElement('span'); a.textContent = k;
            const b = document.createElement('b'); b.textContent = v;
            r.append(a, b); tipEl.appendChild(r);
        });
        tipEl.style.display = 'block';
        const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
        let x = ev.clientX + 14, y = ev.clientY + 14;
        if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
        if (y + hh > window.innerHeight - 8) y = ev.clientY - hh - 14;
        tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    }
    const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };

    /* ---------------- shared pieces ---------------- */
    const lenText = (m, v, d = 1) => `${fmt(toLen(v, m.units), d)} ${UNITS[m.units].len}`;
    const sfText = v => fmtSF(v);
    function stationRows(m, p) {
        const L = v => lenText(m, v);
        return [['MD', L(p.md)], ['TVD', L(p.tvd)], ['Inclination', `${fmt(p.inc, 2)}°`], ['Azimuth', `${fmt(p.azi, 2)}°`],
            ['DLS', `${fmt(toDls(p.dls, m.units), 2)} ${UNITS[m.units].dls}`], ['North', L(p.north)], ['East', L(p.east)]];
    }
    function bindPathHover(node, m, pts) {
        const svg = d3.select(node);
        svg.on('pointermove.tip', ev => {
            if (ev.buttons) { hideTip(); return; }
            const [mx, my] = d3.pointer(ev, node);
            let best = null, bd = 28 * 28;
            pts.forEach(s => { const d = (s[0] - mx) ** 2 + (s[1] - my) ** 2; if (d < bd) { bd = d; best = s; } });
            svg.select('.hover-dot').remove();
            if (!best) { hideTip(); return; }
            svg.append('circle').attr('class', 'hover-dot').attr('pointer-events', 'none').attr('cx', best[0]).attr('cy', best[1])
               .attr('r', 5).attr('fill', best[3].color).attr('stroke', '#fff').attr('stroke-width', 2);
            showTip(ev, best[3].label, stationRows(m, best[2]));
        }).on('pointerleave.tip', () => { hideTip(); svg.select('.hover-dot').remove(); });
    }
    const wellLegend = m => m.wells.map(w => ({ type:'line', color:w.color, label:w.label + (w.design ? ' (design)' : '') }));
    const allDense = m => m.wells.flatMap(w => w.dense);
    function drawWell(g, w, toPx) {
        const pts = w.dense.map(p => [...toPx(p), p, w]);
        stroke(g, pts, w.color, w.design ? 3.4 : 2);
        return pts;
    }
    /* Line between the design point and the offset point at each offset's lowest SF. */
    function drawApproaches(g, m, toPx, items) {
        m.offsets.forEach(o => {
            const r = o.summary.minSF, a = toPx(r.design), b = toPx(r.offset), color = STATUS_COLORS[o.summary.status];
            line(g, a[0], a[1], b[0], b[1], color, 2, '5,3');
            [a, b].forEach(p => symbol(g, d3.symbolCircle, p[0], p[1], 55, color));
            items.push({ x:(a[0] + b[0]) / 2, y:(a[1] + b[1]) / 2, color, point:r.design,
                lines:[`${o.label}: SF ${sfText(r.sf)}`, `${lenText(m, r.distance)} at MD ${lenText(m, r.designMD, 0)}`] });
        });
    }
    const approachLegend = m => m.offsets.length ? [{ type:'dash', color:INK.muted, label:'Lowest-SF approach (colour = status)' }] : [];

    /* ---------------- zoom: drag pans, Ctrl+scroll zooms, Shift+drag zooms to a box ---------------- */
    function bindZoom(node) {
        if (node.__zoom_bound) return;
        const zoom = d3.zoom().scaleExtent([0.5, 200])
            .filter(ev => ev.type === 'wheel' ? (ev.ctrlKey || ev.metaKey) : (!ev.button && !ev.shiftKey && ev.type !== 'dblclick'))
            .wheelDelta(ev => -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.002) * (Math.abs(ev.deltaY) < 20 ? 5 : 1))
            .on('zoom', ev => { hideTip(); node.__transform = ev.transform; if (node.__redraw) node.__redraw(); });
        d3.select(node).call(zoom).on('dblclick.reset', () => d3.select(node).call(zoom.transform, d3.zoomIdentity));
        node.__zoom_bound = zoom;
        let start = null, band = null;
        node.addEventListener('pointerdown', ev => {
            if (!ev.shiftKey || ev.button || !node.__redraw) return;
            ev.preventDefault();
            start = d3.pointer(ev, node);
            node.setPointerCapture(ev.pointerId);
            hideTip();
            band = d3.select(node).append('rect').attr('pointer-events', 'none').attr('fill', INK.accent).attr('fill-opacity', 0.08)
                .attr('stroke', INK.accent).attr('stroke-dasharray', '4,3');
        });
        node.addEventListener('pointermove', ev => {
            if (!start) return;
            const p = d3.pointer(ev, node);
            band.attr('x', Math.min(start[0], p[0])).attr('y', Math.min(start[1], p[1])).attr('width', Math.abs(p[0] - start[0])).attr('height', Math.abs(p[1] - start[1]));
        });
        const finish = ev => {
            if (!start) return;
            const p = d3.pointer(ev, node), a = start, box = node.__box;
            start = null; band.remove();
            const w = Math.abs(p[0] - a[0]), h = Math.abs(p[1] - a[1]);
            if (w < 10 || h < 10 || !box) return;
            const t = node.__transform || d3.zoomIdentity;
            const centre = t.invert([(a[0] + p[0]) / 2, (a[1] + p[1]) / 2]);
            const k = Math.min(200, t.k * Math.min(box.w / w, box.h / h));
            d3.select(node).call(zoom.transform, d3.zoomIdentity.translate(box.x + box.w / 2 - k * centre[0], box.y + box.h / 2 - k * centre[1]).scale(k));
        };
        node.addEventListener('pointerup', finish);
        node.addEventListener('pointercancel', finish);
    }
    function axes(g, o, x, y, box, xTitle, yTitle) {
        const xt = x.ticks(Math.max(3, Math.floor(box.w / 80))), yt = y.ticks(Math.max(3, Math.floor(box.h / 48)));
        const xf = tickFmt(xt), yf = tickFmt(yt);
        xt.forEach(v => { const px = x(v); line(g, px, box.y, px, box.y + box.h, INK.grid);
            text(g, o, px, box.y + box.h + 14, xf(v), { size:10, fill:INK.muted, anchor:'middle' }); });
        yt.forEach(v => { const py = y(v); line(g, box.x, py, box.x + box.w, py, INK.grid);
            text(g, o, box.x - 6, py + 3.5, yf(v), { size:10, fill:INK.muted, anchor:'end' }); });
        g.append('rect').attr('x', box.x).attr('y', box.y).attr('width', box.w).attr('height', box.h).attr('fill', 'none').attr('stroke', INK.axis);
        text(g, o, box.x + box.w / 2, box.y + box.h + 30, xTitle, { size:11, anchor:'middle' });
        text(g, o, 14, box.y + box.h / 2, yTitle, { size:11, anchor:'middle', rotate:-90 });
    }
    function titleBlock(g, o) {
        if (!o.title) return 10;
        text(g, o, 14, 20, o.title, { size:14, bold:true });
        if (o.subtitle) text(g, o, 14, 35, o.subtitle, { size:10.5, fill:INK.muted });
        return o.subtitle ? 46 : 32;
    }

    /* ---------------- PLAN VIEW ---------------- */
    function plan(node, m, o) {
        const g = base(node, o), U = UNITS[m.units], L = v => toLen(v, m.units);
        const legend = [...wellLegend(m), ...approachLegend(m), { type:'star', color:INK.path, label:'Wellhead' }];
        const top = titleBlock(g, o);
        const ll = legendLayout(legend, o.width - 76, o);
        const box = { x:64, y:top, w:o.width - 80, h:o.height - top - 42 - ll.height };
        const ex = d3.extent(allDense(m), p => L(p.east)), ey = d3.extent(allDense(m), p => L(p.north));
        const minSpan = L(60);
        const spanX = Math.max(minSpan, ex[1] - ex[0]) * 1.25, spanY = Math.max(minSpan, ey[1] - ey[0]) * 1.25;
        const k = Math.min(box.w / spanX, box.h / spanY);
        const cx = (ex[0] + ex[1]) / 2, cy = (ey[0] + ey[1]) / 2;
        let x = d3.scaleLinear([cx - box.w / 2 / k, cx + box.w / 2 / k], [box.x, box.x + box.w]);
        let y = d3.scaleLinear([cy - box.h / 2 / k, cy + box.h / 2 / k], [box.y + box.h, box.y]);
        const t = o.interactive && node.__transform;
        if (t) { x = t.rescaleX(x); y = t.rescaleY(y); }
        axes(g, o, x, y, box, `East of design wellhead (${U.len})`, `North (${U.len})`);
        const inner = clip(g, box.x, box.y, box.w, box.h);
        const toPx = p => [x(L(p.east)), y(L(p.north))];
        const pts = m.wells.flatMap(w => drawWell(inner, w, toPx));
        const items = [];
        drawApproaches(inner, m, toPx, items);
        m.wells.forEach(w => { const h = toPx(w.results[0]); symbol(inner, d3.symbolStar, h[0], h[1], w.design ? 170 : 110, w.color, '#fff', 1.4);
            items.push({ x:h[0], y:h[1], color:w.color, lines:[w.label] }); });
        const nx = box.x + box.w - 18, ny = box.y + 14;
        placeLabels(inner, o, items, box, pts, [{ x:nx - 14, y:ny - 6, w:28, h:44 }]);
        g.append('path').attr('d', `M${nx},${ny}L${nx + 6},${ny + 18}L${nx},${ny + 14}L${nx - 6},${ny + 18}Z`).attr('fill', INK.text);
        text(g, o, nx, ny + 30, 'N', { size:11, bold:true, anchor:'middle' });
        drawLegend(g, o, ll, box.x, box.y + box.h + 46);
        if (o.interactive) { node.__box = box; node.__redraw = () => plan(node, m, o); bindZoom(node); bindPathHover(node, m, pts); }
    }

    /* ---------------- VERTICAL SECTION ---------------- */
    function section(node, m, o) {
        const g = base(node, o), U = UNITS[m.units], L = v => toLen(v, m.units);
        const legend = [...wellLegend(m), ...approachLegend(m)];
        const top = titleBlock(g, o);
        const ll = legendLayout(legend, o.width - 76, o);
        const box = { x:64, y:top, w:o.width - 80, h:o.height - top - 42 - ll.height };
        const [yLo, yHi] = d3.extent(allDense(m), p => L(p.tvd));
        const sectionOf = p => p.north * Math.cos(m.vsAz * Math.PI / 180) + p.east * Math.sin(m.vsAz * Math.PI / 180);
        const ex = d3.extent(allDense(m), p => L(sectionOf(p)));
        const spanY = Math.max(L(60), yHi - yLo) * 1.1, spanX = Math.max(L(60), ex[1] - ex[0]) * 1.2, cx = (ex[0] + ex[1]) / 2;
        let xd = [cx - spanX / 2, cx + spanX / 2], yd = [yLo - spanY * 0.03, yLo + spanY];
        if (m.trueScale) {
            const k = Math.min(box.w / spanX, box.h / spanY);
            xd = [cx - box.w / 2 / k, cx + box.w / 2 / k];
            yd = [yd[0], yd[0] + box.h / k];
        }
        let x = d3.scaleLinear(xd, [box.x, box.x + box.w]), y = d3.scaleLinear(yd, [box.y, box.y + box.h]);
        const t = o.interactive && node.__transform;
        if (t) { x = t.rescaleX(x); y = t.rescaleY(y); }
        axes(g, o, x, y, box, `Vertical section at ${fmt(m.vsAz, 1)}° (${U.len})${m.trueScale ? '   [1:1 scale]' : ''}`, `TVD below design wellhead (${U.len})`);
        const inner = clip(g, box.x, box.y, box.w, box.h);
        const toPx = p => [x(L(sectionOf(p))), y(L(p.tvd))];
        const pts = m.wells.flatMap(w => drawWell(inner, w, toPx));
        const items = [];
        drawApproaches(inner, m, toPx, items);
        m.wells.forEach(w => { const end = w.results[w.results.length - 1], p = toPx(end); symbol(inner, d3.symbolCircle, p[0], p[1], 60, w.color);
            items.push({ x:p[0], y:p[1], color:w.color, lines:[`${w.label} TD`] }); });
        placeLabels(inner, o, items, box, pts);
        drawLegend(g, o, ll, box.x, box.y + box.h + 46);
        if (o.interactive) { node.__box = box; node.__redraw = () => section(node, m, o); bindZoom(node); bindPathHover(node, m, pts); }
    }

    /* ---------------- 3D VIEW (orthographic projection) ---------------- */
    const VIEWS = { iso:{ az:35, el:24, zoom:1 }, top:{ az:0, el:90, zoom:1 }, north:{ az:0, el:0, zoom:1 }, east:{ az:90, el:0, zoom:1 } };
    function view3d(node, m, o) {
        const g = base(node, o), U = UNITS[m.units], L = v => toLen(v, m.units);
        const cam = (o.interactive ? node.__camera : o.camera) || VIEWS.iso;
        if (o.interactive) node.__camera = cam;
        const legend = [...wellLegend(m), { type:'dash', color:INK.ref, label:'Projections' }, ...approachLegend(m)];
        const top = titleBlock(g, o);
        const ll = legendLayout(legend, o.width - 30, o);
        const box = { x:0, y:top, w:o.width, h:o.height - top - ll.height - 6 };
        const all = allDense(m);
        const design = m.wells.find(w => w.design);
        const kick = design && design.dense.find(p => p.inc > 1);
        const cropTvd = !m.d3Full && kick ? Math.max(Math.min(...all.map(p => p.tvd)), kick.tvd - U.cropAbove) : Math.min(...all.map(p => p.tvd));
        const paths = m.wells.map(w => ({ w, pts:w.dense.filter(p => p.tvd >= cropTvd - 1e-6) })).filter(p => p.pts.length > 1);
        const shown = paths.flatMap(p => p.pts);
        const eE = d3.extent(shown, p => L(p.east)), eN = d3.extent(shown, p => L(p.north));
        const dMin = L(cropTvd), dMax = Math.max(dMin + L(60), L(Math.max(...shown.map(p => p.tvd))) + L(30));
        const biggest = Math.max(eE[1] - eE[0], eN[1] - eN[0], dMax - dMin);
        const widen = ([lo, hi]) => { const span = Math.max((hi - lo) * 1.16, biggest * 0.55), c = (lo + hi) / 2; return [c - span / 2, c + span / 2]; };
        const [e0, e1] = widen(eE), [n0, n1] = widen(eN);
        const c = [(e0 + e1) / 2, (n0 + n1) / 2, (dMin + dMax) / 2];
        const az = cam.az * Math.PI / 180, el = cam.el * Math.PI / 180;
        const raw = (E, N, D) => {
            const X = E - c[0], Y = N - c[1], Z = c[2] - D;
            const u = X * Math.cos(az) - Y * Math.sin(az), v = X * Math.sin(az) + Y * Math.cos(az);
            return [u, -(Z * Math.cos(el) + v * Math.sin(el))];
        };
        const rH = Math.hypot(e1 - e0, n1 - n0) / 2, rD = (dMax - dMin) / 2;
        const k = Math.min((box.w - 190) / (2 * rH), (box.h - 90) / (2 * (rD * Math.cos(el) + rH * Math.abs(Math.sin(el))))) * cam.zoom;
        const ox = box.x + box.w / 2, oy = box.y + box.h / 2;
        const P = (E, N, D) => { const r = raw(E, N, D); return [ox + r[0] * k, oy + r[1] * k]; };
        const Q = p => P(L(p.east), L(p.north), L(p.tvd));
        const inner = clip(g, box.x, box.y, box.w, box.h);
        const farE = Math.sin(az) > 0 ? e1 : e0, nearE = farE === e1 ? e0 : e1;
        const farN = Math.cos(az) > 0 ? n1 : n0, nearN = farN === n1 ? n0 : n1;
        const floorD = cam.el >= 0 ? dMax : dMin, walls = Math.abs(cam.el) < 89;
        const poly = (pts, fill, op) => inner.append('path').attr('d', pathD(pts) + 'Z').attr('fill', fill).attr('fill-opacity', op).attr('stroke', INK.axis);
        poly([P(e0, n0, floorD), P(e1, n0, floorD), P(e1, n1, floorD), P(e0, n1, floorD)], INK.wall, 1);
        if (walls) {
            poly([P(farE, n0, dMin), P(farE, n1, dMin), P(farE, n1, dMax), P(farE, n0, dMax)], INK.wall, 0.65);
            poly([P(e0, farN, dMin), P(e1, farN, dMin), P(e1, farN, dMax), P(e0, farN, dMax)], INK.wall, 0.65);
        }
        const ticks = (lo, hi, n) => d3.scaleLinear([lo, hi], [0, 1]).ticks(n);
        const tE = ticks(e0, e1, 5), tN = ticks(n0, n1, 5), tD = ticks(dMin, dMax, 6);
        const seg3 = (a, b) => { const p = P(...a), q = P(...b); line(inner, p[0], p[1], q[0], q[1], INK.grid, 1); };
        tE.forEach(v => { seg3([v, n0, floorD], [v, n1, floorD]); if (walls) seg3([v, farN, dMin], [v, farN, dMax]); });
        tN.forEach(v => { seg3([e0, v, floorD], [e1, v, floorD]); if (walls) seg3([farE, v, dMin], [farE, v, dMax]); });
        if (walls) tD.forEach(v => { seg3([farE, n0, v], [farE, n1, v]); seg3([e0, farN, v], [e1, farN, v]); });
        paths.forEach(({ w, pts }) => {
            const shadow = fn => stroke(inner, pts.map(p => P(...fn(L(p.east), L(p.north), L(p.tvd)))), w.color, 1, 0.4).attr('stroke-dasharray', '3,3');
            shadow((E, N) => [E, N, floorD]);
            if (walls) { shadow((E, N, D) => [farE, N, D]); shadow((E, N, D) => [E, farN, D]); }
        });
        paths.forEach(({ w, pts }) => stroke(inner, pts.map(Q), w.color, w.design ? 3.6 : 2.4));
        const centre = P(...c);
        const edgeLabels = (values, at, title) => {
            if (values.length < 2) return;
            const a = P(...at(values[0])), b = P(...at(values[values.length - 1]));
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 45) return;
            const mid = P(...at((values[0] + values[values.length - 1]) / 2));
            let dx = -(b[1] - a[1]), dy = b[0] - a[0];
            const len = Math.hypot(dx, dy); dx /= len; dy /= len;
            if (dx * (mid[0] - centre[0]) + dy * (mid[1] - centre[1]) < 0) { dx = -dx; dy = -dy; }
            const f = tickFmt(values), anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
            values.forEach(v => { const p = P(...at(v)); line(inner, p[0], p[1], p[0] + dx * 5, p[1] + dy * 5, INK.axis);
                text(inner, o, p[0] + dx * 9, p[1] + dy * 11 + 3, f(v), { size:9.5, fill:INK.muted, anchor }); });
            const off = anchor === 'middle' ? 28 : 46;
            const w = textWidth(title, 10.5, true), lead = anchor === 'start' ? 0 : anchor === 'end' ? w : w / 2;
            const tx = Math.max(lead + 4, Math.min(o.width - (w - lead) - 4, mid[0] + dx * off));
            text(inner, o, tx, mid[1] + dy * off + 3, title, { size:10.5, bold:true, anchor });
        };
        edgeLabels(tE, v => [v, nearN, floorD], `East (${U.len})`);
        edgeLabels(tN, v => [nearE, v, floorD], `North (${U.len})`);
        if (Math.abs(cam.el) < 75) {
            const corners = [[e0, n0], [e1, n0], [e1, n1], [e0, n1]];
            const left = corners.reduce((a, b) => P(b[0], b[1], c[2])[0] < P(a[0], a[1], c[2])[0] ? b : a);
            edgeLabels(tD, v => [left[0], left[1], v], `TVD (${U.len})`);
        }
        const screen = paths.flatMap(({ w, pts }) => pts.map(p => [...Q(p), p, w]));
        const items = [];
        drawApproaches(inner, { ...m, offsets:m.offsets.filter(x => x.summary.minSF.design.tvd >= cropTvd - 1e-3) }, Q, items);
        m.wells.forEach(w => { const end = w.results[w.results.length - 1], p = Q(end); symbol(inner, d3.symbolCircle, p[0], p[1], 55, w.color);
            items.push({ x:p[0], y:p[1], color:w.color, lines:[w.label] }); });
        placeLabels(inner, o, items, box, screen);
        const a0 = raw(c[0], c[1], c[2]), a1 = raw(c[0], c[1] + 1, c[2]);
        const ix = o.width - 34, iy = top + 30, nx = a1[0] - a0[0], ny = a1[1] - a0[1];
        line(g, ix, iy, ix + nx * 20, iy + ny * 20, INK.text, 2);
        symbol(g, d3.symbolCircle, ix, iy, 20, INK.text);
        text(g, o, ix + nx * 29, iy + ny * 29 + 4, 'N', { size:11, bold:true, anchor:'middle' });
        drawLegend(g, o, ll, 16, o.height - ll.height + 6);
        if (o.interactive) { node.__redraw = () => view3d(node, m, o); bind3d(node); bindPathHover(node, m, screen); }
    }
    function bind3d(node) {
        if (node.__bound3d) return;
        node.__bound3d = true;
        let drag = null, frame = 0;
        const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (node.__redraw) node.__redraw(); }); };
        node.addEventListener('pointerdown', ev => {
            if (ev.button || !node.__redraw) return;
            drag = { x:ev.clientX, y:ev.clientY, cam:{ ...node.__camera } };
            node.setPointerCapture(ev.pointerId); hideTip();
        });
        node.addEventListener('pointermove', ev => {
            if (!drag) return;
            node.__camera = { az:drag.cam.az + (ev.clientX - drag.x) * 0.45, el:Math.max(-15, Math.min(90, drag.cam.el + (ev.clientY - drag.y) * 0.35)), zoom:drag.cam.zoom };
            schedule();
        });
        const end = () => { drag = null; };
        node.addEventListener('pointerup', end);
        node.addEventListener('pointercancel', end);
        node.addEventListener('wheel', ev => {
            if (!(ev.ctrlKey || ev.metaKey) || !node.__redraw) return;
            ev.preventDefault();
            node.__camera = { ...node.__camera, zoom:Math.max(0.4, Math.min(20, node.__camera.zoom * Math.exp(-ev.deltaY * 0.0018))) };
            schedule();
        }, { passive:false });
        node.addEventListener('dblclick', () => { node.__camera = { ...VIEWS.iso }; schedule(); });
    }
    function setView(node, name) { node.__camera = { ...VIEWS[name] }; if (node.__redraw) node.__redraw(); }

    /* ---------------- SF AND DISTANCE AGAINST DESIGN MD ---------------- */
    function againstMd(node, m, o, kind) {
        const g = base(node, o), U = UNITS[m.units], L = v => toLen(v, m.units), isSF = kind === 'sf';
        const legend = m.offsets.map(x => ({ type:'line', color:x.color, label:x.label }));
        if (isSF) legend.push({ type:'dash', color:STATUS_COLORS.warning, label:`Warning below ${m.params.warn}` }, { type:'dash', color:STATUS_COLORS.critical, label:`Critical below ${m.params.crit}` });
        const top = titleBlock(g, o) + 4;
        const ll = legendLayout(legend, o.width - 80, o);
        const box = { x:64, y:top, w:o.width - 80, h:o.height - top - 42 - ll.height };
        const records = m.offsets.flatMap(x => x.records);
        const x = d3.scaleLinear([L(d3.min(records, r => r.designMD)), L(d3.max(records, r => r.designMD))], [box.x, box.x + box.w]);
        const value = r => isSF ? r.sf : L(r.distance);
        let y, yTicks;
        if (isSF) {                                   // logarithmic: SF spans several orders of magnitude
            const lo = Math.max(0.01, Math.min(m.params.crit / 2, d3.min(records, value) * 0.8));
            const hi = Math.max(m.params.warn * 4, Math.min(100, d3.max(records, value)));
            y = d3.scaleLog([lo, hi], [box.y + box.h, box.y]).clamp(true);
            yTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(v => v >= lo && v <= hi);
        } else {
            y = d3.scaleLinear([0, d3.max(records, value) * 1.06], [box.y + box.h, box.y]);
            yTicks = y.ticks(Math.max(4, Math.floor(box.h / 40)));
        }
        if (isSF) [[y.domain()[0], m.params.crit, STATUS_COLORS.critical], [m.params.crit, m.params.warn, STATUS_COLORS.warning]].forEach(([a, b, color]) => {
            if (b > a) g.append('rect').attr('x', box.x).attr('width', box.w).attr('y', y(b)).attr('height', Math.max(0, y(a) - y(b))).attr('fill', color).attr('fill-opacity', 0.09);
        });
        const xt = x.ticks(Math.max(4, Math.floor(box.w / 90))), xf = tickFmt(xt);
        xt.forEach(v => { line(g, x(v), box.y, x(v), box.y + box.h, INK.grid); text(g, o, x(v), box.y + box.h + 14, xf(v), { size:10, fill:INK.muted, anchor:'middle' }); });
        const yf = isSF ? v => String(v) : tickFmt(yTicks);
        yTicks.forEach(v => { line(g, box.x, y(v), box.x + box.w, y(v), INK.grid); text(g, o, box.x - 6, y(v) + 3.5, yf(v), { size:10, fill:INK.muted, anchor:'end' }); });
        g.append('rect').attr('x', box.x).attr('y', box.y).attr('width', box.w).attr('height', box.h).attr('fill', 'none').attr('stroke', INK.axis);
        text(g, o, box.x + box.w / 2, box.y + box.h + 30, `Design well measured depth (${U.len})`, { size:11, anchor:'middle' });
        text(g, o, 14, box.y + box.h / 2, isSF ? `Separation factor (log scale${y.domain()[1] >= 100 ? ', values above 100 shown at 100' : ''})` : `Centre-to-centre distance (${U.len})`, { size:11, anchor:'middle', rotate:-90 });
        if (isSF) [['warning', m.params.warn], ['critical', m.params.crit]].forEach(([s, v]) => line(g, box.x, y(v), box.x + box.w, y(v), STATUS_COLORS[s], 1.4, '6,4'));
        const inner = clip(g, box.x, box.y - 2, box.w, box.h + 4);
        m.offsets.forEach(off => stroke(inner, off.records.map(r => [x(L(r.designMD)), y(value(r))]), off.color, 2));
        const items = m.offsets.map(off => {
            const r = isSF ? off.summary.minSF : off.summary.minDist, px = x(L(r.designMD)), py = y(value(r));
            symbol(inner, d3.symbolCircle, px, py, 60, off.color);
            return { x:px, y:py, color:off.color, lines:[isSF ? `${off.label}: ${sfText(r.sf)}` : `${off.label}: ${lenText(m, r.distance)}`, `MD ${lenText(m, r.designMD, 0)}`] };
        });
        placeLabels(inner, o, items, box, []);
        drawLegend(g, o, ll, box.x, box.y + box.h + 46);
        if (o.interactive) {
            node.__redraw = () => againstMd(node, m, o, kind);
            const svg = d3.select(node);
            svg.on('pointermove.tip', ev => {
                const [mx, my] = d3.pointer(ev, node);
                svg.select('.cross').remove();
                if (mx < box.x || mx > box.x + box.w || my < box.y || my > box.y + box.h) { hideTip(); return; }
                const md = fromLen(x.invert(mx), m.units);
                svg.append('line').attr('class', 'cross').attr('pointer-events', 'none').attr('x1', mx).attr('x2', mx).attr('y1', box.y).attr('y2', box.y + box.h).attr('stroke', INK.muted);
                const rows = m.offsets.map(off => { const r = off.records.reduce((a, b) => Math.abs(b.designMD - md) < Math.abs(a.designMD - md) ? b : a);
                    return [off.label, `SF ${sfText(r.sf)} | ${lenText(m, r.distance)}`]; });
                showTip(ev, `Design MD ${lenText(m, md, 0)}`, rows);
            }).on('pointerleave.tip', () => { hideTip(); svg.select('.cross').remove(); });
        }
    }
    const sfChart = (node, m, o) => againstMd(node, m, o, 'sf');
    const distanceChart = (node, m, o) => againstMd(node, m, o, 'distance');

    /* ---------------- TRAVELLING CYLINDER ---------------- */
    function cylinder(node, m, o) {
        const g = base(node, o), U = UNITS[m.units], L = v => toLen(v, m.units);
        const high = m.reference === 'highside';
        const legend = [...m.offsets.map(x => ({ type:'line', color:x.color, label:x.label })), { type:'diamond', color:INK.muted, label:'Closest approach' }];
        const top = titleBlock(g, o) + 4;
        const ll = legendLayout(legend, o.width - 40, o);
        let rMax = m.radius === 'auto' ? null : L(m.radius);
        if (!rMax) {
            const closest = Math.max(...m.offsets.map(x => L(x.summary.minDist.distance)));
            rMax = [25, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000].find(v => v >= Math.max(closest * 1.4, L(40))) || closest * 1.4;
        }
        const R = Math.max(40, Math.min(o.width - 90, o.height - top - ll.height - 66) / 2);
        const cx = o.width / 2, cy = top + R + 20;
        const rings = d3.scaleLinear([0, rMax], [0, R]).ticks(5).filter(v => v > 0);
        const at = (angle, r) => [cx + Math.sin(angle * Math.PI / 180) * r / rMax * R, cy - Math.cos(angle * Math.PI / 180) * r / rMax * R];
        g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', R).attr('fill', INK.wall).attr('stroke', INK.axis);
        rings.forEach(v => { g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', v / rMax * R).attr('fill', 'none').attr('stroke', '#d5dde8');
            text(g, o, cx + 4, cy - v / rMax * R + 11, `${fmt(v)} ${U.len}`, { size:9, fill:INK.muted }); });
        const names = high ? ['High side', 'Right', 'Low side', 'Left'] : ['N', 'E', 'S', 'W'];
        for (let a = 0; a < 360; a += 30) {
            const p = at(a, rMax); line(g, cx, cy, p[0], p[1], '#d5dde8');
            const q = at(a, rMax * (1 + 14 / R));
            const label = a % 90 === 0 ? names[a / 90] : `${a}°`;
            text(g, o, q[0], q[1] + 3.5, label, { size:a % 90 === 0 ? 10.5 : 8.5, bold:a % 90 === 0, fill:a % 90 === 0 ? INK.text : INK.muted,
                anchor:a % 180 === 0 ? 'middle' : a < 180 ? 'start' : 'end' });
        }
        symbol(g, d3.symbolCircle, cx, cy, 90, INK.path);
        const pts = [], items = [];
        const markStep = (() => { const span = L(d3.max(m.offsets.flatMap(x => x.records), r => r.designMD)); return [100, 250, 500, 1000, 2000, 5000].find(v => span / v <= 6) || 5000; })();
        m.offsets.forEach(off => {
            let run = [], nextMark = 0;
            const flush = () => { if (run.length > 1) stroke(g, run, off.color, 2); run = []; };
            off.records.forEach(r => {
                const t = travellerPoint(r, m.reference), d = L(t.radius);
                if (d > rMax) { flush(); return; }
                const p = at(t.angle, d); run.push(p); pts.push([p[0], p[1], r, off, t]);
                if (L(r.designMD) >= nextMark) {
                    symbol(g, d3.symbolCircle, p[0], p[1], 26, off.color);
                    text(g, o, p[0] + 5, p[1] - 4, fmt(L(r.designMD)), { size:8.5, fill:INK.muted });
                    nextMark = (Math.floor(L(r.designMD) / markStep) + 1) * markStep;
                }
            });
            flush();
            const c = off.summary.minDist, t = travellerPoint(c, m.reference);
            if (L(t.radius) <= rMax) { const p = at(t.angle, L(t.radius)); symbol(g, d3.symbolDiamond, p[0], p[1], 110, off.color);
                items.push({ x:p[0], y:p[1], color:off.color, lines:[`${off.label}: ${lenText(m, c.distance)}`, `MD ${lenText(m, c.designMD, 0)}`] }); }
        });
        placeLabels(g, o, items, { x:4, y:top, w:o.width - 8, h:2 * R + 30 }, pts);
        [`Looking down the design well: radius = distance, numbers = design MD (${U.len})`, high ? 'Angles from high side (grid north where vertical)' : 'Angles from grid north']
            .forEach((s, i) => text(g, o, cx, cy + R + 32 + i * 13, s, { size:9.5, fill:INK.muted, anchor:'middle' }));
        drawLegend(g, o, ll, 20, o.height - ll.height + 6);
        if (o.interactive) {
            node.__redraw = () => cylinder(node, m, o);
            const svg = d3.select(node);
            svg.on('pointermove.tip', ev => {
                const [mx, my] = d3.pointer(ev, node);
                let best = null, bd = 24 * 24;
                pts.forEach(s => { const d = (s[0] - mx) ** 2 + (s[1] - my) ** 2; if (d < bd) { bd = d; best = s; } });
                svg.select('.hover-dot').remove();
                if (!best) { hideTip(); return; }
                svg.append('circle').attr('class', 'hover-dot').attr('pointer-events', 'none').attr('cx', best[0]).attr('cy', best[1]).attr('r', 5).attr('fill', best[3].color).attr('stroke', '#fff').attr('stroke-width', 2);
                showTip(ev, best[3].label, [['Design MD', lenText(m, best[2].designMD, 0)], ['Offset MD', lenText(m, best[2].offsetMD, 0)], ['Distance', lenText(m, best[2].distance, 2)],
                    ['SF', sfText(best[2].sf)], ['Direction', `${fmt(best[4].angle, 0)}°`]]);
            }).on('pointerleave.tip', () => { hideTip(); svg.select('.hover-dot').remove(); });
        }
    }

    return { sf:sfChart, distance:distanceChart, cylinder, plan, section, view3d, setView, hideTip, VIEWS };
})();

/* ===== SCREEN ORCHESTRATION ===== */
const CHART_NODES = { sf:'chartSF', distance:'chartDistance', cylinder:'chartCylinder', plan:'chartPlan', section:'chartSection', view3d:'chart3d' };
const NEEDS_SCAN = ['sf', 'distance', 'cylinder'];

function buildModel(){
  const placed = S.wells.filter(w => w.placed.length);
  if(!placed.length) return null;
  const maxMd = Math.max(...placed.map(w => w.placed[w.placed.length - 1].md));
  const chosen = w => w.role === 'design' || (w.visible && (S.offsetFilter === 'all' || S.offsetFilter === w.id));
  const wells = placed.filter(chosen).map(w => {
    const dense = densify(w.placed, Math.max(2, maxMd / 700), S.params.vsAz);
    return { id:w.id, label:w.name, color:w.color, design:w.role === 'design', results:w.placed, dense };
  });
  const offsets = (S.scan ? S.scan.offsets : []).filter(o => chosen(wellById(o.id)))
    .map(o => ({ ...o, label:wellById(o.id).name, color:wellById(o.id).color }));
  return { units:S.units, params:S.params, vsAz:S.params.vsAz, wells, offsets, trueScale:S.view.trueScale, d3Full:S.view.d3Full,
           reference:S.view.reference, radius:S.view.radius === 'auto' ? 'auto' : fromLen(+S.view.radius, S.units) };
}
function chartAvailable(key, model = buildModel()){ return !!model && (!NEEDS_SCAN.includes(key) || model.offsets.length > 0); }
function drawCharts(){
  const model = buildModel();
  Object.entries(CHART_NODES).forEach(([key, id]) => {
    const node = $(id), box = node.parentElement;
    if(!chartAvailable(key, model)){
      node.__redraw = null; d3.select(node).on('.tip', null).selectAll('*').remove();
      box.classList.add('empty'); return;
    }
    box.classList.remove('empty');
    Charts[key](node, model, { width:Math.max(280, box.clientWidth - 8), height:Math.max(260, box.clientHeight - 8), interactive:true });
  });
  Charts.hideTip();
}
let geometryKey = '';
function resetZoom(){ ['chartPlan', 'chartSection'].forEach(id => { const n = $(id); n.__transform = null; n.__zoom = d3.zoomIdentity; }); }
function resetZoomIfMoved(){
  const key = S.wells.map(w => { const p = w.placed[w.placed.length - 1]; return p ? `${w.id}:${p.north.toFixed(0)}:${p.east.toFixed(0)}:${p.tvd.toFixed(0)}` : ''; }).join('|');
  if(key !== geometryKey){ geometryKey = key; resetZoom(); }
}
function resetPlot(id){ const n = $(id); if(n.__zoom_bound) d3.select(n).call(n.__zoom_bound.transform, d3.zoomIdentity); }
function setView3d(name){ Charts.setView($('chart3d'), name); }
function renderCylinderRadius(){
  const steps = S.units === 'm' ? [25, 50, 100, 250, 500, 1000] : [100, 200, 300, 800, 1500, 3000];
  $('cylRadius').innerHTML = '<option value="auto">Auto radius</option>' + steps.map(v => `<option value="${v}">${v} ${U().len}</option>`).join('');
  if(!steps.includes(+S.view.radius)) S.view.radius = 'auto';
  $('cylRadius').value = S.view.radius;
}
