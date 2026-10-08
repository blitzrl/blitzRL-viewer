// ============================================================
// ZENITH VIEWER — Bootstrap
// ============================================================
import { loadDB, reloadDB, getDB, setViewSeasonId } from './services/storage.js';
import { subscribeToChanges } from './services/supabase.js';
import { registerRoute, startRouter, navigate } from './router.js';
import { initEmoji } from './services/emoji.js';
import { state, loadActiveDivision, saveActiveDivision } from './state.js';
import { applyTheme } from './services/theme.js';

import { dashboardView, bindDashboardEvents } from './views/dashboard.js';
import { matchesView, bindMatchesEvents } from './views/matches.js';
import { statsView, bindStatsEvents } from './views/stats.js';
import { rostersView, bindRostersEvents } from './views/rosters.js';
import { playersView, bindPlayersEvents } from './views/players.js';
import { newsView, bindNewsEvents } from './views/news.js';
import { playoffsView, bindPlayoffsEvents } from './views/playoffs.js';
import { ballonDorView, bindBallonDorEvents } from './views/ballonDor.js';
import { marketView, bindMarketEvents } from './views/market.js';

window.addEventListener('error', e => console.error('[ZENITH] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[ZENITH] promise rejected:', e.reason));

// ---------- TEMA ----------
function safeApplyTheme(){
  try {
    const db = getDB();
    const themeActive = db?.config?.theme?.active;
    applyTheme(themeActive);
  } catch(err) {
    console.warn('[ZENITH] No se pudo aplicar el tema:', err);
  }
}

// ---------- BOOT ----------
async function boot() {
  try {
    await loadDB();
    loadActiveDivision();

    // ✅ Aplicar tema tras cargar la DB
    safeApplyTheme();

    const db = getDB();

    const visible = db.divisions.filter(d => d.visible !== false);
    if (!state.divisionId || !db.divisions.find(d => d.id === state.divisionId)) {
      state.divisionId = visible[0]?.id || db.divisions[0]?.id || null;
      if (state.divisionId) saveActiveDivision(state.divisionId);
    }

    updateHeaderLabels();

    // ---------- RUTAS ----------
    registerRoute('dashboard', dashboardView);
    registerRoute('matches',   matchesView);
    registerRoute('playoffs',  playoffsView);
    registerRoute('players',   playersView);
    registerRoute('stats',     statsView);
    registerRoute('ballonDor', ballonDorView);
    registerRoute('rosters',   rostersView);
    registerRoute('market',    marketView);
    registerRoute('news',      newsView);

    startRouter((viewFn, params) => {
      _currentViewFn = viewFn;
      _currentParams = params;
      renderView(viewFn, params);
    });

    setupHeaderEvents();
    setupMobileSidebar();

    // Realtime
    subscribeToChanges(async () => {
      await reloadDB();
      // ✅ Re-aplicar tema tras reload remoto
      safeApplyTheme();
      updateHeaderLabels();
      refreshView();
    });

    initEmoji();

  } catch (err) {
    console.error('[ZENITH] Boot error:', err);
    document.getElementById('view').innerHTML = `
      <div class="card" style="border-left:3px solid var(--danger); max-width: 700px; margin: 40px auto;">
        <div class="card-title" style="color:var(--danger)">◆ ERROR DE CARGA</div>
        <div style="margin-top:12px;font-size:13px;color:var(--silver)">
          No se pudieron cargar los datos desde Supabase. Revisa tu conexión y la configuración.
        </div>
        <pre style="margin-top:12px;font-size:11px;color:var(--muted);white-space:pre-wrap;overflow:auto;max-height:300px">${(err.stack || err.message || '').replace(/</g,'&lt;')}</pre>
      </div>`;
  }
}

// ---------- RENDER ----------
let _currentViewFn = null;
let _currentParams = [];

function renderView(viewFn, params) {
  const view = document.getElementById('view');
  try {
    view.innerHTML = viewFn(params);
    safeBind(bindDashboardEvents);
    safeBind(bindMatchesEvents);
    safeBind(bindStatsEvents);
    safeBind(bindNewsEvents);
    safeBind(bindPlayoffsEvents);
    safeBind(bindRostersEvents);
    safeBind(bindPlayersEvents);
    safeBind(bindBallonDorEvents);
    safeBind(bindMarketEvents);
    updateActiveNav();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('[ZENITH] Render error:', err);
    view.innerHTML = `
      <div class="card" style="border-left:3px solid var(--danger)">
        <div class="card-title" style="color:var(--danger)">◆ ERROR AL RENDERIZAR</div>
        <div style="margin-top:12px;font-size:13px;color:var(--silver)">${err.message}</div>
      </div>`;
  }
}

function safeBind(fn) {
  try { fn?.(); }
  catch (e) { console.error('[ZENITH] bind error en', fn?.name, e); }
}

export function refreshView() {
  if (_currentViewFn) renderView(_currentViewFn, _currentParams);
}

// ---------- NAV ----------
function updateActiveNav() {
  const current = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/')[0];
  document.querySelectorAll('[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === current);
  });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-route]');
  if (!el) return;
  const route = el.dataset.route;
  if (!route) return;
  e.preventDefault();
  navigate(route);
  document.getElementById('publicSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
});

