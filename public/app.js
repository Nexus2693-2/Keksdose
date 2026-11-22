/* ---------- Keksdose — Rezeptlogik ---------- */
(() => {
  'use strict';

  // In der Android-App (eigener User-Agent) entfällt der Download-Hinweis,
  // und der Service Worker bleibt aus: Die Dateien liegen ohnehin im APK.
  const IS_APP = /KeksdoseApp/.test(navigator.userAgent);
  if (IS_APP) document.documentElement.classList.add('is-app');

  const RECIPES = window.RECIPES || [];
  const TAG_ORDER = ['Klassiker', 'Schokolade', 'Nüsse', 'Fruchtig', 'Vegan', 'Schnell', 'Waffeln', 'Gebäck'];
  const CUTTER_MIN = 1;
  const CUTTER_MAX = 10;

  const state = {
    tag: 'Alle',
    query: '',
    sort: 'empfohlen',
    open: null,
    scale: 1,
    cutter: null,
    done: new Set()
  };

  const el = {
    grid: document.getElementById('recipeGrid'),
    chips: document.getElementById('filterChips'),
    search: document.getElementById('searchInput'),
    sort: document.getElementById('sortSelect'),
    info: document.getElementById('resultInfo'),
    empty: document.getElementById('emptyState'),
    emptyQuery: document.getElementById('emptyQuery'),
    reset: document.getElementById('resetFilters'),
    heroArt: document.getElementById('heroArt'),
    drawer: document.getElementById('drawer'),
    backdrop: document.getElementById('backdrop'),
    body: document.body,
    listToggle: document.getElementById('listToggle'),
    listCount: document.getElementById('listCount'),
    listPanel: document.getElementById('listPanel'),
    listBackdrop: document.getElementById('listBackdrop')
  };

  /* ---------- Kleine Helfer ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

  function fmtAmount(value) {
    if (!isFinite(value) || value <= 0) return '0';
    if (value >= 10) return String(Math.round(value));
    const snapped = Math.round(value * 4) / 4;
    const whole = Math.floor(snapped + 1e-9);
    const frac = Math.round((snapped - whole) * 100) / 100;
    if (!frac) return String(whole);
    return (whole ? whole + ' ' : '') + (FRACTIONS[frac] || String(frac).replace('.', ','));
  }

  const totalTime = (r) => r.zeit + (r.kuehl || 0);

  // Stückzahl: bei Ausstech-Plätzchen hängt sie an der Fläche des Ausstechers,
  // also am Quadrat des Durchmessers.
  function basePieces(r) {
    if (!r.ausstecher || !state.cutter) return r.stueck;
    return r.ausstecher.stueck * Math.pow(r.ausstecher.d / state.cutter, 2);
  }
  const pieces = (r) => Math.max(1, Math.round(basePieces(r) * state.scale));
  const maxPieces = (r) => r.stueckMax || r.stueck * 4;

  /* ---------- Cookie-Illustrationen (SVG) ---------- */
  let uid = 0;

  function cookieArt(r) {
    const id = 'cm' + (++uid);
    const { shape, dough, accent } = r;
    const edge = 'rgba(72,44,24,.22)';
    const stroke = `stroke="${edge}" stroke-width="2"`;

    const speckles = (color, pts) => pts
      .map(([cx, cy, rr]) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${color}" opacity=".5"/>`)
      .join('');

    switch (shape) {
      case 'star':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Zimtstern">
          <path d="M50 6 L61.2 34.6 L91.9 36.4 L68.1 55.9 L75.9 85.6 L50 69 L24.1 85.6 L31.9 55.9 L8.1 36.4 L38.8 34.6 Z"
            fill="${dough}" ${stroke} stroke-linejoin="round"/>
          <g transform="translate(50 50) scale(.66) translate(-50 -50)">
            <path d="M50 6 L61.2 34.6 L91.9 36.4 L68.1 55.9 L75.9 85.6 L50 69 L24.1 85.6 L31.9 55.9 L8.1 36.4 L38.8 34.6 Z"
              fill="${accent}" opacity=".92"/>
          </g>
          <circle cx="50" cy="50" r="3.4" fill="${dough}" opacity=".85"/>
        </svg>`;

      case 'crescent':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Vanillekipferl">
          <g transform="rotate(-6 50 50)">
            <path d="M11 30 C 20 88, 80 88, 89 30 C 76 62, 24 62, 11 30 Z"
              fill="${dough}" ${stroke} stroke-linejoin="round"/>
            <path d="M22 48 C 33 58, 67 58, 78 48" fill="none" stroke="${accent}" stroke-width="2.4"
              stroke-linecap="round" opacity=".55"/>
            ${speckles(accent, [[34, 56, 2], [50, 62, 1.8], [66, 56, 2], [50, 72, 1.6]])}
          </g>
        </svg>`;

      case 'swirl':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Spritzgebäck">
          <path d="M64 20 C 34 20, 32 48, 50 52 C 70 57, 68 80, 36 80"
            fill="none" stroke="rgba(72,44,24,.22)" stroke-width="20" stroke-linecap="round"/>
          <path d="M64 20 C 34 20, 32 48, 50 52 C 70 57, 68 80, 36 80"
            fill="none" stroke="${dough}" stroke-width="17" stroke-linecap="round"/>
          <path d="M64 22 C 38 23, 36 46, 51 51" fill="none" stroke="${accent}" stroke-width="2"
            stroke-linecap="round" opacity=".35"/>
        </svg>`;

      case 'half':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Schwarz-Weiß-Gebäck">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <path d="M50 12 A 38 38 0 0 1 50 88 Z" fill="${accent}"/>
          <path d="M50 12 V 88" stroke="rgba(255,255,255,.35)" stroke-width="1.6"/>
          <circle cx="50" cy="50" r="38" fill="none" stroke="${edge}" stroke-width="2"/>
          <path d="M36 34 C 42 42, 40 48, 34 52" fill="none" stroke="rgba(255,255,255,.45)"
            stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;

      case 'heart':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Lebkuchenherz">
          <path d="M50 86 C 14 62, 12 32, 32 24 C 43 20, 50 28, 50 35 C 50 28, 57 20, 68 24 C 88 32, 86 62, 50 86 Z"
            fill="${dough}" ${stroke}/>
          <path d="M31 42 C 40 52, 60 52, 69 42" fill="none" stroke="${accent}" stroke-width="2.6"
            stroke-linecap="round" opacity=".8"/>
          ${speckles(accent, [[40, 60, 2], [50, 66, 2], [60, 60, 2], [50, 54, 1.7]])}
        </svg>`;

      case 'dome':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Kokosmakrone">
          <path d="M15 76 C 9 40, 31 20, 50 20 C 69 20, 91 40, 85 76 Z"
            fill="${dough}" ${stroke} stroke-linejoin="round"/>
          <path d="M15 76 H 85" stroke="${edge}" stroke-width="2" stroke-linecap="round"/>
          ${speckles(accent, [[36, 44, 2.2], [50, 38, 2], [64, 44, 2.2], [44, 56, 2], [58, 58, 2.4], [34, 64, 1.8], [68, 64, 1.8]])}
        </svg>`;

      case 'circle':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Heidesand">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <path d="M38 30 C 46 40, 43 50, 36 58" fill="none" stroke="rgba(255,255,255,.5)"
            stroke-width="2.4" stroke-linecap="round"/>
          <path d="M62 66 C 68 58, 70 50, 66 42" fill="none" stroke="rgba(255,255,255,.4)"
            stroke-width="2" stroke-linecap="round"/>
          ${speckles(accent, [[44, 46, 1.8], [58, 40, 1.6], [56, 62, 1.8], [40, 62, 1.5]])}
        </svg>`;

      case 'crackle':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Brownie-Cookie">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <path d="M30 36 L42 46 L36 56 L48 64" fill="none" stroke="${accent}" stroke-width="2.6"
            stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
          <path d="M68 34 L60 46 L66 54" fill="none" stroke="${accent}" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>
          <rect x="52" y="54" width="11" height="9" rx="2.5" fill="${accent}" opacity=".85"/>
          <rect x="30" y="62" width="9" height="8" rx="2" fill="${accent}" opacity=".7"/>
          <circle cx="64" cy="63" r="3" fill="${accent}" opacity=".65"/>
        </svg>`;

      case 'linzer':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Linzer Auge">
          <defs><mask id="${id}">
            <rect width="100" height="100" fill="#fff"/>
            <circle cx="50" cy="50" r="12.5" fill="#000"/>
          </mask></defs>
          <circle cx="50" cy="50" r="12.5" fill="${accent}"/>
          <circle cx="50" cy="50" r="40" fill="${dough}" ${stroke} mask="url(#${id})"/>
          <circle cx="50" cy="50" r="12.5" fill="none" stroke="${edge}" stroke-width="1.6"/>
          <circle cx="50" cy="50" r="12.5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".8"/>
          <path d="M24 38 C 32 30, 42 26, 50 25" fill="none" stroke="rgba(255,255,255,.5)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'almond':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Mandeltaler">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <g fill="${accent}" stroke="${edge}" stroke-width="1.6">
            <ellipse cx="50" cy="29" rx="10" ry="5.4"/>
            <ellipse cx="33" cy="44" rx="10" ry="5.4" transform="rotate(-42 33 44)"/>
            <ellipse cx="67" cy="44" rx="10" ry="5.4" transform="rotate(42 67 44)"/>
            <ellipse cx="50" cy="66" rx="10" ry="5.4"/>
            <ellipse cx="50" cy="47" rx="9" ry="4.8" transform="rotate(90 50 47)"/>
          </g>
          <path d="M22 34 C 30 24, 39 20, 47 20" fill="none" stroke="rgba(255,255,255,.5)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'jamheart':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Himbeerherz">
          <path d="M50 86 C 14 62, 12 32, 32 24 C 43 20, 50 28, 50 35 C 50 28, 57 20, 68 24 C 88 32, 86 62, 50 86 Z"
            fill="${dough}" ${stroke}/>
          <g transform="translate(50 54) scale(.32) translate(-50 -54)">
            <path d="M50 86 C 14 62, 12 32, 32 24 C 43 20, 50 28, 50 35 C 50 28, 57 20, 68 24 C 88 32, 86 62, 50 86 Z"
              fill="${accent}" stroke="rgba(72,44,24,.28)" stroke-width="5"/>
          </g>
          <path d="M27 40 C 33 31, 40 27, 46 26" fill="none" stroke="rgba(255,255,255,.45)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'brittle':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Krokanttaler">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <g fill="${r.accent2 || accent}" opacity=".9">
            <rect x="34" y="31" width="13" height="9" rx="2" transform="rotate(-14 40 35)"/>
            <rect x="52" y="39" width="14" height="9" rx="2" transform="rotate(12 59 43)"/>
            <rect x="29" y="51" width="12" height="8" rx="2" transform="rotate(22 35 55)"/>
            <rect x="50" y="57" width="13" height="8" rx="2" transform="rotate(-8 56 61)"/>
            <rect x="41" y="44" width="10" height="7" rx="2" transform="rotate(38 46 47)"/>
          </g>
          <path d="M24 40 C 30 28, 42 22, 52 22" fill="none" stroke="rgba(255,255,255,.4)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'nougat':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Nougattaler">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <rect x="32" y="32" width="36" height="36" rx="10" fill="${accent}" transform="rotate(9 50 50)"/>
          <path d="M37 43 C 45 51, 57 51, 65 43" fill="none" stroke="${r.accent2 || accent}"
            stroke-width="3" stroke-linecap="round" opacity=".6"/>
          <path d="M24 40 C 30 29, 40 23, 50 23" fill="none" stroke="rgba(255,255,255,.4)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'ring':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Genießerkringel">
          <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(72,44,24,.22)" stroke-width="19"/>
          <circle cx="50" cy="50" r="33" fill="none" stroke="${dough}" stroke-width="17"/>
          <circle cx="50" cy="50" r="33" fill="none" stroke="${accent}" stroke-width="7"
            stroke-dasharray="20 7" stroke-linecap="round" opacity=".85"/>
          <path d="M22 37 C 28 29, 36 25, 44 24" fill="none" stroke="rgba(255,255,255,.45)"
            stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;

      case 'oval':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Orangenzunge">
          <g transform="rotate(-14 50 50)">
            <ellipse cx="50" cy="50" rx="40" ry="23" fill="${dough}" ${stroke}/>
            <path d="M50 27 A 40 23 0 0 1 50 73 Z" fill="${accent}" opacity=".9"/>
            <path d="M17 42 C 23 33, 31 29, 39 28" fill="none" stroke="rgba(255,255,255,.45)"
              stroke-width="2.2" stroke-linecap="round"/>
          </g>
        </svg>`;

      case 'rect':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Schnitte">
          <g transform="rotate(-4 50 50)">
            <rect x="15" y="30" width="70" height="42" rx="8" fill="${dough}" ${stroke}/>
            <path d="M23 30 H77 A 8 8 0 0 1 85 38 V45 H15 V38 A 8 8 0 0 1 23 30 Z"
              fill="${accent}" opacity=".92"/>
            <path d="M25 61 H75" stroke="rgba(72,44,24,.14)" stroke-width="2" stroke-linecap="round"/>
          </g>
        </svg>`;

      case 'paw':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Tatze">
          <g fill="${dough}" ${stroke}>
            <ellipse cx="50" cy="60" rx="21" ry="16"/>
            <ellipse cx="29" cy="35" rx="7.5" ry="9"/>
            <ellipse cx="43" cy="27" rx="7.5" ry="9"/>
            <ellipse cx="57" cy="27" rx="7.5" ry="9"/>
            <ellipse cx="71" cy="35" rx="7.5" ry="9"/>
          </g>
          <circle cx="50" cy="60" r="7" fill="${accent}" opacity=".9"/>
        </svg>`;

      case 'oat':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Haferkeks">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <g fill="${accent}" opacity=".55">
            <ellipse cx="40" cy="40" rx="8" ry="4.2" transform="rotate(-24 40 40)"/>
            <ellipse cx="60" cy="36" rx="7.4" ry="4" transform="rotate(18 60 36)"/>
            <ellipse cx="66" cy="56" rx="8" ry="4.2" transform="rotate(-10 66 56)"/>
            <ellipse cx="45" cy="62" rx="7.6" ry="4" transform="rotate(30 45 62)"/>
            <ellipse cx="52" cy="48" rx="7" ry="3.8" transform="rotate(-46 52 48)"/>
          </g>
          ${speckles('#6a4a32', [[36, 52, 1.8], [58, 70, 1.6], [70, 44, 1.4]])}
        </svg>`;

      case 'taler':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Himbeer-Taler">
          <circle cx="52" cy="55" r="40" fill="${r.rim || dough}" ${stroke}/>
          <circle cx="50" cy="51" r="39" fill="${r.accent2 || accent}"/>
          <circle cx="48" cy="47" r="38" fill="${dough}" ${stroke}/>
          <circle cx="48" cy="46" r="30" fill="${accent}"/>
          <path d="M22 42 C 29 31, 40 25, 51 24" fill="none" stroke="rgba(255,255,255,.5)"
            stroke-width="2.6" stroke-linecap="round"/>
          ${speckles('#ffffff', [[36, 36, 1.9], [58, 34, 1.6], [65, 50, 1.7], [34, 56, 1.6], [50, 62, 1.8], [43, 47, 1.5]])}
        </svg>`;

      case 'waffle':
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Herzwaffel">
          <defs><clipPath id="${id}">
            <path d="M50 88 C 12 63, 10 33, 30 24 C 42 19, 50 27, 50 35 C 50 27, 58 19, 70 24 C 90 33, 88 63, 50 88 Z"/>
          </clipPath></defs>
          <path d="M50 88 C 12 63, 10 33, 30 24 C 42 19, 50 27, 50 35 C 50 27, 58 19, 70 24 C 90 33, 88 63, 50 88 Z"
            fill="${dough}" ${stroke} stroke-linejoin="round"/>
          <g clip-path="url(#${id})">
            <g stroke="${edge}" stroke-width="2.6" opacity=".45" stroke-linecap="round">
              <path d="M16 20V84M28 16V88M40 14V90M52 14V90M64 16V88M76 20V84M88 24V80"/>
              <path d="M12 26H88M12 38H88M12 50H88M12 62H88M12 74H88"/>
            </g>
            <path d="M26 34 C 40 28, 60 28, 74 34" fill="none" stroke="rgba(255,255,255,.45)"
              stroke-width="2.4" stroke-linecap="round"/>
          </g>
          <path d="M50 88 C 12 63, 10 33, 30 24 C 42 19, 50 27, 50 35 C 50 27, 58 19, 70 24 C 90 33, 88 63, 50 88 Z"
            fill="none" stroke="${edge}" stroke-width="2.4"/>
        </svg>`;

      case 'thumbprint':
      default:
        return `<svg viewBox="0 0 100 100" role="img" aria-label="Engelsauge">
          <circle cx="50" cy="50" r="38" fill="${dough}" ${stroke}/>
          <circle cx="50" cy="50" r="14" fill="${accent}"/>
          <circle cx="50" cy="50" r="14" fill="none" stroke="rgba(72,44,24,.25)" stroke-width="1.6"/>
          <ellipse cx="45" cy="45" rx="4" ry="2.6" fill="#fff" opacity=".4"/>
          <path d="M28 34 C 36 28, 44 26, 50 26" fill="none" stroke="rgba(255,255,255,.5)"
            stroke-width="2" stroke-linecap="round"/>
        </svg>`;
    }
  }

  /* ---------- Icons ---------- */
  const icons = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    flake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 6.5 9.8 4.6M12 6.5l2.2-1.9M12 17.5l-2.2 1.9M12 17.5l2.2 1.9"/></svg>',
    cookie: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="9.5" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="9.5" r=".9" fill="currentColor" stroke="none"/><circle cx="13" cy="14.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r=".8" fill="currentColor" stroke="none"/></svg>',
    level: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17v-5M9.3 17V8M14.6 17v-7M20 17V5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6H7z"/></svg>',
    basket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8h15l-1.6 11.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8Z"/><path d="M9 8V6.4a3 3 0 0 1 6 0V8"/></svg>',
    euro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.4A6.2 6.2 0 0 0 7 10.5v3a6.2 6.2 0 0 0 9.5 4.1"/><path d="M4.5 10.4h7M4.5 13.2h7"/></svg>'
  };

  /* ---------- Preisschätzung ---------- */
  // Grobe Supermarktpreise: pro 100 g, 100 ml oder pro Stück. Das ist kein
  // Kassenbon, sondern eine Hausnummer für den Einkauf.
  const PRICE_RULES = [
    { test: /haselnussglasur/, price: 1.0 },
    { test: /mandelglasur/, price: 1.1 },
    { test: /schokoglasur|kuverture|schokolade|schokotropfen/, price: 0.95 },
    { test: /krokant/, price: 0.9 },
    { test: /kakao/, price: 0.85 },
    { test: /kokosol/, price: 1.2 },
    { test: /kokos/, price: 0.7 },
    { test: /pistazie/, price: 2.5 },
    { test: /mandel/, price: 1.05 },
    { test: /haselnuss/, price: 1.0 },
    { test: /walnuss/, price: 1.6 },
    { test: /nuss/, price: 1.2 },
    { test: /marzipan/, price: 1.2 },
    { test: /nutella|nougatcreme/, price: 0.8 },
    { test: /konfiture|marmelade|gelee/, price: 0.5 },
    { test: /himbeer|johannisbeer|kirsche|aprikose|erdbeer/, price: 0.8 },
    { test: /essig/, price: 0.4 },
    { test: /zitrone|orange|apfel/, per: 'stk', price: 0.45 },
    { test: /zimt/, price: 0.6 },
    { test: /nelken|lebkuchengewurz|gewurz/, price: 0.9 },
    { test: /vanilleextrakt/, price: 6.0 },
    { test: /vanillezucker|vanillinzucker/, per: 'stk', price: 0.1 },
    { test: /puderzucker/, price: 0.2 },
    { test: /brauner zucker/, price: 0.25 },
    { test: /zucker/, price: 0.12 },
    { test: /honig/, price: 1.0 },
    { test: /ahornsirup|sirup/, price: 1.4 },
    { test: /mehl/, price: 0.09 },
    { test: /backpulver/, per: 'stk', price: 0.08 },
    { test: /hefe/, per: 'stk', price: 0.15 },
    { test: /speisestarke|starke/, price: 0.3 },
    { test: /haferflocken/, price: 0.15 },
    { test: /blatterteig/, per: 'stk', price: 1.6 },
    { test: /eigelb|eiweiss|eier|(^|\s)ei(\s|$)/, per: 'stk', price: 0.32 },
    { test: /buttermilch/, price: 0.1 },
    { test: /butter/, price: 0.9 },
    { test: /margarine/, price: 0.55 },
    { test: /palmin/, price: 0.9 },
    { test: /sahne|schmand|creme fraiche/, price: 0.3 },
    { test: /frischkase|quark/, price: 0.7 },
    { test: /haferdrink|milch/, price: 0.1 },
    { test: /salz/, price: 0.05 },
    { test: /rosine/, price: 0.6 },
    { test: /schwarztee/, per: 'stk', price: 0.06 },
    { test: /(^|\s)ol(\s|$)/, price: 0.6 },
    { test: /wasser/, price: 0.01 }
  ];

  const priceNorm = (s) => String(s).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

  // Was ein Löffel, ein Päckchen oder eine Prise ungefähr wiegt.
  const unitGrams = (z) => {
    const m = z.m || 0;
    if (z.u === 'kg') return m * 1000;
    if (z.u === 'g') return m;
    if (z.u === 'l') return m * 1000;
    if (z.u === 'ml') return m;
    if (z.u === 'EL') return m * 12;
    if (z.u === 'TL') return m * 4;
    if (z.u === 'Tasse') return m * 130;
    if (z.u === 'Päckchen') return m * 8;
    if (z.u === 'Prise') return m * 0.4;
    if (!z.u) return m * 55;   // ein Ei wiegt etwa so viel
    return m;
  };

  const priceRule = (name) => {
    const n = priceNorm(name);
    return PRICE_RULES.find((rule) => rule.test.test(n)) || { price: 0.5 };
  };

  // Zutaten einer Sorte zusammengerechnet – geschätzt, nicht gerechnet.
  function recipeCost(r) {
    return r.zutaten.reduce((sum, z) => {
      const rule = priceRule(z.n);
      if (rule.per === 'stk') {
        const count = !z.u || z.u === 'Päckchen' || z.u === 'Bund' ? (z.m || 0) : 1;
        return sum + count * rule.price;
      }
      return sum + (unitGrams(z) / 100) * rule.price;
    }, 0);
  }

  const euro = (value) => {
    const cents = Math.max(0, Math.round(value * 100));
    return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} €`;
  };

  const costPerPiece = (r) => recipeCost(r) / Math.max(1, r.stueck);

  /* ---------- Filter & Grid ---------- */
  function availableTags() {
    return ['Alle'].concat(TAG_ORDER.filter((t) => RECIPES.some((r) => r.tags.includes(t))));
  }

  function renderChips() {
    el.chips.innerHTML = availableTags().map((t) => `
      <button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="${t === state.tag}">${esc(t)}</button>
    `).join('');
  }

  function visibleRecipes() {
    const q = state.query.trim().toLowerCase();
    let list = RECIPES.filter((r) => {
      const tagOk = state.tag === 'Alle' || r.tags.includes(state.tag);
      if (!tagOk) return false;
      if (!q) return true;
      const haystack = [
        r.name, r.kicker, r.level, r.tags.join(' '), r.oma ? 'Omas Original' : '',
        r.zutaten.map((z) => z.n).join(' '),
        r.schritte.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    if (state.sort === 'schnell') list.sort((a, b) => totalTime(a) - totalTime(b));
    else if (state.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return list;
  }

  function cardHTML(r, index, intro = false) {
    const num = String(index + 1).padStart(2, '0');
    return `
      <article class="card${intro ? ' card-in' : ''}" style="--i:${Math.min(index, 9)}" data-id="${esc(r.id)}" tabindex="0" role="button"
        aria-label="Rezept ${esc(r.name)} öffnen">
        <div class="card-art" style="--tint:${esc(r.tint)}">
          <span class="card-num">${num}</span>
          ${r.oma ? '<span class="card-oma">Omas Original</span>' : ''}
          ${cookieArt(r)}
        </div>
        <h3>${esc(r.name)}</h3>
        <p class="card-kicker">${esc(r.kicker)}</p>
        <div class="card-meta">
          <span>${r.zeit} Min</span><i>·</i>
          <span>${r.stueck} Stück</span><i>·</i>
          <span>${esc(r.level)}</span>
        </div>
        <div class="card-tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="card-cost" title="Grobe Schätzung für alle Zutaten">
          <span>${icons.euro}</span>≈ ${euro(recipeCost(r))} · ${euro(costPerPiece(r))} je Stück
        </div>
      </article>`;
  }

  let gridIntroShown = false;

  function renderGrid() {
    const list = visibleRecipes();
    const intro = !gridIntroShown;
    gridIntroShown = true;
    el.grid.innerHTML = list.map((r, i) => cardHTML(r, i, intro)).join('');

    const total = RECIPES.length;
    el.info.textContent = list.length === total
      ? `${total} Rezepte`
      : `${list.length} von ${total} Rezepten`;

    const isFiltered = list.length === 0;
    el.empty.hidden = !isFiltered;
    el.grid.hidden = isFiltered;
    if (isFiltered) el.emptyQuery.textContent = state.query.trim() || state.tag;
  }

  /* ---------- Drawer ---------- */
  function metaHTML(r) {
    const items = [
      `<li>${icons.clock}${r.zeit} Min Backzeit &amp; Arbeit</li>`
    ];
    if (r.kuehl) items.push(`<li>${icons.flake}${r.kuehl} Min kühlen</li>`);
    items.push(`<li>${icons.cookie}<span id="metaPieces">${r.stueck} Stück</span></li>`);
    items.push(`<li>${icons.level}${esc(r.level)}</li>`);
    items.push(`<li>${icons.euro}<span id="costMeta">≈ ${euro(recipeCost(r))} Zutaten · ${euro(costPerPiece(r))} je Stück</span></li>`);
    return `<ul class="meta-list">${items.join('')}</ul>`;
  }

  function ingredientHTML(r) {
    return r.zutaten.map((z, i) => {
      const amount = z.m ? `${fmtAmount(z.m * state.scale)}${z.u ? ' ' + esc(z.u) : ''}` : '';
      const done = state.done.has('z' + i);
      return `<li class="${done ? 'done' : ''}">
        <button class="tick" type="button" data-kind="z" data-index="${i}"
          aria-pressed="${done}" aria-label="Zutat ${esc(z.n)} abhaken">${icons.check}</button>
        <span><span class="amount"><b>${amount}</b></span> <span class="iname">${esc(z.n)}</span></span>
      </li>`;
    }).join('');
  }

  function stepsHTML(r) {
    return r.schritte.map((s, i) => {
      const done = state.done.has('s' + i);
      return `<li class="${done ? 'done' : ''}" data-kind="s" data-index="${i}" tabindex="0">
        <span>${esc(s)}</span></li>`;
    }).join('');
  }

  const fmtCm = (v) => String(v).replace('.', ',');

  function cutterHTML(r) {
    if (!r.ausstecher) return '';
    return `
      <div class="cutter">
        <div class="cutter-head">
          <span class="cutter-title">Dein Ausstecher</span>
          <span class="cutter-result">Ø <strong id="cutterD">${fmtCm(state.cutter)}</strong> cm ·
            ≈ <strong id="cutterCount">${pieces(r)}</strong> Stück</span>
        </div>
        <input class="cutter-range" id="cutterRange" type="range" min="${CUTTER_MIN}"
          max="${CUTTER_MAX}" step="0.5" value="${state.cutter}"
          aria-label="Durchmesser des Ausstechers in Zentimetern">
        <div class="cutter-scale" aria-hidden="true"><span>${CUTTER_MIN} cm</span><span>5,5</span><span>${CUTTER_MAX} cm</span></div>
        <p class="hint">Gerechnet aus der Teigmenge: kleinere Ausstecher ergeben mehr, größere weniger Stücke.
          ${r.ausstecher.hinweis ? esc(r.ausstecher.hinweis) : ''}</p>
      </div>`;
  }

  // Rezepte, bei denen man die Stückzahl direkt zählt (z. B. Waffeln),
  // bekommen einen Plus/Minus-Regler statt der Portionsfaktoren.
  function portionHTML(r) {
    if (r.stueckSchritt) {
      return `
        <div class="scale-btns" role="group" aria-label="Anzahl der Stücke">
          <button type="button" data-step="-1" aria-label="Ein Stück weniger">−</button>
          <button type="button" data-step="1" aria-label="Ein Stück mehr">+</button>
        </div>`;
    }
    return `
      <div class="scale-btns" role="group" aria-label="Portionsgröße anpassen">
        ${[0.5, 1, 1.5, 2].map((f) => `<button type="button" data-scale="${f}"
          aria-pressed="${f === state.scale}">${f === 1 ? '1×' : String(f).replace('.', ',') + '×'}</button>`).join('')}
      </div>`;
  }

  function stepPieces(dir) {
    const r = state.open;
    if (!r || !r.stueckSchritt) return;
    const next = Math.max(1, Math.min(maxPieces(r), pieces(r) + dir * r.stueckSchritt));
    state.scale = next / r.stueck;
    refreshIngredients();
  }

  function drawerHTML(r) {
    return `
      <div class="drawer-scroll">
        <div class="drawer-head">
          <div class="drawer-top">
            <div class="drawer-tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
            <button class="icon-btn" id="closeDrawer" type="button" aria-label="Rezept schließen">${icons.close}</button>
          </div>
          <h2 id="drawerTitle">${esc(r.name)}</h2>
          ${r.oma ? '<p class="oma-note">Omas Original</p>' : ''}
          <p class="drawer-lede">${esc(r.kicker)}</p>
          ${metaHTML(r)}
        </div>
        <div class="drawer-art" style="--tint:${esc(r.tint)}">${cookieArt(r)}</div>
        <div class="drawer-body">
          <div class="scale-row">
            <span class="scale-label">Zutaten für <strong id="pieceCount">${pieces(r)} Stück</strong></span>
            ${portionHTML(r)}
          </div>
          ${cutterHTML(r)}
          <h3>Zutaten</h3>
          <ul class="zutaten" id="zutatenList">${ingredientHTML(r)}</ul>
          <p class="hint">Mengen beim Skalieren gerundet — Ei und Gewürze lieber nach Gefühl. Die Preise sind grobe Supermarkt-Schätzungen für alle Zutaten.</p>
          <h3>Zubereitung</h3>
          <ol class="schritte" id="schritteList">${stepsHTML(r)}</ol>
          <p class="tipp"><strong>Gut zu wissen</strong>${esc(r.tipp)}</p>
          <div class="drawer-actions">
            <button class="btn btn-primary" type="button" id="addToList">${icons.basket}Auf die Einkaufsliste</button>
            <button class="btn btn-ghost" type="button" id="printBtn">${icons.print}Rezept drucken</button>
            <button class="btn btn-ghost" type="button" id="closeDrawerBottom">Zurück zur Übersicht</button>
          </div>
        </div>
      </div>`;
  }

  let lastFocused = null;

  function openRecipe(id, updateHash = true) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;

    lastFocused = document.activeElement;
    state.open = r;
    state.scale = 1;
    state.cutter = r.ausstecher ? r.ausstecher.d : null;
    state.done = new Set();

    el.drawer.innerHTML = drawerHTML(r);
    el.drawer.classList.add('open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.backdrop.hidden = false;
    requestAnimationFrame(() => el.backdrop.classList.add('show'));
    el.body.classList.add('locked');

    if (updateHash) history.replaceState(null, '', '#rezept/' + id);
    const closeBtn = el.drawer.querySelector('#closeDrawer');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    el.drawer.querySelector('.drawer-scroll').scrollTop = 0;
  }

  function closeRecipe() {
    if (!state.open) return;
    state.open = null;
    el.drawer.classList.remove('open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.backdrop.classList.remove('show');
    el.body.classList.remove('locked');
    window.setTimeout(() => {
      if (!state.open) el.backdrop.hidden = true;
    }, 300);
    if (location.hash.startsWith('#rezept/')) {
      history.replaceState(null, '', location.pathname + location.search);
      syncPlanHash();
    }
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus({ preventScroll: true });
  }

  function updateCounts() {
    const r = state.open;
    if (!r) return;
    const n = pieces(r);
    const count = el.drawer.querySelector('#pieceCount');
    if (count) count.textContent = n + ' Stück';
    const cutterCount = el.drawer.querySelector('#cutterCount');
    if (cutterCount) cutterCount.textContent = String(n);
    const cutterD = el.drawer.querySelector('#cutterD');
    if (cutterD) cutterD.textContent = fmtCm(state.cutter);
    el.drawer.querySelectorAll('[data-scale]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.scale) === state.scale));
    });
    el.drawer.querySelectorAll('[data-step]').forEach((b) => {
      b.disabled = Number(b.dataset.step) < 0 ? n <= 1 : n >= maxPieces(r);
    });
    const metaPieces = el.drawer.querySelector('#metaPieces');
    if (metaPieces && r.stueckSchritt) metaPieces.textContent = n + ' Stück';
    const costMeta = el.drawer.querySelector('#costMeta');
    if (costMeta) {
      const cost = recipeCost(r) * state.scale;
      costMeta.textContent = `≈ ${euro(cost)} Zutaten · ${euro(cost / n)} je Stück`;
    }
    const range = el.drawer.querySelector('#cutterRange');
    if (range && Number(range.value) !== state.cutter) range.value = String(state.cutter);
  }

  function refreshIngredients() {
    const r = state.open;
    if (!r) return;
    const list = el.drawer.querySelector('#zutatenList');
    if (list) list.innerHTML = ingredientHTML(r);
    updateCounts();
  }

  function toggleItem(kind, index, node) {
    const key = kind + index;
    const on = state.done.has(key);
    if (on) state.done.delete(key); else state.done.add(key);
    node.setAttribute('aria-pressed', String(!on));
    if (kind === 'z') node.closest('li').classList.toggle('done', !on);
    else node.classList.toggle('done', !on);
  }

  /* ---------- Plätzchen-Finder ---------- */
  const TRAIT_LABELS = {
    muerbe: 'mürbe', knusprig: 'knusprig', weich: 'weich', gefuellt: 'gefüllt',
    schoko: 'Schokolade', nussig: 'Nüsse', fruchtig: 'fruchtig',
    klassisch: 'klassisch', vegan: 'vegan', dekorativ: 'dekorativ', zimtig: 'Zimt',
    waffel: 'Waffeln', pancake: 'Pancakes', gebaeck: 'Gebäck', plaetzchen: 'Plätzchen',
    neu: 'neu im Sortiment', bewaehrt: 'bewährt', guenstig: 'günstig',
    klein: 'kleine Menge', gross: 'große Menge'
  };

  const FINDER_QUESTIONS = [
    {
      q: 'Was möchtest du backen?',
      hint: 'Das ganze Sortiment: Plätzchen, Waffeln, Pancakes und Gebäcke.',
      options: [
        { label: 'Klassische Plätzchen', w: { plaetzchen: 4 } },
        { label: 'Waffeln aus dem Eisen', w: { waffel: 5 } },
        { label: 'Pancakes aus der Pfanne', w: { pancake: 5 } },
        { label: 'Gebäck aus dem Ofen: Muffins, Schnecken, Kuchen', w: { gebaeck: 4 } }
      ]
    },
    {
      q: 'Wonach ist dir heute zumute?',
      hint: 'Der Geschmack gibt den Ausschlag.',
      options: [
        { label: 'Schokolade und Kakao', w: { schoko: 3, weich: 1 } },
        { label: 'Nüsse, Mandeln, Marzipan', w: { nussig: 3 } },
        { label: 'Fruchtig und säuerlich', w: { fruchtig: 3 } },
        { label: 'Klassisch: Vanille und Zimt', w: { klassisch: 2, zimtig: 2 } }
      ]
    },
    {
      q: 'Wie soll es sich anfühlen?',
      hint: 'Mürbe zerfällt, knusprig kracht, weich gibt nach.',
      options: [
        { label: 'Mürbe und zart', w: { muerbe: 3 } },
        { label: 'Knusprig und krachend', w: { knusprig: 3 } },
        { label: 'Weich und saftig', w: { weich: 3 } },
        { label: 'Mit Füllung in der Mitte', w: { gefuellt: 3 } }
      ]
    },
    {
      q: 'Wie viel Zeit hast du?',
      hint: 'Kühlzeit rechnen wir mit.',
      options: [
        { label: 'Unter 30 Minuten', w: { schnell: 3 } },
        { label: 'Etwa eine Stunde', w: { mittelzeit: 2 } },
        { label: 'Ein ganzer Nachmittag', w: { dekorativ: 3 } },
        { label: 'Zeit ist egal', w: {} }
      ]
    },
    {
      q: 'Für welchen Anlass?',
      hint: 'Danach richtet sich, wie viel Verzierung sich lohnt.',
      options: [
        { label: 'Für uns zuhause, zum Kaffee', w: { klassisch: 1, muerbe: 1 } },
        { label: 'Für Gäste auf der Platte', w: { dekorativ: 2, gefuellt: 1 } },
        { label: 'Zum Verschenken in der Dose', w: { dekorativ: 2, muerbe: 1 } },
        { label: 'Mit Kindern backen', w: { schnell: 2, klassisch: 1 } }
      ]
    },
    {
      q: 'Muss etwas draußen bleiben?',
      hint: 'Allergien und Vorlieben.',
      options: [
        { label: 'Ohne Nüsse und Mandeln', w: { nussfrei: 3 } },
        { label: 'Ohne Ei und Butter (vegan)', w: { vegan: 4 } },
        { label: 'Ohne Schokolade', w: { schokofrei: 3 } },
        { label: 'Nein, alles erlaubt', w: { klassisch: 1 } }
      ]
    },
    {
      q: 'Wie viel Aufwand darf es sein?',
      hint: 'Von „schnell zusammengerührt“ bis „darf ruhig dauern“.',
      options: [
        { label: 'So einfach wie möglich', w: { einfach: 3 } },
        { label: 'Gerne etwas knifflig', w: { mittel: 2 } },
        { label: 'Ich darf mich austoben', w: { aufwendig: 3, dekorativ: 2 } },
        { label: 'Egal, ich nehme, was kommt', w: {} }
      ]
    },
    {
      q: 'Wie viele sollen es werden?',
      hint: 'Für eine kleine Runde oder die volle Blechdose.',
      options: [
        { label: 'Nur eine kleine Runde', w: { klein: 3 } },
        { label: 'Ein normales Blech', w: { mittelmenge: 2 } },
        { label: 'Eine große Dose für viele', w: { gross: 3 } },
        { label: 'Egal, ich backe einfach los', w: {} }
      ]
    },
    {
      q: 'Darf es günstig bleiben?',
      hint: 'Wir schätzen die Zutatenkosten pro Stück.',
      options: [
        { label: 'Ja, gern unter 10 Cent pro Stück', w: { guenstig: 3 } },
        { label: 'Hauptsache gut, der Preis ist egal', w: {} },
        { label: 'Es darf auch mal etwas Edles sein', w: { edel: 3 } }
      ]
    },
    {
      q: 'Kennst du das Rezept schon?',
      hint: 'Bewährtes oder etwas Neues ausprobieren.',
      options: [
        { label: 'Etwas Bewährtes', w: { bewaehrt: 3 } },
        { label: 'Gerne etwas Neues aus dem Sortiment', w: { neu: 4 } },
        { label: 'Überrasch mich', w: {} }
      ]
    }
  ];

  const finder = { step: 0, picks: [] };
  const fEl = {
    intro: document.getElementById('finderIntro'),
    quiz: document.getElementById('finderQuiz'),
    result: document.getElementById('finderResult'),
    start: document.getElementById('finderStart'),
    back: document.getElementById('finderBack'),
    bar: document.getElementById('finderBar'),
    count: document.getElementById('finderCount'),
    question: document.getElementById('finderQuestion'),
    options: document.getElementById('finderOptions'),
    hint: document.getElementById('finderHint')
  };

  function showFinderPanel(mode) {
    if (!fEl.intro) return;
    fEl.intro.hidden = mode !== 'intro';
    fEl.quiz.hidden = mode !== 'quiz';
    fEl.result.hidden = mode !== 'result';
  }

  function renderQuestion() {
    const item = FINDER_QUESTIONS[finder.step];
    const total = FINDER_QUESTIONS.length;
    if (!item) return;

    fEl.bar.style.width = Math.round((finder.step / total) * 100) + '%';
    fEl.count.textContent = 'Frage ' + (finder.step + 1) + ' von ' + total;
    fEl.question.textContent = item.q;
    fEl.hint.textContent = item.hint || '';
    fEl.back.hidden = finder.step === 0;
    fEl.options.innerHTML = item.options.map((o, i) => `
      <button class="finder-option" type="button" data-opt="${i}">
        <span class="dot">${i + 1}</span><span>${esc(o.label)}</span>
      </button>`).join('');
  }

  function pickOption(index) {
    finder.picks[finder.step] = index;
    if (finder.step < FINDER_QUESTIONS.length - 1) {
      finder.step += 1;
      renderQuestion();
      fEl.question.focus({ preventScroll: true });
    } else {
      renderFinderResult();
    }
  }

  // Welche Gebäcksorte ein Rezept ist – für die Inspiration neben dem Ergebnis.
  const typeOf = (r) => {
    const traits = (window.RECIPE_TRAITS && window.RECIPE_TRAITS[r.id]) || [];
    if (traits.includes('waffel')) return 'waffel';
    if (traits.includes('pancake')) return 'pancake';
    if (traits.includes('gebaeck')) return 'gebaeck';
    return 'plaetzchen';
  };

  // Harte Ausschlüsse: Wer „ohne Nüsse“ oder „vegan“ wählt, soll keine
  // Rezepte bekommen, die das nicht erfüllen.
  const FINDER_EXCLUDES = ['vegan', 'nussfrei', 'schokofrei'];

  function finderMatches() {
    const weights = {};
    FINDER_QUESTIONS.forEach((q, i) => {
      const opt = q.options[finder.picks[i]];
      if (!opt) return;
      Object.entries(opt.w).forEach(([k, v]) => { weights[k] = (weights[k] || 0) + v; });
    });
    const max = Object.values(weights).filter((v) => v > 0).reduce((a, b) => a + b, 0) || 1;

    const hitFor = (key, r, traits) => {
      if (key === 'vegan') return r.tags.includes('Vegan');
      if (key === 'einfach') return r.level === 'Einfach';
      if (key === 'mittel') return r.level === 'Mittel';
      if (key === 'aufwendig') return r.level === 'Anspruchsvoll';
      if (key === 'schnell') return totalTime(r) <= 35;
      if (key === 'mittelzeit') return totalTime(r) <= 75;
      if (key === 'nussfrei') return !traits.includes('nussig');
      if (key === 'schokofrei') return !traits.includes('schoko');
      if (key === 'plaetzchen') return !traits.includes('gebaeck') && !traits.includes('pancake');
      if (key === 'klein') return r.stueck <= 20;
      if (key === 'mittelmenge') return r.stueck > 20 && r.stueck <= 40;
      if (key === 'gross') return r.stueck >= 40;
      if (key === 'guenstig') return costPerPiece(r) <= 0.1;
      if (key === 'edel') return costPerPiece(r) >= 0.18;
      if (key === 'bewaehrt') return !!r.oma || traits.includes('klassisch');
      return traits.includes(key);
    };

    const ranked = RECIPES.map((r) => {
      const traits = (window.RECIPE_TRAITS && window.RECIPE_TRAITS[r.id]) || [];
      if (FINDER_EXCLUDES.some((key) => weights[key] && !hitFor(key, r, traits))) return null;

      let score = 0;
      const matched = [];
      Object.entries(weights).forEach(([key, value]) => {
        if (!hitFor(key, r, traits)) return;
        score += value;
        if (TRAIT_LABELS[key]) matched.push(TRAIT_LABELS[key]);
      });

      // Ein kleiner Grundwert hält auch Nischenrezepte im Rennen, damit sie
      // als Idee auftauchen können.
      return { r, score: score + 0.4, matched, pct: Math.max(1, Math.min(99, Math.round((score / max) * 100))) };
    }).filter(Boolean);

    if (!ranked.length) {
      return RECIPES.map((r) => ({ r, score: 0, matched: [], pct: 40 }))
        .sort((a, b) => totalTime(a.r) - totalTime(b.r));
    }

    return ranked.sort((a, b) => b.score - a.score || totalTime(a.r) - totalTime(b.r));
  }

  function hitHTML(match, main, label) {
    const r = match.r;
    return `
      <button class="hit${main ? ' hit-main' : ''}" type="button" data-id="${esc(r.id)}">
        <span class="hit-art" style="--tint:${esc(r.tint)}">${cookieArt(r)}</span>
        <span class="hit-copy">
          <span class="hit-badge">${label || (main ? 'Beste Passung' : 'Auch passend')} · ${match.pct} %</span>
          <span class="hit-name">${esc(r.name)}</span>
          <span class="hit-meta">${r.zeit} Min · ${r.stueck} Stück · ${esc(r.level)} · ≈ ${euro(costPerPiece(r))}/Stück</span>
          ${(main || label) && match.matched.length
            ? `<span class="hit-why">Passt wegen: ${match.matched.slice(0, 3).map(esc).join(' · ')}</span>`
            : ''}
        </span>
      </button>`;
  }

  function renderFinderResult() {
    const ranked = finderMatches();
    const total = RECIPES.length;

    const top = ranked.slice(0, 3);
    const seenTypes = new Set(top.map((m) => typeOf(m.r)));
    const ideas = ranked.slice(3).filter((m) => !seenTypes.has(typeOf(m.r))).slice(0, 2);

    fEl.result.innerHTML = `
      <p class="eyebrow"><span></span>Dein Ergebnis</p>
      <h2 class="finder-q">Das passt zu dir.</h2>
      <p class="finder-lede">Aus allen ${total} Rezepten — Plätzchen, Waffeln, Pancakes und Gebäcke — berechnet. Ein Klick öffnet Zutaten und Anleitung.</p>
      <div class="hits">
        ${hitHTML(ranked[0], true)}
        ${ranked.slice(1, 3).map((m) => hitHTML(m, false)).join('')}
      </div>
      ${ideas.length ? `<h3 class="finder-sub">Vielleicht auch eine Idee</h3>
      <div class="hits">${ideas.map((m) => hitHTML(m, false, 'Inspiration')).join('')}</div>` : ''}
      <div class="finder-actions">
        <button class="btn btn-ghost" type="button" id="finderAgain">Nochmal beantworten</button>
        <a class="btn btn-primary" href="#rezepte">Alle ${total} Rezepte</a>
      </div>`;

    showFinderPanel('result');
    fEl.result.querySelector('#finderAgain').addEventListener('click', startFinder);
    fEl.result.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('click', () => openRecipe(hit.dataset.id));
    });
    const heading = fEl.result.querySelector('h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function startFinder() {
    finder.step = 0;
    finder.picks = [];
    showFinderPanel('quiz');
    renderQuestion();
    fEl.question.focus({ preventScroll: true });
  }

  function backStep() {
    if (finder.step === 0) {
      showFinderPanel('intro');
      return;
    }
    finder.step -= 1;
    finder.picks.length = finder.step;
    renderQuestion();
    fEl.question.focus({ preventScroll: true });
  }

  if (fEl.start) {
    fEl.question.setAttribute('tabindex', '-1');
    fEl.start.addEventListener('click', startFinder);
    fEl.back.addEventListener('click', backStep);
    fEl.options.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-opt]');
      if (btn) pickOption(Number(btn.dataset.opt));
    });
  }

  /* ---------- Einkaufsliste ---------- */
  const LIST_KEY = 'kruemel-zimt-einkaufsliste-v1';

  // Reihenfolge = Reihenfolge im Supermarkt. Erster Treffer gewinnt.
  const LIST_GROUPS = [
    { title: 'Mehl & Backzutaten', words: ['mehl', 'backpulver', 'speisestärke', 'stärke', 'haferflocken', 'blätterteig', 'grieß', 'hefe'] },
    { title: 'Zucker & Süßes', words: ['zucker', 'honig', 'sirup', 'marzipan', 'nougat', 'nutella'] },
    { title: 'Schokolade & Kuvertüre', words: ['schokolade', 'kuvertüre', 'glasur', 'kakao'] },
    { title: 'Nüsse & Mandeln', words: ['mandel', 'nuss', 'haselnuss', 'walnuss', 'kokos', 'krokant'] },
    { title: 'Obst & Marmelade', words: ['konfitüre', 'marmelade', 'gelee', 'orange', 'zitrone', 'himbeer', 'johannisbeer', 'kirsche', 'aprikose', 'erdbeer', 'apfel', 'rosine', 'saft'] },
    { title: 'Fette, Eier & Milch', words: ['butter', 'margarine', 'palmin', 'frischkäse', 'sahne', 'milch', 'drink', 'eigelb', 'eiweiß', 'eier', 'ei'] },
    { title: 'Gewürze & Aromen', words: ['zimt', 'nelken', 'salz', 'vanille', 'schale', 'abrieb', 'gewürz'] }
  ];

  const listState = { items: [], done: new Set() };

  function loadList() {
    try {
      const raw = JSON.parse(localStorage.getItem(LIST_KEY) || '{}');
      const items = Array.isArray(raw.items) ? raw.items : [];
      listState.items = items
        .filter((it) => it && typeof it.id === 'string' && RECIPES.some((r) => r.id === it.id))
        .map((it) => ({ id: it.id, factor: Number(it.factor) > 0 ? Number(it.factor) : 1 }));
      listState.done = new Set(Array.isArray(raw.done) ? raw.done.filter((k) => typeof k === 'string') : []);
    } catch (err) {
      listState.items = [];
      listState.done = new Set();
    }
  }

  function saveList() {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify({ items: listState.items, done: [...listState.done] }));
    } catch (err) { /* privater Modus: Liste gilt nur für diese Sitzung */ }
  }

  // In der Liste zählt die Stückzahl, nicht der Skalierungsfaktor –
  // der ist beim Ausstecher ohnehin krumm.
  const piecesLabel = (r, factor) => fmtAmount(Math.max(1, Math.round(r.stueck * factor))) + ' Stück';

  // Umlaute angleichen, sonst findet „Nüsse“ das Stichwort „nuss“ nicht.
  const norm = (s) => String(s).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

  function groupOf(name) {
    const n = norm(name);
    for (const group of LIST_GROUPS) {
      if (group.words.some((w) => n.includes(norm(w)))) return group.title;
    }
    return 'Sonstiges';
  }

  // Gleiche Zutat (Name + Einheit) aus allen Rezepten zusammenzählen.
  function listEntries() {
    const map = new Map();

    listState.items.forEach((item) => {
      const r = RECIPES.find((x) => x.id === item.id);
      if (!r) return;
      r.zutaten.forEach((z) => {
        const key = z.n + '|' + z.u;
        const amount = (z.m || 0) * item.factor;
        const prev = map.get(key);
        if (prev) prev.m += amount;
        else map.set(key, { key, m: amount, u: z.u, n: z.n });
      });
    });

    return [...map.values()].sort((a, b) => a.n.localeCompare(b.n, 'de'));
  }

  function amountLabel(entry) {
    let amount = entry.m;
    let unit = entry.u;
    if ((unit === 'g' || unit === 'ml') && amount >= 1000) {
      // Kilo/Liter mit einer Nachkommastelle – Viertel wären hier zu grob.
      const big = Math.round((amount / 1000) * 10) / 10;
      return String(big).replace('.', ',') + ' ' + (unit === 'g' ? 'kg' : 'l');
    }
    return fmtAmount(amount) + (unit ? ' ' + unit : '');
  }

  function listMarkup() {
    const head = (sub) => `
      <div class="drawer-head list-head">
        <div class="drawer-top">
          <p class="eyebrow"><span></span>Einkaufsliste</p>
          <button class="icon-btn" id="closeList" type="button" aria-label="Einkaufsliste schließen">${icons.close}</button>
        </div>
        <h2 id="listTitle">Einkaufsliste</h2>
        <p class="drawer-lede">${sub}</p>
      </div>`;

    if (!listState.items.length) {
      return `<div class="drawer-scroll list-scroll">
        ${head('Noch ist sie leer.')}
        <div class="drawer-body">
          <p class="list-empty">Öffne ein Rezept und tippe auf <strong>Auf die Einkaufsliste</strong> — die Zutaten werden dann für dich zusammengerechnet, auch über mehrere Rezepte hinweg.</p>
          <a class="btn btn-ghost" href="#rezepte">Rezepte ansehen</a>
        </div>
      </div>`;
    }

    const recipes = listState.items.map((item) => {
      const r = RECIPES.find((x) => x.id === item.id);
      return `<button class="list-chip" type="button" data-remove="${esc(r.id)}" aria-label="${esc(r.name)} von der Liste nehmen">
        <span>${esc(r.name)}</span><b>${piecesLabel(r, item.factor)}</b>${icons.close}
      </button>`;
    }).join('');

    const entries = listEntries();
    const groups = new Map();
    entries.forEach((entry) => {
      const title = groupOf(entry.n);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(entry);
    });

    const order = LIST_GROUPS.map((g) => g.title).concat('Sonstiges');
    const groupHTML = order.filter((title) => groups.has(title)).map((title) => `
      <section class="list-group">
        <h3>${esc(title)}</h3>
        <ul class="list-items">
          ${groups.get(title).map((entry) => {
            const done = listState.done.has(entry.key);
            return `<li class="${done ? 'done' : ''}">
              <button class="tick" type="button" data-key="${esc(entry.key)}" aria-pressed="${done}"
                aria-label="${esc(entry.n)} abhaken">${icons.check}</button>
              <span><span class="amount"><b>${amountLabel(entry)}</b></span> <span class="iname">${esc(entry.n)}</span></span>
            </li>`;
          }).join('')}
        </ul>
      </section>`).join('');

    const totalCost = listState.items.reduce((sum, item) => {
      const r = RECIPES.find((x) => x.id === item.id);
      return r ? sum + recipeCost(r) * item.factor : sum;
    }, 0);

    return `<div class="drawer-scroll list-scroll">
      ${head(`${listState.items.length} ${listState.items.length === 1 ? 'Rezept' : 'Rezepte'}, ${entries.length} Zutaten — zusammen etwa ${euro(totalCost)}.`)}
      <div class="drawer-body">
        <div class="list-recipes">${recipes}</div>
        ${groupHTML}
        <div class="list-actions">
          <button class="btn btn-primary" type="button" id="printList">${icons.print}Liste drucken</button>
          <button class="btn btn-ghost" type="button" id="clearList">Liste leeren</button>
        </div>
        <p class="hint">Mengen sind auf ¼ gerundet und auf der Liste zusammengefasst, Preise grob geschätzt. Abgehakte Zutaten bleiben gespeichert.</p>
      </div>
    </div>`;
  }

  let shownListCount = 0;

  function renderList() {
    const count = listState.items.length;
    if (el.listCount) {
      el.listCount.textContent = String(count);
      el.listCount.hidden = count === 0;
      if (count !== shownListCount) {
        el.listCount.classList.remove('pop');
        void el.listCount.offsetWidth;
        if (count) el.listCount.classList.add('pop');
      }
    }
    shownListCount = count;
    if (el.listToggle) {
      el.listToggle.setAttribute('aria-label', count
        ? `Einkaufsliste mit ${count} ${count === 1 ? 'Rezept' : 'Rezepten'} öffnen`
        : 'Einkaufsliste öffnen');
    }
    if (el.listPanel && el.listPanel.classList.contains('open')) el.listPanel.innerHTML = listMarkup();
  }

  function openList() {
    if (!el.listPanel) return;
    if (state.open) closeRecipe();
    el.listPanel.innerHTML = listMarkup();
    el.listPanel.classList.add('open');
    el.listPanel.setAttribute('aria-hidden', 'false');
    el.listBackdrop.hidden = false;
    requestAnimationFrame(() => el.listBackdrop.classList.add('show'));
    el.body.classList.add('locked');
    const closeBtn = el.listPanel.querySelector('#closeList');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeList() {
    if (!el.listPanel || !el.listPanel.classList.contains('open')) return;
    el.listPanel.classList.remove('open');
    el.listPanel.setAttribute('aria-hidden', 'true');
    el.listBackdrop.classList.remove('show');
    if (!state.open) el.body.classList.remove('locked');
    window.setTimeout(() => {
      if (!el.listPanel.classList.contains('open')) el.listBackdrop.hidden = true;
    }, 300);
  }

  let toastTimer = 0;

  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.remove('show');
    void node.offsetWidth;
    node.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove('show'), 2600);
  }

  function addToList() {
    const r = state.open;
    if (!r) return;
    const factor = Math.round((pieces(r) / r.stueck) * 100) / 100;
    const existing = listState.items.find((it) => it.id === r.id);
    if (existing) existing.factor = factor;
    else listState.items.push({ id: r.id, factor });
    saveList();
    renderList();
    toast(`${r.name} auf der Einkaufsliste · ${piecesLabel(r, factor)}`);

    const btn = el.drawer.querySelector('#addToList');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = `${icons.check}Auf der Liste (${piecesLabel(r, factor)})`;
    btn.classList.add('is-added');
    window.clearTimeout(addToList.timer);
    addToList.timer = window.setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('is-added');
    }, 2400);
  }

  function printList() {
    el.body.classList.add('print-list');
    window.print();
    window.setTimeout(() => el.body.classList.remove('print-list'), 600);
  }

  if (el.listToggle) {
    loadList();
    renderList();

    el.listToggle.addEventListener('click', openList);
    el.listBackdrop.addEventListener('click', closeList);

    el.listPanel.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (remove) {
        listState.items = listState.items.filter((it) => it.id !== remove.dataset.remove);
        saveList();
        renderList();
        return;
      }

      const tick = e.target.closest('.tick');
      if (tick) {
        const key = tick.dataset.key;
        if (listState.done.has(key)) listState.done.delete(key);
        else listState.done.add(key);
        saveList();
        renderList();
        return;
      }

      if (e.target.closest('#closeList')) { closeList(); return; }
      if (e.target.closest('#printList')) { printList(); return; }
      if (e.target.closest('#clearList')) {
        listState.items = [];
        listState.done = new Set();
        saveList();
        renderList();
        return;
      }
      if (e.target.closest('a[href^="#"]')) closeList();
    });
  }

  /* ---------- Backplan ---------- */
  const PLAN_KEY = 'keksdose-backplan-v1';

  // Was in der Küche steht, verändert die Zeiten im Plan.
  const GEAR = [
    { key: 'mixer', label: 'Handmixer', hint: 'Rührt den Teig schneller' },
    { key: 'freezer', label: 'Gefrierschrank', hint: 'Halbiert die Kühlzeit' },
    { key: 'convection', label: 'Umluft', hint: 'Backt kürzer und 20 °C kühler' },
    { key: 'scale', label: 'Küchenwaage', hint: 'Zutaten genau abwiegen' },
    { key: 'cutters', label: 'Ausstecher', hint: 'Für Ausstech-Plätzchen' },
    { key: 'piping', label: 'Spritzbeutel', hint: 'Für Spritzgebäck' }
  ];
  const GEAR_DEFAULT = ['mixer', 'scale'];

  // Wie viel Zeit am Tisch bleibt: Tempo und helfende Hände.
  const TEMPO = [
    { key: 'gemuetlich', label: 'Gemütlich', factor: 1.2, hint: 'Mit Ruhe zwischen den Schritten' },
    { key: 'normal', label: 'Normal', factor: 1, hint: 'Entspannt, aber zügig' },
    { key: 'zuegig', label: 'Zügig', factor: 0.85, hint: 'Alles in einem Rutsch' }
  ];
  const TEMPO_DEFAULT = 'normal';
  const FACTORS = [0.5, 1, 2];

  const TRAY_PIECES = 24;   // so viele Plätzchen passen auf ein normales Blech
  const COOL_MIN = 15;
  const PACK_MIN = 5;
  const RETEMP_MIN = 5;     // Ofen auf eine andere Temperatur umstellen
  const PREHEAT_MIN = 10;

  // Vorschläge für die Schnellauswahl: bewusst gemischt, damit ein Nachmittag
  // nicht nur aus einer Teigart besteht.
  const PLAN_PRESETS = [
    { key: 'omas', label: 'Omas Klassiker', hint: 'Vier Sorten für die Blechdose', ids: ['vanillekipferl', 'zimtsterne', 'spritzgebaeck', 'heidesand'] },
    { key: 'schnell', label: 'Schnelle Runde', hint: 'Drei Sorten ohne Wartezeit', ids: ['vegane-hafer-kekse', 'kokosmakronen', 'haferflockenkekse'] },
    { key: 'schoko', label: 'Schoko & Nuss', hint: 'Drei Sorten für Naschkatzen', ids: ['spritzgebaeck', 'brownie-cookies', 'schoko-nuss-cookies'] },
    { key: 'fruehstueck', label: 'Waffeln & Pancakes', hint: 'Frühstück und Kaffeetafel', ids: ['herzwaffeln', 'buttermilch-pancakes', 'apfel-waffeln'] }
  ];

  // Zwei Wege durch den Backtag: eine Sorte in Ruhe oder mehrere parallel.
  const PLAN_MODES = {
    einfach: {
      label: 'Einfach',
      note: 'Einfach: ein Rezept, ein Blech im Ofen, gemütliches Tempo. Team, Pause und Zielzeit sind hier bewusst ausgeblendet — die Zeiten sind mit Luft gerechnet.'
    },
    erweitert: {
      label: 'Erweitert',
      note: 'Erweitert: mehrere Sorten parallel, Bleche zusammen im Ofen, dazu Team, Tempo, Pause und Zielzeit.'
    }
  };

  const plan = {
    ids: [],
    mode: 'erweitert',   // 'einfach' = eine Sorte, Blech für Blech
    start: '14:00',
    query: '',
    gear: new Set(GEAR_DEFAULT),
    step: 0,
    capacity: 1,        // Bleche gleichzeitig im Ofen
    helpers: 1,         // Personen am Tisch
    tempo: TEMPO_DEFAULT,
    pauseAt: '',
    pauseMin: 0,
    deadline: '',
    factors: {},        // Rezept-ID -> 0.5 | 1 | 2
    skip: new Set()     // Rezepte ohne Fertigstellen (Glasur, Füllung)
  };

  const pEl = {
    options: document.getElementById('planOptions'),
    output: document.getElementById('planOutput'),
    search: document.getElementById('planSearch'),
    start: document.getElementById('planStart'),
    count: document.getElementById('planCount'),
    mix: document.getElementById('planChips'),
    clear: document.getElementById('planClear'),
    gearChips: document.getElementById('planGearChips'),
    gearNote: document.getElementById('planGearNote'),
    capacity: document.getElementById('planCapacity'),
    helpers: document.getElementById('planHelpers'),
    tempo: document.getElementById('planTempo'),
    pauseAt: document.getElementById('planPauseAt'),
    pauseMin: document.getElementById('planPauseMin'),
    deadline: document.getElementById('planDeadline'),
    deadlineClear: document.getElementById('planDeadlineClear'),
    presets: document.getElementById('planPresets'),
    modes: document.getElementById('planModes'),
    modeNote: document.getElementById('planModeNote'),
    tune: document.getElementById('planTune'),
    now: document.getElementById('planNow')
  };

  const parseClock = (value) => {
    const hit = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return hit ? Number(hit[1]) * 60 + Number(hit[2]) : null;
  };

  const factorValue = (value) => {
    const n = Number(value);
    return FACTORS.includes(n) ? n : 1;
  };
  const factorOf = (id) => factorValue(plan.factors[id]);

  const isSimple = () => plan.mode === 'einfach';

  // Der einfache Modus rechnet mit einem Blech, allein am Tisch und gemütlichem
  // Tempo. Die Regler bleiben für den erweiterten Modus gespeichert.
  const tempoEntry = () => TEMPO.find((t) => t.key === (isSimple() ? 'gemuetlich' : plan.tempo)) || TEMPO[1];
  const effectiveCapacity = () => (isSimple() ? 1 : Math.max(1, Math.min(3, Number(plan.capacity) || 1)));

  function loadPlan() {
    try {
      const raw = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}');
      if (Array.isArray(raw.ids)) plan.ids = raw.ids.filter((id) => RECIPES.some((r) => r.id === id));
      if (typeof raw.start === 'string' && parseClock(raw.start) !== null) plan.start = raw.start;
      if (Array.isArray(raw.gear)) plan.gear = new Set(raw.gear.filter((k) => GEAR.some((g) => g.key === k)));
      if (Number.isInteger(raw.step) && raw.step >= 0) plan.step = raw.step;
      if (Number.isInteger(raw.capacity)) plan.capacity = Math.max(1, Math.min(3, raw.capacity));
      if (Number.isInteger(raw.helpers)) plan.helpers = Math.max(1, Math.min(3, raw.helpers));
      if (TEMPO.some((t) => t.key === raw.tempo)) plan.tempo = raw.tempo;
      if (raw.mode === 'einfach' || raw.mode === 'erweitert') plan.mode = raw.mode;
      if (typeof raw.pauseAt === 'string' && parseClock(raw.pauseAt) !== null) plan.pauseAt = raw.pauseAt;
      if (Number.isFinite(raw.pauseMin)) plan.pauseMin = Math.max(0, Math.min(90, Math.round(raw.pauseMin)));
      if (typeof raw.deadline === 'string' && parseClock(raw.deadline) !== null) plan.deadline = raw.deadline;
      if (raw.factors && typeof raw.factors === 'object') {
        plan.factors = {};
        Object.entries(raw.factors).forEach(([id, value]) => {
          if (plan.ids.includes(id) && factorValue(value) !== 1) plan.factors[id] = factorValue(value);
        });
      }
      if (Array.isArray(raw.skip)) plan.skip = new Set(raw.skip.filter((id) => plan.ids.includes(id)));
    } catch (err) { /* ohne Speicher startet der Plan leer */ }
  }

  function savePlan() {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify({
        ids: plan.ids,
        mode: plan.mode,
        start: plan.start,
        gear: [...plan.gear],
        step: plan.step,
        capacity: plan.capacity,
        helpers: plan.helpers,
        tempo: plan.tempo,
        pauseAt: plan.pauseAt,
        pauseMin: plan.pauseMin,
        deadline: plan.deadline,
        factors: plan.factors,
        skip: [...plan.skip]
      }));
    } catch (err) { /* Sitzung genügt */ }
    syncPlanHash();
  }

  // Der Plan steckt auch in der Adresse: so lässt er sich weitergeben und
  // beim nächsten Besuch aus dem Link wiederherstellen.
  const PLAN_HASH = /^#plan\?(.*)$/;

  function planLink() {
    const ids = plan.ids.map(encodeURIComponent).join(',');
    const gear = GEAR.filter((g) => plan.gear.has(g.key)).map((g) => g.key).join(',');
    const parts = [`ids=${ids}`, `start=${encodeURIComponent(plan.start)}`, `gear=${gear}`];
    // Im einfachen Modus stecken nur Sorte, Start und Ausstattung im Link.
    if (isSimple()) {
      parts.push('modus=einfach');
    } else {
      if (plan.capacity !== 1) parts.push(`cap=${plan.capacity}`);
      if (plan.helpers !== 1) parts.push(`team=${plan.helpers}`);
      if (plan.tempo !== TEMPO_DEFAULT) parts.push(`tempo=${encodeURIComponent(plan.tempo)}`);
      if (plan.pauseMin > 0 && plan.pauseAt) parts.push(`pause=${encodeURIComponent(plan.pauseAt)},${plan.pauseMin}`);
      if (plan.deadline) parts.push(`ziel=${encodeURIComponent(plan.deadline)}`);
    }
    const amounts = plan.ids
      .filter((id) => factorOf(id) !== 1)
      .map((id) => `${encodeURIComponent(id)}:${factorOf(id)}`);
    if (amounts.length) parts.push(`menge=${amounts.join(',')}`);
    const skips = plan.ids.filter((id) => plan.skip.has(id));
    if (skips.length) parts.push(`ohne=${skips.map(encodeURIComponent).join(',')}`);
    return `${location.origin}${location.pathname}${location.search}#plan?${parts.join('&')}`;
  }

  function syncPlanHash() {
    if (location.hash.startsWith('#rezept/')) return;
    if (!plan.ids.length) {
      if (PLAN_HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    history.replaceState(null, '', planLink());
  }

  function applyPlanHash() {
    const hit = location.hash.match(PLAN_HASH);
    if (!hit) return false;
    const params = new URLSearchParams(hit[1]);
    const ids = (params.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const valid = [...new Set(ids.filter((id) => RECIPES.some((r) => r.id === id)))];
    if (!valid.length) return false;
    plan.mode = params.get('modus') === 'einfach' ? 'einfach' : 'erweitert';
    plan.ids = isSimple() ? valid.slice(0, 1) : valid;
    const start = params.get('start') || '';
    if (parseClock(start) !== null) plan.start = start;
    if (params.has('gear')) {
      const keys = (params.get('gear') || '').split(',').map((s) => s.trim()).filter(Boolean);
      plan.gear = new Set(keys.filter((k) => GEAR.some((g) => g.key === k)));
    }
    const cap = Number(params.get('cap'));
    if (Number.isInteger(cap) && cap >= 1 && cap <= 3) plan.capacity = cap;
    const team = Number(params.get('team'));
    if (Number.isInteger(team) && team >= 1 && team <= 3) plan.helpers = team;
    const tempo = params.get('tempo') || '';
    if (TEMPO.some((t) => t.key === tempo)) plan.tempo = tempo;

    const pause = (params.get('pause') || '').split(',');
    if (parseClock(pause[0]) !== null) plan.pauseAt = pause[0];
    const pauseMin = Number(pause[1]);
    if (Number.isFinite(pauseMin) && pauseMin > 0) plan.pauseMin = Math.min(90, Math.round(pauseMin));

    const ziel = params.get('ziel') || '';
    if (parseClock(ziel) !== null) plan.deadline = ziel;

    plan.factors = {};
    (params.get('menge') || '').split(',').forEach((pair) => {
      const [id, value] = pair.split(':');
      if (!plan.ids.includes(id)) return;
      const f = factorValue(value);
      if (f !== 1) plan.factors[id] = f;
    });

    plan.skip = new Set((params.get('ohne') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => plan.ids.includes(id)));

    plan.step = 0;
    return true;
  }

  function printPlan() {
    if (!pEl.output || !planSchedule(plan.ids)) return;
    const body = el.body;
    const cleanup = () => body.classList.remove('print-plan');
    body.classList.add('print-plan');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  function copyPlanLink(btn) {
    const link = planLink();
    const done = (ok) => {
      const label = btn.textContent;
      btn.textContent = ok ? 'Link kopiert' : 'Link in der Adresse';
      btn.classList.toggle('is-added', ok);
      window.setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove('is-added');
      }, 2400);
      if (!ok) window.prompt('Plan-Link kopieren:', link);
    };

    const fallback = () => {
      const field = document.createElement('textarea');
      field.value = link;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      el.body.appendChild(field);
      field.select();
      let ok = false;
      try { ok = typeof document.execCommand === 'function' && document.execCommand('copy'); } catch (err) { ok = false; }
      field.remove();
      done(ok);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => done(true), fallback);
    } else {
      fallback();
    }
  }

  // Die Zeiten als Kalenderdatei: Erinnerungen landen dort, wo der Wecker klingelt.
  function downloadPlan() {
    const schedule = planSchedule(plan.ids);
    if (!schedule) return;
    const day = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = (mins) => {
      const m = ((Math.round(mins) % 1440) + 1440) % 1440;
      return `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
    };
    const icsText = (s) => String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Keksdose//Backplan//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Keksdose-Backplan'
    ];
    schedule.events.forEach((event, i) => {
      const copy = PLAN_STEP[event.type](event);
      lines.push(
        'BEGIN:VEVENT',
        `UID:keksdose-${day.getTime()}-${i}@keksdose.local`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
        `DTSTART:${stamp(event.at)}`,
        `DTEND:${stamp(event.at + Math.max(1, event.dur || 1))}`,
        `SUMMARY:${icsText(copy.title)}`,
        `DESCRIPTION:${icsText(copy.detail)}`,
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');

    const text = lines.join('\r\n');
    const name = `keksdose-backplan-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.ics`;
    const link = document.createElement('a');
    link.download = name;
    if (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined') {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else {
      link.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  const clock = (mins) => {
    const m = ((Math.round(mins) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  function startMinutes() {
    const parsed = parseClock(plan.start);
    return parsed === null ? 14 * 60 : parsed;
  }

  const durationLabel = (mins) => {
    const h = Math.floor(mins / 60);
    const rest = mins % 60;
    if (!h) return `${rest} Min`;
    return `${h} Std${rest ? ' ' + rest + ' Min' : ''}`;
  };

  // Helfende Hände und Tempo wirken auf alles, was mit den Händen passiert.
  // Rühren lässt sich weniger parallelisieren als Bleche belegen.
  function handScale(perHelper) {
    const team = 1 + perHelper * Math.max(0, plan.helpers - 1);
    return tempoEntry().factor / team;
  }

  const piecesFor = (r) => Math.max(1, Math.round(r.stueck * factorOf(r.id)));

  // Die Rezeptzeit umfasst Rühren und Backen. Für den Plan teilen wir sie auf:
  // geknetet wird meist länger als gebacken.
  function phaseTimes(r) {
    const factor = factorOf(r.id);
    const base = r.level === 'Einfach' ? 15 : r.level === 'Mittel' ? 20 : 28;
    const prepBase = Math.max(10, Math.min(base, Math.round(r.zeit * 0.6)));
    const bakeBase = Math.max(6, r.zeit - prepBase);
    // Ohne Mixer dauert das Rühren länger, mit Umluft backt es kürzer,
    // im Gefrierschrank halbiert sich die Kühlzeit. Die doppelte Menge
    // braucht etwas länger, aber nicht doppelt so lang.
    const mixer = plan.gear.has('mixer') ? 1 : 1.35;
    const amount = 1 + 0.15 * (factor - 1);
    const prep = Math.max(4, Math.round(prepBase * mixer * amount * handScale(0.35)));
    const bake = plan.gear.has('convection') ? Math.max(5, Math.round(bakeBase * 0.85)) : bakeBase;
    const chill = r.kuehl && plan.gear.has('freezer')
      ? Math.max(20, Math.round((r.kuehl / 2) / 5) * 5)
      : (r.kuehl || 0);
    return { prep, bake, chill, factor, pieces: piecesFor(r) };
  }

  function gearSummary() {
    const active = GEAR.filter((g) => plan.gear.has(g.key)).map((g) => g.label);
    if (!active.length) return 'ohne Ausstattung gerechnet: mehr Zeit zum Rühren, volle Kühlzeit';
    return `Zeiten angepasst an ${active.join(', ')}`;
  }

  function planSettingsSummary() {
    if (isSimple()) return 'einfacher Modus · ein Rezept · ein Blech im Ofen · gemütlich';
    const bits = [
      plan.capacity === 1 ? 'ein Blech im Ofen' : `${plan.capacity} Bleche gleichzeitig`,
      plan.helpers === 1 ? 'allein am Tisch' : `zu ${plan.helpers} am Tisch`,
      tempoEntry().label.toLowerCase()
    ];
    if (plan.pauseMin > 0 && plan.pauseAt) bits.push(`${plan.pauseMin} Min Pause ab ${plan.pauseAt}`);
    return bits.join(' · ');
  }

  // Ein Nachmittag in Stationen: erst alle Teige, dann Blech für Blech,
  // zum Schluss alles zusammen auskühlen, fertigstellen und verpacken.
  const PHASES = [
    { key: 'dough', label: 'Teige anrühren', hint: 'Erst alles rühren, was du brauchst — der Teig mit der längsten Kühlzeit zuerst. Der Ofen heizt zum Schluss vor.' },
    { key: 'bake', label: 'Blech für Blech', hint: 'Was in den Ofen passt, backt zusammen. Das nächste Blech wird in der Zwischenzeit vorbereitet — so bleibt der Ofen nie leer.' },
    { key: 'pause', label: 'Pause', hint: 'Der Plan hält an. Tee holen, Hände waschen, durchatmen — danach geht es weiter.' },
    { key: 'cool', label: 'Auskühlen', hint: 'Alles aufs Gitter. Erst ganz kalte Plätzchen werden glasiert oder gefüllt.' },
    { key: 'finish', label: 'Fertigstellen', hint: 'Füllen, zusammenkleben, glasieren oder bestreuen — jetzt alles in einem Rutsch.' },
    { key: 'pack', label: 'Verpacken', hint: 'In die Dose schichten, Backpapier zwischen die Lagen.' }
  ];
  const PHASE_ORDER = Object.fromEntries(PHASES.map((p, i) => [p.key, i]));

  const traysFor = (r) => Math.max(1, Math.ceil(piecesFor(r) / TRAY_PIECES));

  // Ausrollen, ausstechen und belegen dauert je Blech etwa so lange.
  function sheetMinutes(r) {
    const base = r.ausstecher ? 12 : r.id === 'spritzgebaeck' ? 9 : 10;
    return Math.max(4, Math.round(base * handScale(0.6)));
  }

  // Was nach dem Backen noch passiert, steht im letzten Rezeptschritt.
  function finishTag(r) {
    const text = r.schritte.join(' ').toLowerCase();
    if (/zusammenkleben|zusammenklappen|zusammenlegen|füllen|füllung/.test(text)) return 'füllen';
    if (/glasier|glasur|zuckerguss|kuvertüre|bestreich|bestreuen|verzier/.test(text)) return 'glasieren';
    return 'sortieren';
  }

  function finishMinutes(r) {
    if (plan.skip.has(r.id)) return 0;
    const base = finishTag(r) === 'sortieren' ? 4 : 7;
    return Math.max(2, Math.round(base * handScale(0.6)));
  }

  const packMinutes = () => Math.max(3, Math.round(PACK_MIN * handScale(0.6)));

  function planSchedule(ids) {
    const items = ids
      .map((id) => {
        const r = RECIPES.find((x) => x.id === id);
        return r ? { r, ...phaseTimes(r) } : null;
      })
      .filter(Boolean);
    if (!items.length) return null;

    const startAt = startMinutes();
    const capacity = effectiveCapacity();
    const events = [];

    // 1) Alle Teige hintereinander anrühren, der mit der längsten Kühlzeit zuerst.
    const byChill = [...items].sort((a, b) =>
      b.chill - a.chill || b.prep - a.prep || a.r.name.localeCompare(b.r.name, 'de'));
    let t = startAt;
    byChill.forEach((item) => {
      item.prepStart = t;
      item.prepEnd = t + item.prep;
      item.ready = item.prepEnd + item.chill;
      events.push({ at: item.prepStart, phase: 'dough', type: 'prep', dur: item.prep, item });
      t = item.prepEnd;
    });
    const doughEnd = t;

    // Der Ofen heizt vor, während der letzte Teig gerührt wird.
    const firstReady = Math.min(...items.map((i) => i.ready));
    const preheatAt = Math.max(startAt, Math.min(doughEnd, firstReady) - PREHEAT_MIN);
    const ovenReady = preheatAt + PREHEAT_MIN;
    events.push({ at: preheatAt, phase: 'dough', type: 'oven', dur: PREHEAT_MIN });

    // 2) Blech für Blech: ausrollen, backen, und währenddessen das nächste Blech.
    const trays = [];
    [...items]
      .sort((a, b) => a.ready - b.ready || a.r.name.localeCompare(b.r.name, 'de'))
      .forEach((item) => {
        const n = traysFor(item.r);
        for (let i = 0; i < n; i += 1) trays.push({ item, index: i, count: n });
      });

    let free = doughEnd;   // ab hier bist du mit dem Rühren durch
    let ovenFree = ovenReady;
    let ovenTemp = null;
    let firstSheetAt = null;
    let firstBakeAt = null;
    let pending = [...trays];
    let rounds = 0;

    while (pending.length) {
      const head = pending.shift();
      const temp = bakeTemp(head.item.r);
      // Was gleichzeitig in den Ofen passt und dieselbe Temperatur braucht,
      // backt in einem Rutsch.
      const batch = [head];
      while (pending.length && batch.length < capacity && bakeTemp(pending[0].item.r) === temp) {
        batch.push(pending.shift());
      }

      const prepStart = Math.max(free, ...batch.map((tray) => tray.item.ready));
      const forming = batch.reduce((sum, tray) => sum + sheetMinutes(tray.item.r), 0);
      const prepEnd = prepStart + forming;
      const retemp = ovenTemp !== null && temp !== null && temp !== ovenTemp;
      const retempMin = retemp ? RETEMP_MIN : 0;
      const ovenWait = Math.max(0, ovenFree - prepEnd);
      const bakeAt = prepEnd + ovenWait + retempMin;
      // Zwei Bleche auf einmal brauchen ein bis zwei Minuten länger.
      const bakeDur = Math.max(...batch.map((tray) => tray.item.bake)) + (batch.length > 1 ? 2 : 0);
      const bakeEnd = bakeAt + bakeDur;
      const next = pending[0] || null;

      if (firstSheetAt === null) firstSheetAt = prepStart;
      if (firstBakeAt === null) firstBakeAt = bakeAt;
      events.push({
        at: prepStart,
        phase: 'bake',
        type: 'sheet',
        dur: bakeDur,
        item: batch[0].item,
        batch,
        tray: head.index + 1,
        trays: head.count,
        temp,
        ovenWas: ovenTemp,
        bakeAt,
        bakeEnd,
        retemp,
        retempMin,
        wait: ovenWait,
        formMin: forming,
        next: next ? { tray: next.index + 1, name: next.item.r.name } : null
      });

      // Im einfachen Modus wird erst belegt, wenn der Ofen wieder frei ist:
      // ein Blech nach dem anderen, ohne Pipeline.
      free = isSimple() ? bakeEnd : prepEnd;
      ovenFree = bakeEnd;
      if (temp !== null) ovenTemp = temp;
      rounds += 1;
    }

    const lastBakeEnd = ovenFree;

    // 3) Erst alles auskühlen, dann zusammen fertigstellen, zuletzt verpacken.
    events.push({ at: lastBakeEnd, phase: 'cool', type: 'cool', dur: COOL_MIN, item: null });
    const coolEnd = lastBakeEnd + COOL_MIN;

    let finishAt = coolEnd;
    items.forEach((item) => {
      const dur = finishMinutes(item.r);
      if (!dur) return;   // "nur backen": keine Glasur, keine Füllung
      events.push({ at: finishAt, phase: 'finish', type: 'finish', dur, item, tag: finishTag(item.r) });
      finishAt += dur;
    });

    const packDur = packMinutes();
    events.push({ at: finishAt, phase: 'pack', type: 'pack', dur: packDur, item: null });

    let end = finishAt + packDur;
    let ovenFrom = firstBakeAt === null ? doughEnd : firstBakeAt;
    let ovenTo = lastBakeEnd;

    // 4) Pause: Der Plan hält an der nächsten geplanten Tätigkeit an, damit
    // nichts mitten im Ausrollen stehen bleibt.
    const pauseWanted = isSimple() ? null : parseClock(plan.pauseAt);
    const pauseLen = Math.max(0, Math.min(90, Math.round(Number(plan.pauseMin) || 0)));
    let pauseInfo = null;
    if (pauseWanted !== null && pauseLen > 0 && pauseWanted >= startAt && pauseWanted < end) {
      const anchor = Math.min(...events.filter((e) => e.at >= pauseWanted).map((e) => e.at));
      events.forEach((e) => {
        if (e.at >= anchor) e.at += pauseLen;
        if (typeof e.bakeAt === 'number' && e.bakeAt >= anchor) e.bakeAt += pauseLen;
        if (typeof e.bakeEnd === 'number' && e.bakeEnd >= anchor) e.bakeEnd += pauseLen;
      });
      events.push({ at: anchor, phase: 'pause', type: 'pause', dur: pauseLen, item: null });
      pauseInfo = { at: anchor, dur: pauseLen };
      end += pauseLen;
      if (ovenTo >= anchor) ovenTo += pauseLen;
      if (ovenFrom >= anchor) ovenFrom += pauseLen;
    }

    events.sort((a, b) => a.at - b.at || PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);

    const stages = PHASES
      .map((phase) => {
        const list = events.filter((e) => e.phase === phase.key);
        if (!list.length) return null;
        const from = Math.min(...list.map((e) => e.at));
        const to = Math.max(...list.map((e) => e.at + (e.dur || 0)));
        return { ...phase, events: list, from, to };
      })
      .filter(Boolean)
      .sort((a, b) => a.from - b.from || PHASE_ORDER[a.key] - PHASE_ORDER[b.key]);

    const handsOn = items.reduce((sum, i) => sum + i.prep, 0)
      + trays.reduce((sum, tray) => sum + sheetMinutes(tray.item.r), 0)
      + items.reduce((sum, i) => sum + finishMinutes(i.r), 0)
      + PREHEAT_MIN + packDur;

    return {
      events,
      stages,
      start: startAt,
      end,
      ovenFrom,
      ovenTo,
      handsOn,
      pieces: items.reduce((sum, i) => sum + i.pieces, 0),
      trays: trays.length,
      rounds,
      count: items.length,
      pause: pauseInfo
    };
  }

  function deadlineInfo(schedule) {
    if (isSimple()) return null;   // im einfachen Modus gibt es keine Zielzeit
    const target = parseClock(plan.deadline);
    if (target === null || !schedule) return null;
    const diff = target - schedule.end;
    const latest = schedule.start + diff;
    return { target, diff, latest, fits: diff >= 0, reachable: latest >= 0 };
  }

  const PLAN_STEP = {
    prep: (event) => ({
      title: `${event.item.r.name} anrühren`,
      detail: `ca. ${event.dur} Min · ${event.item.pieces} Stück${event.item.factor !== 1 ? ` · ${event.item.factor}× Menge` : ''}${event.item.chill ? ` · danach ${event.item.chill} Min kühlen` : ''}`
    }),
    oven: (event) => ({
      title: 'Ofen vorheizen',
      detail: `ca. ${event.dur} Min · Temperatur steht beim ersten Blech`
    }),
    sheet: (event) => {
      const batch = event.batch && event.batch.length
        ? event.batch
        : [{ item: event.item, index: event.tray - 1, count: event.trays }];
      const label = batch.length > 1
        ? `Bleche ${batch.map((tray) => tray.index + 1).join(' + ')} von ${event.trays}`
        : `Blech ${event.tray} von ${event.trays}`;
      const names = [...new Set(batch.map((tray) => tray.item.r.name))].join(' + ');
      return {
        title: `${names} · ${label}`,
        detail: `Ofen ${clock(event.bakeAt)}–${clock(event.bakeEnd)} · ${event.dur} Min${event.temp ? ` bei ${event.temp} °C` : ''} · formen ca. ${event.formMin} Min davor`
      };
    },
    pause: (event) => ({
      title: 'Pause',
      detail: `ca. ${event.dur} Min · Tee holen, Hände waschen, durchatmen`
    }),
    cool: (event) => ({
      title: 'Alles aufs Gitter',
      detail: `${event.dur} Min abkühlen · erst ganz kalt wird glasiert`
    }),
    finish: (event) => ({
      title: `${event.item.r.name} ${event.tag}`,
      detail: `ca. ${event.dur} Min · zusammen mit den anderen Sorten`
    }),
    pack: (event) => ({
      title: 'In die Dose schichten',
      detail: `${event.dur} Min · Backpapier zwischen die Lagen`
    })
  };

  function planStepHTML(event) {
    const copy = PLAN_STEP[event.type](event);
    const whileLine = event.type === 'sheet' && event.next && !isSimple()
      ? `<em class="plan-while">Ofen läuft: in der Zeit Blech ${event.next.tray} (${esc(event.next.name)}) vorbereiten.</em>`
      : '';
    return `<li class="plan-step plan-${event.type}">
      <span class="plan-box" aria-hidden="true"></span>
      <span class="plan-time">${clock(event.at)}</span>
      <span class="plan-node" aria-hidden="true"></span>
      <span class="plan-copy">
        <b>${esc(copy.title)}</b>
        <small>${esc(copy.detail)}</small>
        ${whileLine}
      </span>
    </li>`;
  }

  // Im einfachen Modus klingen die Stationshinweise ruhiger — ohne Pipeline.
  const SIMPLE_STAGE_HINTS = {
    dough: 'Ein Teig in Ruhe, der Ofen heizt rechtzeitig vor. Du musst nichts gleichzeitig machen.',
    bake: 'Ein Blech nach dem anderen. Dazwischen ist Zeit zum Durchatmen — der Plan wartet auf dich.'
  };

  function planStageHTML(stage, index) {
    const hint = isSimple() && SIMPLE_STAGE_HINTS[stage.key] ? SIMPLE_STAGE_HINTS[stage.key] : stage.hint;
    return `<li class="plan-stage" data-phase="${esc(stage.key)}">
      <div class="plan-stage-head">
        <span class="plan-stage-num" aria-hidden="true">${index + 1}</span>
        <h3>${esc(stage.label)}</h3>
        <span class="plan-stage-time">${clock(stage.from)}–${clock(stage.to)} · ${durationLabel(stage.to - stage.from)}</span>
      </div>
      <p class="plan-stage-hint">${esc(hint)}</p>
      <ol class="plan-steps">${stage.events.map(planStepHTML).join('')}</ol>
    </li>`;
  }

  function updatePlanCount() {
    if (!pEl.count) return;
    const n = plan.ids.length;
    pEl.count.textContent = n
      ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} gewählt`
      : 'noch nichts gewählt';
  }

  function renderPlanGear() {
    if (pEl.gearChips) {
      pEl.gearChips.innerHTML = GEAR.map((g) => `
        <label class="gear-chip" title="${esc(g.hint)}">
          <input type="checkbox" data-gear="${esc(g.key)}"${plan.gear.has(g.key) ? ' checked' : ''}>
          <span>${esc(g.label)}</span>
        </label>`).join('');
    }
    if (pEl.gearNote) pEl.gearNote.textContent = gearSummary();
  }

  function renderPlanTune() {
    if (pEl.capacity) pEl.capacity.value = String(plan.capacity);
    if (pEl.helpers) pEl.helpers.value = String(plan.helpers);
    if (pEl.tempo) pEl.tempo.value = plan.tempo;
    if (pEl.pauseAt) pEl.pauseAt.value = plan.pauseAt;
    if (pEl.pauseMin) pEl.pauseMin.value = String(plan.pauseMin);
    if (pEl.deadline) pEl.deadline.value = plan.deadline;
    if (pEl.start) pEl.start.value = plan.start;
  }

  function renderPlanPresets() {
    if (!pEl.presets) return;
    pEl.presets.innerHTML = PLAN_PRESETS.map((preset) => `
      <button class="plan-preset" type="button" data-preset="${esc(preset.key)}">
        <b>${esc(preset.label)}</b><small>${esc(preset.hint)}</small>
      </button>`).join('');
  }

  function renderPlanModes() {
    if (pEl.modes) {
      pEl.modes.querySelectorAll('[data-mode]').forEach((btn) => {
        const on = btn.dataset.mode === plan.mode;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-checked', String(on));
      });
    }
    if (pEl.modeNote) pEl.modeNote.textContent = (PLAN_MODES[plan.mode] || PLAN_MODES.erweitert).note;
    if (pEl.presets) pEl.presets.hidden = isSimple();
    if (pEl.tune) pEl.tune.hidden = isSimple();
  }

  function setPlanMode(mode) {
    if (!PLAN_MODES[mode] || mode === plan.mode) return;
    plan.mode = mode;
    plan.step = 0;
    if (isSimple() && plan.ids.length > 1) {
      const keep = plan.ids[0];
      plan.ids = [keep];
      Object.keys(plan.factors).forEach((id) => { if (id !== keep) delete plan.factors[id]; });
      [...plan.skip].forEach((id) => { if (id !== keep) plan.skip.delete(id); });
      const kept = RECIPES.find((r) => r.id === keep);
      toast(`Einfach backt eine Sorte: ${kept ? kept.name : 'das erste Rezept'} bleibt im Plan.`);
    }
    savePlan();
    renderPlanModes();
    renderPlanOptions();
    renderPlanMix();
    renderPlan();
  }

  function renderPlanMix() {
    if (!pEl.mix) return;
    const chosen = plan.ids
      .map((id) => RECIPES.find((r) => r.id === id))
      .filter(Boolean);
    pEl.mix.hidden = chosen.length === 0;
    pEl.mix.innerHTML = chosen.map((r) => {
      const f = factorOf(r.id);
      const n = traysFor(r);
      return `<div class="plan-mix-row">
        <span class="plan-dot" style="background:${esc(r.dough)}" aria-hidden="true"></span>
        <span class="plan-mix-name"><b>${esc(r.name)}</b><small>${piecesFor(r)} Stück · ${n} ${n === 1 ? 'Blech' : 'Bleche'}</small></span>
        <select data-plan-factor="${esc(r.id)}" aria-label="Menge für ${esc(r.name)}">
          ${FACTORS.map((value) => `<option value="${value}"${value === f ? ' selected' : ''}>${value === 0.5 ? '½×' : value + '×'}</option>`).join('')}
        </select>
        <label class="plan-mix-skip" title="Ohne Glasur, Füllung oder Verzieren einplanen">
          <input type="checkbox" data-plan-skip="${esc(r.id)}"${plan.skip.has(r.id) ? ' checked' : ''}> nur backen
        </label>
        <button class="plan-mix-remove" type="button" data-plan-remove="${esc(r.id)}"
          aria-label="${esc(r.name)} aus dem Backplan nehmen">${icons.close}</button>
      </div>`;
    }).join('');
  }

  function renderPlanOptions() {
    if (!pEl.options) return;
    const q = plan.query.trim().toLowerCase();
    const list = RECIPES.filter((r) => !q || `${r.name} ${r.tags.join(' ')}`.toLowerCase().includes(q));

    pEl.options.innerHTML = list.length
      ? list.map((r) => {
        const times = phaseTimes(r);
        const bits = [`${times.pieces} Stück`, `${r.zeit + (r.kuehl || 0)} Min`, r.level];
        if (times.chill) bits.push(`+${times.chill} Min kühlen`);
        return `<label class="plan-option">
          <input type="checkbox" data-plan-id="${esc(r.id)}"${plan.ids.includes(r.id) ? ' checked' : ''}>
          <span class="plan-dot" style="background:${esc(r.dough)}" aria-hidden="true"></span>
          <span class="plan-option-copy"><b>${esc(r.name)}</b><small>${bits.map(esc).join(' · ')}</small></span>
        </label>`;
      }).join('')
      : '<p class="plan-none">Kein Rezept gefunden.</p>';

    updatePlanCount();
  }

  function renderPlan() {
    if (!pEl.output) return;
    const schedule = planSchedule(plan.ids);

    if (!schedule) {
      pEl.output.innerHTML = isSimple() ? `
        <div class="plan-empty">
          <h3>Noch kein Rezept gewählt</h3>
          <p>Wähle links eine Sorte — der Plan führt dich in Ruhe durch den Nachmittag: Teig anrühren, Blech für Blech backen, auskühlen lassen, fertigstellen und verpacken.</p>
          <p class="plan-empty-hint">Im einfachen Modus rechnet der Plan mit einem Blech im Ofen, allein am Tisch und gemütlichem Tempo. Für mehrere Sorten parallel wechselst du oben auf <strong>Erweitert</strong>.</p>
        </div>` : `
        <div class="plan-empty">
          <h3>Noch kein Rezept gewählt</h3>
          <p>Wähle links aus, was du backen willst. Der Plan führt dich dann in Stationen durch den Nachmittag: erst alle Teige, dann Blech für Blech aus dem Ofen, zum Schluss alles zusammen glasieren und verpacken.</p>
          <p class="plan-empty-hint">Stell links ein, wie viele Bleche in deinen Ofen passen, wer mitmacht und wie viel Zeit du hast — der Plan rechnet alles neu. Ein Vorschlag oben füllt die Auswahl mit einem Klick.</p>
        </div>`;
      return;
    }

    const total = schedule.end - startMinutes();
    const dl = deadlineInfo(schedule);
    const deadlineHTML = dl ? `
      <p class="plan-deadline ${dl.fits ? 'is-ok' : 'is-late'}">
        ${dl.fits
          ? `Ziel ${clock(dl.target)}: passt mit ${durationLabel(dl.diff)} Luft.`
          : dl.reachable
            ? `Ziel ${clock(dl.target)}: ${durationLabel(-dl.diff)} zu spät. Spätestens starten um ${clock(dl.latest)}. <button type="button" id="planFitStart">Start anpassen</button>`
            : `Ziel ${clock(dl.target)} ist mit dieser Auswahl nicht zu halten — nimm ein Rezept heraus oder beginne früher.`}
      </p>` : '';

    pEl.output.innerHTML = `
      <div class="plan-summary">
        <div>
          <p class="eyebrow"><span></span>Dein Backtag</p>
          <p class="plan-finish">Fertig um <strong>${clock(schedule.end)}</strong></p>
          <p class="plan-sub">${schedule.count} ${schedule.count === 1 ? 'Rezept' : 'Rezepte'} · ${schedule.pieces} Stück · ${schedule.trays} ${schedule.trays === 1 ? 'Blech' : 'Bleche'} in ${schedule.rounds} ${schedule.rounds === 1 ? 'Ofengang' : 'Ofengängen'} · ${durationLabel(total)} inklusive Kühlzeit</p>
          <p class="plan-sub">Davon ca. ${durationLabel(schedule.handsOn)} am Tisch — der Rest backt, kühlt oder ruht.</p>
          <p class="plan-sub">Letztes Blech um ${clock(schedule.ovenTo)} aus dem Ofen · Ofenfenster ${clock(schedule.ovenFrom)}–${clock(schedule.ovenTo)}.</p>
          <p class="plan-facts">${esc(planSettingsSummary())}${schedule.pause ? ` · Pause um ${clock(schedule.pause.at)}` : ''}</p>
          <p class="plan-gear-line">${esc(gearSummary())}</p>
          ${deadlineHTML}
        </div>
        <div class="plan-actions">
          <button class="btn btn-primary" type="button" id="planBake">Jetzt losbacken</button>
          <button class="btn btn-ghost" type="button" id="planToList">Alles auf die Einkaufsliste</button>
          <button class="btn btn-ghost" type="button" id="planPrint">${icons.print}Plan drucken</button>
          <button class="btn btn-ghost" type="button" id="planShare">Link kopieren</button>
          <button class="btn btn-ghost" type="button" id="planIcs">In den Kalender</button>
        </div>
      </div>
      ${total > 300 ? '<p class="plan-warn">Das sind mehr als fünf Stunden Backen. Für einen Nachmittag passen besser zwei bis vier Rezepte — oder du teilst den Plan auf zwei Tage.</p>' : ''}
      <ol class="plan-stages">${schedule.stages.map(planStageHTML).join('')}</ol>
      <p class="plan-print-foot">Keksdose · Backplan für ${schedule.count} ${schedule.count === 1 ? 'Sorte' : 'Sorten'} · ${esc(planSettingsSummary())} · ${new Date().toLocaleDateString('de-DE')} · Arbeitszeiten geschätzt</p>`;
  }

  function applyPreset(key) {
    const preset = PLAN_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    plan.ids = preset.ids.filter((id) => RECIPES.some((r) => r.id === id));
    plan.factors = {};
    plan.skip = new Set();
    plan.step = 0;
    savePlan();
    renderPlanOptions();
    renderPlanMix();
    renderPlan();
  }

  function tunePlan(mutate, options = false) {
    mutate();
    plan.step = 0;
    savePlan();
    if (options) renderPlanOptions();
    renderPlanMix();
    renderPlan();
  }

  if (pEl.options) {
    renderPlanPresets();
    renderPlanModes();
    renderPlanTune();
    renderPlanMix();
    renderPlanGear();
    renderPlanOptions();
    renderPlan();

    pEl.search.addEventListener('input', () => {
      plan.query = pEl.search.value;
      renderPlanOptions();
    });

    pEl.options.addEventListener('change', (e) => {
      const box = e.target.closest('[data-plan-id]');
      if (!box) return;
      const id = box.dataset.planId;
      if (box.checked) {
        if (isSimple()) {
          // Einfach backt eine Sorte: die neue Wahl ersetzt die alte.
          plan.ids = [id];
          pEl.options.querySelectorAll('[data-plan-id]').forEach((other) => {
            other.checked = other.dataset.planId === id;
          });
        } else if (!plan.ids.includes(id)) {
          plan.ids.push(id);
        }
      } else {
        plan.ids = plan.ids.filter((x) => x !== id);
        delete plan.factors[id];
        plan.skip.delete(id);
      }
      plan.step = 0;
      savePlan();
      updatePlanCount();
      renderPlanMix();
      renderPlan();
    });

    pEl.mix.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-plan-remove]');
      if (!chip) return;
      const id = chip.dataset.planRemove;
      plan.ids = plan.ids.filter((x) => x !== id);
      delete plan.factors[id];
      plan.skip.delete(id);
      const box = pEl.options.querySelector(`[data-plan-id="${id}"]`);
      if (box) box.checked = false;
      plan.step = 0;
      savePlan();
      renderPlanOptions();
      renderPlanMix();
      renderPlan();
    });

    pEl.mix.addEventListener('change', (e) => {
      const amount = e.target.closest('[data-plan-factor]');
      if (amount) {
        const id = amount.dataset.planFactor;
        const value = factorValue(amount.value);
        if (value === 1) delete plan.factors[id];
        else plan.factors[id] = value;
        tunePlan(() => {}, true);
        return;
      }
      const skip = e.target.closest('[data-plan-skip]');
      if (skip) {
        const id = skip.dataset.planSkip;
        if (skip.checked) plan.skip.add(id);
        else plan.skip.delete(id);
        tunePlan(() => {}, true);
      }
    });

    pEl.presets.addEventListener('click', (e) => {
      const preset = e.target.closest('[data-preset]');
      if (preset) applyPreset(preset.dataset.preset);
    });

    pEl.modes.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (btn) setPlanMode(btn.dataset.mode);
    });

    pEl.start.addEventListener('change', () => {
      if (parseClock(pEl.start.value) === null) return;
      plan.start = pEl.start.value;
      plan.step = 0;
      savePlan();
      renderPlan();
    });

    if (pEl.now) {
      pEl.now.addEventListener('click', () => {
        const now = new Date();
        const mins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
        plan.start = clock(mins);
        plan.step = 0;
        savePlan();
        renderPlanTune();
        renderPlan();
      });
    }

    pEl.gearChips.addEventListener('change', (e) => {
      const box = e.target.closest('[data-gear]');
      if (!box) return;
      if (box.checked) plan.gear.add(box.dataset.gear);
      else plan.gear.delete(box.dataset.gear);
      plan.step = 0;
      savePlan();
      if (pEl.gearNote) pEl.gearNote.textContent = gearSummary();
      renderPlanOptions();
      renderPlanMix();
      renderPlan();
    });

    pEl.capacity.addEventListener('change', () => {
      tunePlan(() => { plan.capacity = Math.max(1, Math.min(3, Number(pEl.capacity.value) || 1)); });
    });
    pEl.helpers.addEventListener('change', () => {
      tunePlan(() => { plan.helpers = Math.max(1, Math.min(3, Number(pEl.helpers.value) || 1)); });
    });
    pEl.tempo.addEventListener('change', () => {
      tunePlan(() => {
        plan.tempo = TEMPO.some((t) => t.key === pEl.tempo.value) ? pEl.tempo.value : TEMPO_DEFAULT;
      });
    });

    const pauseChanged = (fromTime) => {
      const at = parseClock(pEl.pauseAt.value);
      const mins = Math.max(0, Math.min(90, Number(pEl.pauseMin.value) || 0));
      tunePlan(() => {
        plan.pauseAt = at === null ? '' : pEl.pauseAt.value;
        plan.pauseMin = mins;
        // Eine Uhrzeit ohne Dauer bekommt eine übliche Pause, eine Dauer ohne
        // Uhrzeit einen Platz am Nachmittag. "keine" bleibt aber "keine".
        if (fromTime && plan.pauseAt && plan.pauseMin === 0) plan.pauseMin = 20;
        if (plan.pauseMin > 0 && !plan.pauseAt) plan.pauseAt = '15:00';
      });
      renderPlanTune();
    };
    pEl.pauseAt.addEventListener('change', () => pauseChanged(true));
    pEl.pauseMin.addEventListener('change', () => pauseChanged(false));

    pEl.deadline.addEventListener('change', () => {
      plan.deadline = parseClock(pEl.deadline.value) === null ? '' : pEl.deadline.value;
      plan.step = 0;
      savePlan();
      renderPlan();
    });
    pEl.deadlineClear.addEventListener('click', () => {
      plan.deadline = '';
      pEl.deadline.value = '';
      savePlan();
      renderPlan();
    });

    pEl.clear.addEventListener('click', () => {
      plan.ids = [];
      plan.factors = {};
      plan.skip = new Set();
      plan.step = 0;
      savePlan();
      renderPlanOptions();
      renderPlanMix();
      renderPlan();
    });

    pEl.output.addEventListener('click', (e) => {
      if (e.target.closest('#planBake')) { openBake(); return; }
      if (e.target.closest('#planPrint')) { printPlan(); return; }
      if (e.target.closest('#planIcs')) { downloadPlan(); return; }

      const share = e.target.closest('#planShare');
      if (share) { copyPlanLink(share); return; }

      const fit = e.target.closest('#planFitStart');
      if (fit) {
        const info = deadlineInfo(planSchedule(plan.ids));
        if (info && info.reachable) {
          plan.start = clock(info.latest);
          plan.step = 0;
          savePlan();
          renderPlanTune();
          renderPlan();
        }
        return;
      }

      const btn = e.target.closest('#planToList');
      if (!btn) return;
      plan.ids.forEach((id) => {
        const factor = factorOf(id);
        const existing = listState.items.find((it) => it.id === id);
        if (existing) existing.factor = factor;
        else listState.items.push({ id, factor });
      });
      saveList();
      renderList();
      btn.textContent = 'Auf der Einkaufsliste';
      btn.classList.add('is-added');
      btn.disabled = true;
    });
  }

  /* ---------- Backmodus: Schritt für Schritt ---------- */
  const SOUND_KEY = 'keksdose-backmodus-ton-v1';

  const bakeEl = {
    root: document.getElementById('bakeMode'),
    modeLabel: document.getElementById('bakeModeLabel'),
    stepLabel: document.getElementById('bakeStepLabel'),
    progressTime: document.getElementById('bakeProgressTime'),
    bar: document.getElementById('bakeBar'),
    phase: document.getElementById('bakePhase'),
    clock: document.getElementById('bakeClock'),
    title: document.getElementById('bakeTitle'),
    meta: document.getElementById('bakeMeta'),
    timerBox: document.getElementById('bakeTimerBox'),
    count: document.getElementById('bakeCount'),
    timerToggle: document.getElementById('bakeTimerToggle'),
    timerReset: document.getElementById('bakeTimerReset'),
    timerNote: document.getElementById('bakeTimerNote'),
    body: document.getElementById('bakeBody'),
    prev: document.getElementById('bakePrev'),
    next: document.getElementById('bakeNext'),
    nextUp: document.getElementById('bakeNextUp'),
    sound: document.getElementById('bakeSound'),
    close: document.getElementById('bakeClose')
  };

  let bakeSound = true;
  try { bakeSound = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (err) { /* Ton bleibt an */ }

  const bakeTimer = { total: 0, left: 0, running: false, started: false, endsAt: 0, finished: false, interval: null };
  let wakeLock = null;
  let bakeOpener = null;
  let audioCtx = null;

  const mmss = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  // Die Temperatur steht im Rezepttext ("Bei 180 °C …").
  function recipeTemp(r) {
    const hit = r.schritte.join(' ').match(/(\d{2,3})\s*°C/);
    return hit ? Number(hit[1]) : null;
  }

  const ovenMode = () => (plan.gear.has('convection') ? 'Umluft' : 'Ober-/Unterhitze');

  function bakeTemp(r) {
    const temp = recipeTemp(r);
    if (!temp) return null;
    return plan.gear.has('convection') ? temp - 20 : temp;
  }

  // Formen je Rezept — im Plan und im Backmodus derselbe Wortlaut.
  function formingHint(r) {
    if (r.ausstecher) {
      return `Teig zwischen zwei Lagen Backpapier ${r.shape === 'star' ? '8 mm' : '4–6 mm'} dick ausrollen und mit dem ${r.ausstecher.d}-cm-Ausstecher ausstechen.`;
    }
    if (r.shape === 'crescent') return 'Teig zu Rollen formen, in 1 cm dicke Scheiben schneiden und jede Scheibe zum Hörnchen rollen.';
    return 'Teig ausrollen, Plätzchen formen und mit 2 cm Abstand aufs Blech legen.';
  }

  function sheetLabel(event) {
    if (event.batch && event.batch.length > 1) {
      return `Bleche ${event.batch.map((tray) => tray.index + 1).join(' + ')} von ${event.trays}`;
    }
    return `Blech ${event.tray} von ${event.trays}`;
  }

  function bakeStep(event, schedule) {
    const r = event.item ? event.item.r : null;

    if (event.type === 'prep') {
      const hints = [
        plan.gear.has('scale')
          ? 'Waage raus: alle Zutaten abwiegen, Mehl locker einfüllen.'
          : 'Ohne Waage: Tassen locker füllen — eine Tasse Mehl sind etwa 130 g.'
      ];
      if (!plan.gear.has('mixer')) hints.push('Ohne Mixer von Hand rühren — dafür ist hier mehr Zeit eingeplant.');
      if (r.ausstecher && !plan.gear.has('cutters')) hints.push(`Für ${r.name} brauchst du einen Ausstecher mit ${r.ausstecher.d} cm.`);
      if (r.id === 'spritzgebaeck' && !plan.gear.has('piping')) hints.push('Ohne Spritzbeutel: den Teig zu Rollen formen und in Scheiben schneiden.');
      if (event.item.chill) hints.push(isSimple()
        ? `Abgedeckt ${event.item.chill} Min kalt stellen — fertig um ${clock(event.item.ready)}. Die Zeit gehört dir.`
        : `Abgedeckt ${event.item.chill} Min kalt stellen — fertig um ${clock(event.item.ready)}. In der Zeit rührst du den nächsten Teig.`);
      if (event.item.factor !== 1) hints.push(`${event.item.factor}× Menge: alle Zutaten entsprechend abwiegen — die Bleche und Stückzahlen sind im Plan schon eingerechnet.`);

      return {
        phase: 'Teig anrühren',
        title: `${r.name} anrühren`,
        meta: `ca. ${event.dur} Min · ${r.stueck} Stück · ${r.level}`,
        body: `<ol class="bake-steps">${r.schritte.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          ${r.tipp ? `<details class="bake-tip"><summary>Tipp für ${esc(r.name)}</summary><p>${esc(r.tipp)}</p></details>` : ''}
          ${hints.length ? `<ul class="bake-hints">${hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`
      };
    }

    if (event.type === 'oven') {
      const first = schedule.events.find((e) => e.type === 'sheet');
      const temp = first ? first.temp : null;
      const temps = [...new Set(schedule.events
        .filter((e) => e.type === 'sheet' && e.temp !== null)
        .map((e) => e.temp))];
      return {
        phase: 'Vorheizen',
        title: 'Ofen vorheizen',
        meta: `${ovenMode()}${temp ? ` · ${temp} °C` : ''} · ca. ${event.dur} Min`,
        body: `<p class="bake-text">Blech, Backpapier, Gitter und einen dünnen Spatel bereitlegen. Die Ofentür bleibt zu, bis die Lampe ausgeht.</p>
          ${temps.length > 1 ? `<p class="bake-text">Deine Sorten backen bei ${temps.join(' und ')} °C. Der Plan rechnet das Umstellen mit ein — backe die Bleche am besten in der Reihenfolge des Plans.</p>` : ''}
          ${plan.gear.has('convection') ? '<p class="bake-text">Umluft: 20 °C weniger als im Rezept — genau so steht die Temperatur hier schon.</p>' : ''}`
      };
    }

    if (event.type === 'pause') {
      return {
        phase: 'Pause',
        title: `Pause · ${event.dur} Min`,
        meta: `ab ${clock(event.at)} · Tee, Hände waschen, durchatmen`,
        body: `<p class="bake-text">Der Plan gönnt dir eine Pause. Deck die Schüsseln ab, stell die Bleche zusammen und mach dir einen Tee — danach geht es an der markierten Stelle weiter.</p>
          <p class="bake-text">Der Timer läuft auf Wunsch mit: ${event.dur} Minuten, dann geht es weiter.</p>`
      };
    }

    if (event.type === 'sheet') {
      const batch = event.batch && event.batch.length
        ? event.batch
        : [{ item: { r }, index: event.tray - 1, count: event.trays }];
      const names = [...new Set(batch.map((tray) => tray.item.r.name))].join(' + ');
      const forming = batch.map((tray) => formingHint(tray.item.r)).join(' ');
      const steps = [
        forming,
        `Blech auf mittlerer Schiene: ${event.temp ? `${event.temp} °C` : 'die Temperatur aus dem Rezept'}, ${event.dur} Min. Timer starten — von ${clock(event.bakeAt)} bis ${clock(event.bakeEnd)}.`,
        event.next
          ? (isSimple()
            ? `Der Ofen braucht dich jetzt nicht: ruhig einen Tee holen. Danach Blech ${event.next.tray} (${event.next.name}) in Ruhe belegen.`
            : `Während dieses Blech backt: schon Blech ${event.next.tray} (${event.next.name}) ausrollen und belegen — dann steht es bereit, wenn der Ofen frei wird.`)
          : 'Nach dem Backen zwei Minuten auf dem Blech lassen, dann aufs Gitter heben.'
      ];
      const hints = [];
      if (event.retemp) hints.push(`Der Ofen steht noch auf ${event.ovenWas} °C — vor diesem Blech auf ${event.temp} °C umstellen (${event.retempMin} Min eingeplant).`);
      if (event.wait > 0) hints.push(`Der Ofen ist noch belegt: Das Blech steht bereit und kommt ${event.wait} Min später hinein — in der Zeit kannst du schon aufräumen.`);
      if (event.next && !isSimple()) hints.push('Wer nur ein Blech hat: Das heiße Blech kurz abkühlen lassen, sonst backt der Teig schon beim Belegen an.');
      if (batch.length > 1) hints.push('Beide Bleche kommen gleichzeitig hinein — nach der Hälfte der Zeit einmal tauschen, damit sie gleichmäßig backen.');
      if (plan.gear.has('convection')) hints.push('Umluft trocknet stärker: lieber eine Minute früher herausnehmen und auf dem Blech nachziehen lassen.');
      return {
        phase: 'Blech backen',
        title: `${names} · ${sheetLabel(event)}`,
        meta: `formen ca. ${event.formMin} Min · Ofen ${clock(event.bakeAt)}–${clock(event.bakeEnd)}${event.temp ? ` · ${event.temp} °C` : ''}`,
        body: `<ol class="bake-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          ${hints.length ? `<ul class="bake-hints">${hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`
      };
    }

    if (event.type === 'cool') {
      return {
        phase: 'Auskühlen',
        title: 'Alles aufs Gitter',
        meta: `ca. ${event.dur} Min · ${schedule.pieces} Stück aus ${schedule.trays} ${schedule.trays === 1 ? 'Blech' : 'Blechen'}`,
        body: `<p class="bake-text">Alle Bleche sind aus dem Ofen. Die ersten Sorten sind längst kalt — stell sie schon zusammen und räum die Bleche weg.</p>
          <p class="bake-text">Die letzten Plätzchen zwei Minuten auf dem Blech lassen, dann aufs Gitter heben. Erst ganz kalte Plätzchen werden glasiert, gefüllt oder bestreut, sonst wird die Glasur fleckig.</p>`
      };
    }

    if (event.type === 'finish') {
      const last = r.schritte[r.schritte.length - 1];
      const hints = [];
      if (event.tag === 'füllen') hints.push('Füllung erst auf den kalten Keks streichen, dann zusammensetzen und leicht andrücken.');
      if (event.tag === 'glasieren') hints.push('Glasur in einem Rutsch auf alle Plätzchen dieser Sorte — so trocknet sie gleichmäßig.');
      if (event.tag === 'sortieren') hints.push('Kurz durchsortieren: die schönen Stücke nach oben, gebrochene in eine eigene Dose für den Hausgebrauch.');
      hints.push('Nimm dir die Sorten nacheinander vor und lass die fertigen Plätzchen auf dem Gitter trocknen, bevor sie in die Dose kommen.');
      return {
        phase: 'Fertigstellen',
        title: `${r.name} ${event.tag}`,
        meta: `ca. ${event.dur} Min · ${r.stueck} Stück`,
        body: `<p class="bake-text">${esc(last)}</p>
          <ul class="bake-hints">${hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
      };
    }

    return {
      phase: 'Verpacken',
      title: 'In die Dose schichten',
      meta: `ca. ${event.dur} Min · ${schedule.count} ${schedule.count === 1 ? 'Sorte' : 'Sorten'} · ${schedule.pieces} Stück`,
      body: `<p class="bake-text">Sorten getrennt oder mit Backpapier zwischen den Lagen in die Blechdose. Gefüllte und glasierte Plätzchen einlagig legen, damit nichts klebt.</p>
        <p class="bake-text">Beschriften nicht vergessen: Zimtsterne und Makronen halten zwei Wochen, Mürbeteig drei bis vier Wochen, Schokolade trocken bei 15 bis 18 °C.</p>`
    };
  }

  function doneStep(schedule) {
    const names = [...new Set(schedule.events
      .filter((e) => e.type === 'prep')
      .map((e) => e.item.r.name))];
    return {
      phase: 'Geschafft',
      title: 'Fertig — guten Appetit',
      meta: `${schedule.count} ${schedule.count === 1 ? 'Sorte' : 'Sorten'} · ${schedule.pieces} Stück · fertig um ${clock(schedule.end)}`,
      body: `<ul class="bake-done">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <p class="bake-text">Alles ist ausgekühlt, fertiggestellt und verstaut. In der Blechdose halten sie sich mehrere Wochen.</p>`
    };
  }

  function renderBake(schedule) {
    if (!bakeEl.root) return;
    const sched = schedule || planSchedule(plan.ids);
    if (!sched) return;

    const total = sched.events.length + 1;
    plan.step = Math.max(0, Math.min(plan.step, total - 1));
    const event = sched.events[plan.step];
    const info = event ? bakeStep(event, sched) : doneStep(sched);

    bakeEl.root.dataset.phase = event ? event.type : 'done';
    if (bakeEl.modeLabel) bakeEl.modeLabel.textContent = isSimple() ? 'Einfach' : 'Erweitert';
    bakeEl.phase.textContent = info.phase;
    bakeEl.clock.textContent = event
      ? `${clock(event.at)} Uhr · noch ${durationLabel(sched.end - event.at)} bis alles fertig ist`
      : `${clock(sched.end)} Uhr`;
    bakeEl.title.textContent = info.title;
    bakeEl.meta.textContent = info.meta;
    bakeEl.body.innerHTML = info.body;

    // Jeder Schritt gleitet kurz nach, damit der Wechsel sichtbar ist.
    bakeEl.root.classList.remove('step-in');
    if (!bakeEl.root.hidden) {
      void bakeEl.root.offsetWidth;
      bakeEl.root.classList.add('step-in');
    }

    bakeEl.stepLabel.textContent = `Schritt ${plan.step + 1} von ${total}`;
    bakeEl.progressTime.textContent = `fertig um ${clock(sched.end)}`;
    bakeEl.bar.style.width = `${Math.round(((plan.step + 1) / total) * 100)}%`;

    bakeEl.prev.disabled = plan.step === 0;
    bakeEl.next.textContent = plan.step === total - 1 ? 'Backmodus schließen' : 'Nächster Schritt';

    const following = sched.events[plan.step + 1];
    bakeEl.nextUp.textContent = following
      ? `Danach: ${bakeStep(following, sched).title} · ${clock(following.at)} Uhr`
      : plan.step === total - 2 ? 'Danach: abkühlen und in die Dose.' : '';
  }

  function renderTimer() {
    if (!bakeEl.timerBox) return;
    const has = bakeTimer.total > 0;
    bakeEl.timerBox.hidden = !has;
    if (!has) return;

    bakeEl.count.textContent = mmss(bakeTimer.left);
    bakeEl.timerBox.classList.toggle('is-done', bakeTimer.finished);
    bakeEl.count.classList.toggle('is-done', bakeTimer.finished);
    bakeEl.timerToggle.textContent = bakeTimer.finished
      ? 'Nochmal starten'
      : bakeTimer.running ? 'Pause' : bakeTimer.started ? 'Weiter' : 'Timer starten';
    bakeEl.timerNote.textContent = bakeTimer.finished
      ? 'Zeit ist um — jetzt weiter zum nächsten Schritt.'
      : bakeTimer.running
        ? 'Der Timer läuft. Du kannst das Handy getrost aus der Hand legen.'
        : `${durationLabel(Math.round(bakeTimer.total / 60))} für diesen Schritt.`;
  }

  function resetBakeTimer(minutes) {
    window.clearInterval(bakeTimer.interval);
    bakeTimer.interval = null;
    bakeTimer.total = Math.max(0, Math.round(minutes * 60));
    bakeTimer.left = bakeTimer.total;
    bakeTimer.running = false;
    bakeTimer.started = false;
    bakeTimer.finished = false;
    bakeTimer.endsAt = 0;
    renderTimer();
  }

  function tickTimer() {
    bakeTimer.left = Math.max(0, Math.round((bakeTimer.endsAt - Date.now()) / 1000));
    if (!bakeTimer.left) {
      bakeTimer.running = false;
      bakeTimer.finished = true;
      window.clearInterval(bakeTimer.interval);
      bakeTimer.interval = null;
      beep();
    }
    renderTimer();
  }

  function toggleTimer() {
    if (bakeTimer.running) {
      bakeTimer.left = Math.max(0, Math.round((bakeTimer.endsAt - Date.now()) / 1000));
      bakeTimer.running = false;
      window.clearInterval(bakeTimer.interval);
      bakeTimer.interval = null;
      renderTimer();
      return;
    }
    if (bakeTimer.finished) {
      bakeTimer.left = bakeTimer.total;
      bakeTimer.finished = false;
    }
    if (!bakeTimer.left) return;
    bakeTimer.endsAt = Date.now() + bakeTimer.left * 1000;
    bakeTimer.running = true;
    bakeTimer.started = true;
    bakeTimer.interval = window.setInterval(tickTimer, 500);
    renderTimer();
  }

  function beep() {
    if (!bakeSound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [0, 0.3, 0.6].forEach((offset, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880 - i * 60;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.26);
      });
    } catch (err) { /* ohne Ton läuft der Timer weiter */ }
  }

  function renderSound() {
    if (!bakeEl.sound) return;
    bakeEl.sound.setAttribute('aria-pressed', String(bakeSound));
    bakeEl.sound.setAttribute('aria-label', bakeSound ? 'Timer-Ton ausschalten' : 'Timer-Ton einschalten');
  }

  async function keepAwake(on) {
    try {
      if (on) {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (err) { wakeLock = null; }
  }

  function showBakeStep() {
    const sched = planSchedule(plan.ids);
    if (!sched || !bakeEl.root) return;
    const event = sched.events[plan.step];
    resetBakeTimer(event ? event.dur : 0);
    renderBake(sched);
  }

  function openBake() {
    if (!bakeEl.root || !planSchedule(plan.ids)) return;
    if (state.open) closeRecipe();
    if (el.listPanel && el.listPanel.classList.contains('open')) closeList();
    if (pantryEl.panel && pantryEl.panel.classList.contains('open')) closePantry();
    bakeOpener = document.activeElement;
    bakeEl.root.hidden = false;
    el.body.classList.add('locked');
    showBakeStep();
    keepAwake(true);
    bakeEl.close.focus({ preventScroll: true });
  }

  function closeBake() {
    if (!bakeEl.root || bakeEl.root.hidden) return;
    bakeEl.root.hidden = true;
    el.body.classList.remove('locked');
    window.clearInterval(bakeTimer.interval);
    bakeTimer.interval = null;
    bakeTimer.running = false;
    keepAwake(false);
    if (bakeOpener && document.contains(bakeOpener)) bakeOpener.focus({ preventScroll: true });
  }

  function bakeGo(delta) {
    const sched = planSchedule(plan.ids);
    if (!sched) return;
    const total = sched.events.length + 1;
    const next = plan.step + delta;
    if (next < 0 || next >= total) return;
    plan.step = next;
    savePlan();
    showBakeStep();
  }

  if (bakeEl.root) {
    renderSound();
    bakeEl.root.addEventListener('click', (e) => {
      if (e.target.closest('#bakeClose')) { closeBake(); return; }
      if (e.target.closest('#bakeNext')) {
        const sched = planSchedule(plan.ids);
        if (sched && plan.step >= sched.events.length) closeBake();
        else bakeGo(1);
        return;
      }
      if (e.target.closest('#bakePrev')) { bakeGo(-1); return; }
      if (e.target.closest('#bakeTimerToggle')) { toggleTimer(); return; }
      if (e.target.closest('#bakeTimerReset')) { resetBakeTimer(bakeTimer.total / 60); return; }
      if (e.target.closest('#bakeSound')) {
        bakeSound = !bakeSound;
        try { localStorage.setItem(SOUND_KEY, bakeSound ? 'on' : 'off'); } catch (err) { /* Sitzung genügt */ }
        renderSound();
      }
    });
  }

  /* ---------- Was hab ich da? (Vorrat) ---------- */
  const PANTRY_KEY = 'keksdose-vorrat-v1';

  // Reihenfolge ist wichtig: konkrete Zutaten vor ihren Oberbegriffen
  // (Mandelglasur vor Mandeln, Kuvertüre vor Schokolade usw.).
  const PANTRY_RULES = [
    { key: 'haselnussglasur', label: 'Haselnussglasur', test: /haselnussglasur/ },
    { key: 'mandelglasur', label: 'Mandelglasur', test: /mandelglasur/ },
    { key: 'schokolade', label: 'Schokolade & Kuvertüre', test: /schokoglasur|schokoladenglasur|kuverture|schokolade/ },
    { key: 'krokant', label: 'Krokant', test: /krokant/ },
    { key: 'kakao', label: 'Kakao', test: /kakao/ },
    { key: 'kokosoel', label: 'Kokosöl', test: /kokosol|kokosoel/ },
    { key: 'kokos', label: 'Kokosraspeln', test: /kokos/ },
    { key: 'mandeln', label: 'Mandeln', test: /mandel/ },
    { key: 'haselnuesse', label: 'Haselnüsse', test: /haselnuss/ },
    { key: 'walnuesse', label: 'Walnüsse', test: /walnuss/ },
    { key: 'nuesse', label: 'Nüsse (gemischt)', test: /nuss/ },
    { key: 'marzipan', label: 'Marzipan', test: /marzipan/ },
    { key: 'nutella', label: 'Nuss-Nougat-Creme', test: /nutella/ },
    { key: 'konfiture', label: 'Konfitüre & Marmelade', test: /konfiture|marmelade|gelee/ },
    { key: 'himbeersaft', label: 'Himbeersaft', test: /himbeersaft/ },
    { key: 'himbeersirup', label: 'Himbeersirup', test: /himbeersirup/ },
    { key: 'kirschsaft', label: 'Kirschsaft', test: /kirschsaft/ },
    { key: 'kirschwasser', label: 'Kirschwasser', test: /kirschwasser/ },
    { key: 'limettensaft', label: 'Limettensaft', test: /limettensaft/ },
    { key: 'orange', label: 'Orangen (Saft & Schale)', test: /orange/ },
    { key: 'zitrone', label: 'Zitrone', test: /zitrone/ },
    { key: 'zimt', label: 'Zimt', test: /zimt/ },
    { key: 'nelken', label: 'Nelken', test: /nelken/ },
    { key: 'lebkuchengewuerz', label: 'Lebkuchengewürz', test: /lebkuchen/ },
    { key: 'vanilleextrakt', label: 'Vanilleextrakt', test: /vanilleextrakt/ },
    { key: 'vanillezucker', label: 'Vanillezucker', test: /vanillezucker|vanillinzucker/ },
    { key: 'puderzucker', label: 'Puderzucker', test: /puderzucker/ },
    { key: 'brauner_zucker', label: 'Brauner Zucker', test: /brauner zucker/ },
    { key: 'zucker', label: 'Zucker', test: /zucker/ },
    { key: 'honig', label: 'Honig', test: /honig/ },
    { key: 'ahornsirup', label: 'Ahornsirup', test: /ahornsirup/ },
    { key: 'mehl', label: 'Mehl', test: /mehl/ },
    { key: 'backpulver', label: 'Backpulver', test: /backpulver/ },
    { key: 'speisestaerke', label: 'Speisestärke', test: /speisestarke/ },
    { key: 'haferflocken', label: 'Haferflocken', test: /haferflocken/ },
    { key: 'blaetterteig', label: 'Blätterteig', test: /blatterteig/ },
    { key: 'eier', label: 'Eier', test: /\bei(er|gelb|weiss)?\b/ },
    { key: 'butter', label: 'Butter', test: /butter/ },
    { key: 'margarine', label: 'Margarine', test: /margarine/ },
    { key: 'palmin', label: 'Palmin', test: /palmin/ },
    { key: 'sahne', label: 'Sahne', test: /sahne/ },
    { key: 'milch', label: 'Milch', test: /milch/ },
    { key: 'haferdrink', label: 'Haferdrink', test: /haferdrink/ },
    { key: 'frischkaese', label: 'Frischkäse', test: /frischkase/ },
    { key: 'salz', label: 'Salz', test: /salz/ },
    { key: 'rosinen', label: 'Rosinen', test: /rosine/ },
    { key: 'schwarztee', label: 'Schwarztee', test: /schwarztee/ }
  ];

  const PANTRY_LABELS = Object.fromEntries(PANTRY_RULES.map((rule) => [rule.key, rule.label]));
  // Butter und Margarine ersetzen sich beim Backen gegenseitig.
  const PANTRY_ALIASES = { butter: ['margarine', 'palmin'], margarine: ['butter'] };

  function pantryKey(name) {
    const n = norm(name);
    const rule = PANTRY_RULES.find((r) => r.test.test(n));
    if (rule) return rule.key;
    return String(name).split(',')[0].trim().toLowerCase().replace(/\s+/g, '-');
  }

  const pantryLabel = (key) => PANTRY_LABELS[key] || key.replace(/-/g, ' ');

  const pantry = { keys: new Set(), amounts: {}, query: '', expanded: false };
  const pantryEl = {
    toggle: document.getElementById('pantryToggle'),
    panel: document.getElementById('pantryPanel'),
    backdrop: document.getElementById('pantryBackdrop')
  };

  function loadPantry() {
    try {
      const raw = JSON.parse(localStorage.getItem(PANTRY_KEY) || '[]');
      // Früher war der Vorrat nur eine Liste; jetzt kommen Mengen dazu.
      const keys = Array.isArray(raw) ? raw : (Array.isArray(raw.keys) ? raw.keys : []);
      const amounts = !Array.isArray(raw) && raw.amounts && typeof raw.amounts === 'object' ? raw.amounts : {};
      pantry.keys = new Set(keys.filter((k) => typeof k === 'string' && PANTRY_LABELS[k]));
      pantry.amounts = {};
      Object.entries(amounts).forEach(([key, value]) => {
        const n = Number(value);
        if (pantry.keys.has(key) && Number.isFinite(n) && n > 0) pantry.amounts[key] = n;
      });
    } catch (err) { pantry.keys = new Set(); pantry.amounts = {}; }
  }

  function savePantry() {
    try {
      localStorage.setItem(PANTRY_KEY, JSON.stringify({ keys: [...pantry.keys], amounts: pantry.amounts }));
    } catch (err) { /* Sitzung genügt */ }
  }

  function hasPantry(key) {
    if (pantry.keys.has(key)) return true;
    return (PANTRY_ALIASES[key] || []).some((alias) => pantry.keys.has(alias));
  }

  // Für welche Zutaten die Menge in Stück oder Millilitern zählt (sonst Gramm).
  const PANTRY_ML = new Set(['kokosoel', 'himbeersaft', 'himbeersirup', 'kirschsaft', 'kirschwasser', 'limettensaft', 'ahornsirup', 'sahne', 'milch', 'haferdrink', 'vanilleextrakt']);
  const PANTRY_STK = new Set(['eier', 'zitrone', 'orange', 'schwarztee']);

  const pantryUnit = (key) => (PANTRY_STK.has(key) ? 'stk' : PANTRY_ML.has(key) ? 'ml' : 'g');
  const pantryUnitLabel = (unit) => (unit === 'stk' ? 'Stück' : unit);

  // Wie viel eine Rezeptzutat in der Einheit des Vorrats braucht.
  function pantryNeed(z, unit) {
    if (unit === 'stk') {
      if (z.u === 'Päckchen' || z.u === 'Bund' || z.u === 'Beutel' || !z.u) return z.m || 0;
      return 1;
    }
    return unitGrams(z);
  }

  // Eigene Mengenangabe oder die eines Ersatzes (Butter/Margarine).
  function pantryHave(key) {
    if (Number.isFinite(pantry.amounts[key]) && pantry.amounts[key] > 0) return pantry.amounts[key];
    for (const alias of PANTRY_ALIASES[key] || []) {
      if (Number.isFinite(pantry.amounts[alias]) && pantry.amounts[alias] > 0) return pantry.amounts[alias];
    }
    return null;
  }

  function pantryMatches() {
    return RECIPES.map((r) => {
      const need = new Map();
      r.zutaten.forEach((z) => {
        const key = pantryKey(z.n);
        const unit = pantryUnit(key);
        const entry = need.get(key) || { key, label: pantryLabel(key), unit, amount: 0 };
        entry.amount += pantryNeed(z, unit);
        need.set(key, entry);
      });

      const missing = [];
      need.forEach((entry) => {
        if (!hasPantry(entry.key)) {
          missing.push({ ...entry, have: null });
          return;
        }
        const have = pantryHave(entry.key);
        if (have !== null && have + 0.001 < entry.amount) missing.push({ ...entry, have });
      });

      return { r, missing, total: need.size };
    }).sort((a, b) => a.missing.length - b.missing.length
      || a.r.zeit - b.r.zeit
      || a.r.name.localeCompare(b.r.name, 'de'));
  }

  function pantryShell() {
    return `<div class="drawer-scroll list-scroll">
      <div class="drawer-head list-head">
        <div class="drawer-top">
          <p class="eyebrow"><span></span>Vorratscheck</p>
          <button class="icon-btn" id="closePantry" type="button" aria-label="Vorratscheck schließen">${icons.close}</button>
        </div>
        <h2 id="pantryTitle">Was hab ich da?</h2>
        <p class="drawer-lede">Hake ab, was im Schrank steht, und trage bei Bedarf die Menge ein. Wir zeigen dir, welche Rezepte damit gehen — und wo es noch knapp wird.</p>
      </div>
      <div class="drawer-body">
        <div class="search pantry-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>
          <input id="pantrySearch" type="search" placeholder="Zutat suchen: Mehl, Zimt …" aria-label="Zutaten durchsuchen" autocomplete="off" value="${esc(pantry.query)}">
        </div>
        <div class="pantry-picked" id="pantryPicked"></div>
        <div class="pantry-grid" id="pantryGrid"></div>
        <div class="pantry-results" id="pantryResults" aria-live="polite"></div>
      </div>
    </div>`;
  }

  function renderPantryGrid() {
    const grid = pantryEl.panel.querySelector('#pantryGrid');
    if (!grid) return;
    const q = norm(pantry.query.trim());
    const list = PANTRY_RULES.filter((rule) => !q || norm(rule.label).includes(q));
    grid.innerHTML = list.length
      ? list.map((rule) => {
        const on = pantry.keys.has(rule.key);
        const unit = pantryUnit(rule.key);
        const amount = pantry.amounts[rule.key];
        return `<div class="pantry-item${on ? ' is-on' : ''}">
          <label class="pantry-check">
            <input type="checkbox" data-pantry-key="${esc(rule.key)}"${on ? ' checked' : ''}>
            <span>${esc(rule.label)}</span>
          </label>
          ${on ? `<span class="pantry-amount">
            <input type="number" min="0" step="1" inputmode="numeric" data-pantry-amount="${esc(rule.key)}"
              value="${Number.isFinite(amount) ? esc(String(amount)) : ''}" placeholder="?"
              aria-label="Vorhandene Menge ${esc(rule.label)} in ${pantryUnitLabel(unit)}"><i>${pantryUnitLabel(unit)}</i>
          </span>` : ''}
        </div>`;
      }).join('')
      : '<p class="pantry-none">Diese Zutat kennen wir nicht — vielleicht anders schreiben?</p>';
  }

  function renderPantryPicked() {
    const box = pantryEl.panel.querySelector('#pantryPicked');
    if (!box) return;
    if (!pantry.keys.size) {
      box.innerHTML = '<p class="hint">Noch nichts angehakt. Schon Mehl, Butter, Zucker und Eier reichen für die ersten Rezepte — die Menge ist optional.</p>';
      return;
    }
    const chips = [...pantry.keys].map((key) => {
      const amount = pantryHave(key);
      const unit = pantryUnitLabel(pantryUnit(key));
      return `<button class="pantry-chip" type="button" data-pantry-remove="${esc(key)}" aria-label="${esc(pantryLabel(key))} entfernen">
      <span>${esc(pantryLabel(key))}${amount !== null ? ` · ${fmtAmount(amount)} ${unit}` : ''}</span>${icons.close}
    </button>`;
    }).join('');
    box.innerHTML = `
      <div class="pantry-picked-head">
        <b>${pantry.keys.size} ${pantry.keys.size === 1 ? 'Zutat' : 'Zutaten'} im Vorrat</b>
        <button class="plan-clear" id="pantryReset" type="button">alles löschen</button>
      </div>
      <div class="pantry-chips">${chips}</div>`;
  }

  function pantryHitHTML(match) {
    const missing = match.missing;
    const needs = missing.slice(0, 2).map((m) => {
      const need = m.unit === 'stk' ? `${fmtAmount(m.amount)} Stück` : `${fmtAmount(m.amount)} ${m.unit}`;
      return m.have === null ? esc(m.label) : `${esc(m.label)} (${need} nötig)`;
    }).join(', ');
    const short = missing.some((m) => m.have !== null);
    return `<button class="pantry-hit" type="button" data-id="${esc(match.r.id)}">
      <span class="pantry-hit-main">
        <b>${esc(match.r.name)}</b>
        <small>${match.r.zeit} Min · ${match.r.stueck} Stück · ${esc(match.r.level)}</small>
      </span>
      <span class="pantry-hit-status${missing.length ? '' : ' is-ready'}">${missing.length
        ? `${short ? 'zu wenig' : 'fehlt'}: ${needs}${missing.length > 2 ? ' …' : ''}`
        : 'alles da'}</span>
    </button>`;
  }

  function renderPantryResults() {
    const box = pantryEl.panel.querySelector('#pantryResults');
    if (!box) return;

    if (!pantry.keys.size) {
      box.innerHTML = '<p class="pantry-teaser">Hake ein paar Grundzutaten an, dann erscheint hier, was du damit backen kannst. Mit Mengenangabe sieht der Check auch, wenn es nur noch für die halbe Portion reicht.</p>';
      return;
    }

    const matches = pantryMatches();
    const ready = matches.filter((m) => !m.missing.length);
    const limit = pantry.expanded ? matches.length : 7;

    box.innerHTML = `
      <div class="pantry-result-head">
        <h3>Das geht damit</h3>
        <span>${ready.length} von ${RECIPES.length} Rezepten ohne Einkauf</span>
      </div>
      <div class="pantry-hits">${matches.slice(0, limit).map(pantryHitHTML).join('')}</div>
      ${matches.length > 7 ? `<button class="pantry-more" id="pantryMore" type="button">${pantry.expanded ? 'weniger anzeigen' : `alle ${matches.length} Rezepte anzeigen`}</button>` : ''}`;
  }

  function openPantry() {
    if (!pantryEl.panel) return;
    if (state.open) closeRecipe();
    if (el.listPanel && el.listPanel.classList.contains('open')) closeList();
    pantryEl.panel.innerHTML = pantryShell();
    pantryEl.panel.classList.add('open');
    pantryEl.panel.setAttribute('aria-hidden', 'false');
    pantryEl.backdrop.hidden = false;
    requestAnimationFrame(() => pantryEl.backdrop.classList.add('show'));
    el.body.classList.add('locked');

    renderPantryGrid();
    renderPantryPicked();
    renderPantryResults();

    const closeBtn = pantryEl.panel.querySelector('#closePantry');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closePantry() {
    if (!pantryEl.panel || !pantryEl.panel.classList.contains('open')) return;
    pantryEl.panel.classList.remove('open');
    pantryEl.panel.setAttribute('aria-hidden', 'true');
    pantryEl.backdrop.classList.remove('show');
    if (!state.open) el.body.classList.remove('locked');
    window.setTimeout(() => {
      if (!pantryEl.panel.classList.contains('open')) pantryEl.backdrop.hidden = true;
    }, 300);
  }

  if (pantryEl.toggle) {
    pantryEl.toggle.addEventListener('click', openPantry);
    pantryEl.backdrop.addEventListener('click', closePantry);

    pantryEl.panel.addEventListener('change', (e) => {
      const box = e.target.closest('[data-pantry-key]');
      if (!box) return;
      if (box.checked) pantry.keys.add(box.dataset.pantryKey);
      else {
        pantry.keys.delete(box.dataset.pantryKey);
        delete pantry.amounts[box.dataset.pantryKey];
      }
      savePantry();
      renderPantryGrid();
      renderPantryPicked();
      renderPantryResults();
    });

    pantryEl.panel.addEventListener('input', (e) => {
      if (e.target.id === 'pantrySearch') {
        pantry.query = e.target.value;
        renderPantryGrid();
        return;
      }
      if (!e.target.matches('[data-pantry-amount]')) return;
      // Die Eingabe wird gespeichert, ohne das Gitter neu zu bauen — sonst
      // verliert das Feld beim Tippen den Fokus.
      const key = e.target.dataset.pantryAmount;
      const value = Number(String(e.target.value).replace(',', '.'));
      if (Number.isFinite(value) && value > 0) pantry.amounts[key] = value;
      else delete pantry.amounts[key];
      savePantry();
      renderPantryPicked();
      renderPantryResults();
    });

    pantryEl.panel.addEventListener('click', (e) => {
      if (e.target.closest('#closePantry')) { closePantry(); return; }

      if (e.target.closest('#pantryReset')) {
        pantry.keys.clear();
        pantry.amounts = {};
        savePantry();
        renderPantryGrid();
        renderPantryPicked();
        renderPantryResults();
        return;
      }

      const remove = e.target.closest('[data-pantry-remove]');
      if (remove) {
        pantry.keys.delete(remove.dataset.pantryRemove);
        delete pantry.amounts[remove.dataset.pantryRemove];
        savePantry();
        renderPantryGrid();
        renderPantryPicked();
        renderPantryResults();
        return;
      }

      if (e.target.closest('#pantryMore')) {
        pantry.expanded = !pantry.expanded;
        renderPantryResults();
        return;
      }

      const hit = e.target.closest('.pantry-hit');
      if (hit) {
        closePantry();
        openRecipe(hit.dataset.id);
      }
    });
  }

  /* ---------- Tastaturfokus in den Drawern ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Tab soll im offenen Drawer bleiben und nicht hinter dem Dialog landen.
  function trapFocus(panel, event) {
    const items = [...panel.querySelectorAll(FOCUSABLE)]
      .filter((node) => node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- Events ---------- */
  el.search.addEventListener('input', () => {
    state.query = el.search.value;
    renderGrid();
  });

  el.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.tag = chip.dataset.tag;
    el.chips.querySelectorAll('.chip').forEach((c) => {
      c.setAttribute('aria-pressed', String(c === chip));
    });
    renderGrid();
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    renderGrid();
  });

  el.reset.addEventListener('click', () => {
    state.tag = 'Alle';
    state.query = '';
    el.search.value = '';
    el.chips.querySelectorAll('.chip').forEach((c) => {
      c.setAttribute('aria-pressed', String(c.dataset.tag === 'Alle'));
    });
    renderGrid();
    el.search.focus();
  });

  el.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openRecipe(card.dataset.id);
  });

  el.grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    openRecipe(card.dataset.id);
  });

  el.backdrop.addEventListener('click', closeRecipe);

  el.drawer.addEventListener('click', (e) => {
    const scaleBtn = e.target.closest('[data-scale]');
    if (scaleBtn) {
      state.scale = Number(scaleBtn.dataset.scale);
      refreshIngredients();
      return;
    }

    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      stepPieces(Number(stepBtn.dataset.step));
      return;
    }

    const tick = e.target.closest('.tick');
    if (tick) {
      toggleItem('z', Number(tick.dataset.index), tick);
      return;
    }

    const step = e.target.closest('.schritte li');
    if (step) {
      toggleItem('s', Number(step.dataset.index), step);
      return;
    }

    if (e.target.closest('#addToList')) {
      addToList();
      return;
    }

    if (e.target.closest('#closeDrawer') || e.target.closest('#closeDrawerBottom')) closeRecipe();
    if (e.target.closest('#printBtn')) window.print();
  });

  el.drawer.addEventListener('input', (e) => {
    if (e.target.id !== 'cutterRange') return;
    state.cutter = Number(e.target.value);
    updateCounts();
  });

  el.drawer.addEventListener('keydown', (e) => {
    const step = e.target.closest('.schritte li');
    if (step && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleItem('s', Number(step.dataset.index), step);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (bakeEl.root && !bakeEl.root.hidden) {
      if (e.key === 'Tab') { trapFocus(bakeEl.root, e); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeBake(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); bakeGo(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); bakeGo(-1); return; }
    }
    if (e.key === 'Tab') {
      if (pantryEl.panel && pantryEl.panel.classList.contains('open')) trapFocus(pantryEl.panel, e);
      else if (el.listPanel && el.listPanel.classList.contains('open')) trapFocus(el.listPanel, e);
      else if (state.open) trapFocus(el.drawer, e);
    }
    if (e.key === 'Escape') {
      closePantry();
      closeList();
      closeRecipe();
    }
    if (e.key === '/' && state.open === null && document.activeElement !== el.search) {
      e.preventDefault();
      el.search.focus();
    }
  });

  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#rezept/')) closeRecipe();
  });

  /* ---------- Start ---------- */
  function renderHeroArt() {
    if (!el.heroArt) return;
    const featured = [
      RECIPES.find((r) => r.id === 'zimtsterne'),
      RECIPES.find((r) => r.id === 'lebkuchenherzen'),
      RECIPES.find((r) => r.id === 'vanillekipferl')
    ].filter(Boolean);
    el.heroArt.innerHTML = featured.map((r, i) =>
      `<div class="tile t${i + 1}" style="--tint:${esc(r.tint)}">${cookieArt(r)}</div>`
    ).join('');
  }

  /* ---------- Bewegung ---------- */
  // Ein Beobachter für alles: Abschnitte blenden beim Scrollen ein, die
  // Navigation merkt sich den gelesenen Abschnitt, die Kopfzeile bekommt Tiefe.
  // Kein Scroll-Listener, also keine Arbeit pro Bild.
  function setupMotion() {
    const reduceMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduceMotion && 'IntersectionObserver' in window) {
      const targets = document.querySelectorAll('.section-head, .finder-card, .plan-card, .tips .tip, .tips-extra > *, .site-footer');
      const revealIO = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

      targets.forEach((node) => {
        // Was beim Laden schon zu sehen ist, bleibt einfach stehen.
        if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        const siblings = node.parentElement ? [...node.parentElement.children] : [];
        node.style.setProperty('--d', String(Math.min(siblings.indexOf(node), 4)));
        node.classList.add('reveal');
        revealIO.observe(node);
      });
    }

    if (!('IntersectionObserver' in window)) return;

    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    el.body.insertBefore(sentinel, el.body.firstChild);
    new IntersectionObserver(([entry]) => {
      el.body.classList.toggle('is-scrolled', !entry.isIntersecting);
    }).observe(sentinel);

    const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
    const linkById = new Map(links.map((link) => [link.hash.slice(1), link]));
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          const active = link === linkById.get(entry.target.id);
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-42% 0px -50% 0px' });
    linkById.forEach((link, id) => {
      const section = document.getElementById(id);
      if (section) navIO.observe(section);
    });
  }

  renderChips();
  renderGrid();
  renderHeroArt();
  setupMotion();

  loadPlan();
  const planFromLink = applyPlanHash();
  renderPlanModes();
  renderPlanTune();
  renderPlanGear();
  renderPlanOptions();
  renderPlanMix();
  renderPlan();
  if (planFromLink) savePlan();

  loadPantry();

  const initial = location.hash.match(/^#rezept\/(.+)$/);
  if (initial) openRecipe(decodeURIComponent(initial[1]), false);

  // Offline-Hülle: nach dem ersten Besuch startet die Seite auch ohne Netz.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !IS_APP) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline weiter */ });
    });
  }
})();
