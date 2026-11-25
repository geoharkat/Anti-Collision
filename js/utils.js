/* =============================================================
   Anti-Collision Analyst — utils.js
   DOM helpers, escaping, formatting, toasts, About dialog.
   ============================================================= */

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const U = () => UNITS[S.units];
const fmtLen = (m, d = 2) => `${toLen(m, S.units).toFixed(d)} ${U().len}`;
const dispLen = (m, d = 2) => +toLen(m, S.units).toFixed(d);
const dispRadius = m => +(m * U().radiusFactor).toFixed(3);
const radiusToM = v => v / U().radiusFactor;
const fmtSF = v => v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

function toast(message, type = 'info'){
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 4500);
}

function openAbout(){ const d = $('aboutDialog'); if(!d.open) d.showModal(); }
function closeAbout(){ $('aboutDialog').close(); }