// ---------- HEADER LABELS ----------
function updateHeaderLabels() {
  const db = getDB();
  if (!db) return;

  const active = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  const nameEl = document.getElementById('currentDivisionName');
  if (nameEl && active) nameEl.textContent = active.name;

  const viewingId = db.viewSeasonId;
  let season;
  if (viewingId) {
    season = (db.archivedSeasons || []).find(s => s.id === viewingId) || null;
  } else {
    season = db.seasons.find(s => s.active) || db.seasons[0] || null;
  }
  const chipSeason = document.getElementById('currentSeasonName');
  if (chipSeason && season) chipSeason.textContent = season.name;
}

// ---------- SEASON DROPDOWN ----------
function buildSeasonDropdown() {
  const db = getDB();
  const dropdown = document.getElementById('seasonDropdown');
  if (!dropdown) return;

  const viewingId = db.viewSeasonId;
  const activeSeason = db.seasons.find(s => s.active);
  const archived = [...(db.archivedSeasons || [])].sort((a, b) =>
    (b.archivedAt || '').localeCompare(a.archivedAt || '')
  );

  const activeHTML = activeSeason ? `
    <button class="season-dropdown-item ${!viewingId ? 'active' : ''}" data-season-id="">
      <span class="season-dropdown-name">
        <span>🟢 ${esc(activeSeason.name)}</span>
        <span class="season-dropdown-meta">TEMPORADA ACTIVA</span>
      </span>
    </button>
  ` : '';

  const archivedHTML = archived.map(arch => {
    const isCurrent = viewingId === arch.id;
    const champs = arch.championByDivision || {};
    const firstChamp = Object.values(champs)[0];
    return `
      <button class="season-dropdown-item ${isCurrent ? 'active' : ''}" data-season-id="${arch.id}">
        <span class="season-dropdown-name">
          <span>📦 ${esc(arch.name)}</span>
          <span class="season-dropdown-meta">${arch.year || ''}${firstChamp ? ' · 🏆 ' + esc(firstChamp.teamName) : ''}</span>
        </span>
      </button>
    `;
  }).join('');

  dropdown.innerHTML = `
    ${activeHTML}
    ${archived.length > 0 ? '<div class="season-dropdown-sep"></div>' : ''}
    ${archivedHTML || ''}
  `;

  dropdown.querySelectorAll('[data-season-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.seasonId || null;
      setViewSeasonId(id);
      state.viewSeasonId = id;
      dropdown.classList.add('hidden');
      updateHeaderLabels();
      refreshView();
    });
  });
}

// ---------- DIVISION DROPDOWN ----------
function buildDivisionDropdown() {
  const db = getDB();
  const dropdown = document.getElementById('divisionDropdown');
  if (!dropdown) return;
  const visible = db.divisions.filter(d => d.visible !== false);
  if (!visible.length) {
    dropdown.innerHTML = `<div class="division-dropdown-empty">Sin divisiones</div>`;
    return;
  }
  const activeId = visible.find(d => d.id === state.divisionId)?.id || visible[0].id;
  dropdown.innerHTML = visible.map(d => `
    <button class="division-dropdown-item ${d.id === activeId ? 'active' : ''}" data-division-id="${d.id}">
      <span class="division-dropdown-tier">${d.tier}ª</span>
      <span class="division-dropdown-name">${esc(d.name)}</span>
    </button>
  `).join('');

  dropdown.querySelectorAll('[data-division-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveActiveDivision(btn.dataset.divisionId);
      dropdown.classList.add('hidden');
      updateHeaderLabels();
      refreshView();
    });
  });
}

// ---------- HEADER EVENTS ----------
function setupHeaderEvents() {
  document.getElementById('seasonBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('seasonDropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      buildSeasonDropdown();
      dd.classList.remove('hidden');
      document.getElementById('divisionDropdown')?.classList.add('hidden');
    } else {
      dd.classList.add('hidden');
    }
  });

  document.getElementById('divisionBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('divisionDropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      buildDivisionDropdown();
      dd.classList.remove('hidden');
      document.getElementById('seasonDropdown')?.classList.add('hidden');
    } else {
      dd.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    const sd = document.getElementById('seasonDropdown');
    if (sd && !sd.classList.contains('hidden') && !e.target.closest('#seasonSelector')) {
      sd.classList.add('hidden');
    }
    const dd = document.getElementById('divisionDropdown');
    if (dd && !dd.classList.contains('hidden') && !e.target.closest('#divisionSelector')) {
      dd.classList.add('hidden');
    }
  });
}

// ---------- MOBILE SIDEBAR ----------
function setupMobileSidebar() {
  const sidebar = document.getElementById('publicSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open  = () => { sidebar?.classList.add('open'); overlay?.classList.add('open'); };
  const close = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('open'); };

  document.getElementById('menuToggle')?.addEventListener('click', open);
  document.getElementById('sidebarClose')?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
}

// ---------- UTILS ----------
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// ---------- START ----------
boot();