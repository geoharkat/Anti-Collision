/* =============================================================
   Anti-Collision Analyst — state.js
   Application state and constants. Lengths are stored in metres
   whatever the display unit.
   ============================================================= */

const APP_VERSION = '2.0.0';
const DESIGN_COLOR = '#0f172a';
/* Red, amber and green are reserved for separation-factor status. */
const OFFSET_COLORS = ['#257de0', '#f47230', '#6a4ce2', '#ee7fac', '#00b894', '#8c6d31', '#00838f', '#7f8c8d'];
const STATUS_COLORS = { critical:'#dc2626', warning:'#d97706', safe:'#059669' };
const STATUS_LABELS = { critical:'CRITICAL', warning:'WARNING', safe:'SAFE' };
const DEFAULT_LOCATION = { lat:30.45, lon:5.82 };

const S = {
  units: (() => { try { return localStorage.getItem('aca-units') === 'ft' ? 'ft' : 'm'; } catch(e){ return 'm'; } })(),
  wells: [], nextId: 1,
  params: { vsAz:0, rDesign:0.15, rOffset:0.15, warn:1.5, crit:1.0, useUncertainty:true,
            depthFactor:0.0035, incError:0.2, aziError:0.5, sigma:1 },
  scan: null,          // { offsets:[{ id, records, summary }], overall }
  baseline: null,      // same, for the imported design survey while a designed profile is applied
  designerError: '',
  table: 'summary', tableStepIndex: 1, offsetFilter: 'all',
  view: { trueScale:true, d3Full:true, reference:'north', radius:'auto', map:false }
};

const designWell = () => S.wells.find(w => w.role === 'design') || null;
const offsetWells = () => S.wells.filter(w => w.role === 'offset');
const wellById = id => S.wells.find(w => w.id === id);
