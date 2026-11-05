// ============================================================
// ZENITH VIEWER — Bootstrap + Sistema de Impresión Premium
// ============================================================
import { loadDB, reloadDB, getDB, setViewSeasonId } from './services/storage.js';
import { subscribeToChanges } from './services/supabase.js';
import { registerRoute, startRouter, navigate } from './router.js';
import { initEmoji } from './services/emoji.js';
import { state, loadActiveDivision, saveActiveDivision } from './state.js';
import { applyTheme } from './services/theme.js';
import { openModal, closeTopModal, toast } from './services/ui.js';

// Vistas
import { dashboardView, bindDashboardEvents } from './views/dashboard.js';
import { matchesView, bindMatchesEvents } from './views/matches.js';
import { statsView, bindStatsEvents } from './views/stats.js';
import { rostersView, bindRostersEvents } from './views/rosters.js';
import { playersView, bindPlayersEvents } from './views/players.js';
import { newsView, bindNewsEvents } from './views/news.js';
import { playoffsView, bindPlayoffsEvents } from './views/playoffs.js';
import { ballonDorView, bindBallonDorEvents } from './views/ballonDor.js';
import { marketView, bindMarketEvents } from './views/market.js';
import { performanceView, bindPerformanceEvents } from './views/performance.js';
import { destroyAllCarousels } from './views/widgetCarousel.js';

// Utilidades
import { computeStandings } from './services/standings.js';

window.addEventListener('error', e => console.error('[ZENITH] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[ZENITH] promise rejected:', e.reason));

function safeApplyTheme(){
  try {
    const db = getDB();
    const themeActive = db?.config?.theme?.active;
    applyTheme(themeActive);
  } catch(err) {}
}

async function boot() {
  try {
    await loadDB();
    loadActiveDivision();
    safeApplyTheme();

    const db = getDB();
    const visible = db.divisions.filter(d => d.visible !== false);
    if (!state.divisionId || !db.divisions.find(d => d.id === state.divisionId)) {
      state.divisionId = visible[0]?.id || db.divisions[0]?.id || null;
      if (state.divisionId) saveActiveDivision(state.divisionId);
    }

    updateHeaderLabels();

    registerRoute('dashboard', dashboardView);
    registerRoute('matches',   matchesView);
    registerRoute('playoffs',  playoffsView);
    registerRoute('players',   playersView);
    registerRoute('stats',     statsView);
    registerRoute('performance', performanceView); 
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

    subscribeToChanges(async () => {
      await reloadDB();
      safeApplyTheme();
      updateHeaderLabels();
      refreshView();
    });

    initEmoji();
  } catch (err) {
    console.error('[ZENITH] Boot error:', err);
    document.getElementById('view').innerHTML = `<div class="card" style="border-left:3px solid var(--danger)"><div class="card-title" style="color:var(--danger)">ERROR DE CARGA</div><div>${err.message}</div></div>`;
  }
}

let _currentViewFn = null;
let _currentParams = [];

function cleanupView() {
  if (window._chartStatsInstance) { window._chartStatsInstance.destroy(); window._chartStatsInstance = null; }
  if (window._chartEconomyInstance) { window._chartEconomyInstance.destroy(); window._chartEconomyInstance = null; }
  if (typeof destroyAllCarousels === 'function') destroyAllCarousels();
}

function renderView(viewFn, params) {
  const view = document.getElementById('view');
  try {
    cleanupView();
    view.innerHTML = viewFn(params);
    safeBind(bindDashboardEvents); safeBind(bindMatchesEvents); safeBind(bindStatsEvents);
    safeBind(bindNewsEvents); safeBind(bindPlayoffsEvents); safeBind(bindRostersEvents);
    safeBind(bindPlayersEvents); safeBind(bindBallonDorEvents); safeBind(bindMarketEvents);
    safeBind(bindPerformanceEvents); 
    
    injectPrintButton();
    updateActiveNav();
    window.scrollTo(0, 0);
  } catch (err) {
    view.innerHTML = `<div class="card"><div class="card-title" style="color:var(--danger)">ERROR</div><div>${err.message}</div></div>`;
  }
}

function safeBind(fn) { try { fn?.(); } catch (e) {} }
export function refreshView() { if (_currentViewFn) renderView(_currentViewFn, _currentParams); }

// ============================================================
// 🔥 SISTEMA DE IMPRESIÓN PREMIUM
// ============================================================

function injectPrintButton() {
  const currentRoute = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/')[0];
  const printableRoutes = ['dashboard', 'stats', 'matches', 'playoffs', 'rosters', 'ballonDor'];
  const existingBtn = document.getElementById('btnPrintGlobal');

  if (printableRoutes.includes(currentRoute)) {
    if (existingBtn) return;
    const btn = document.createElement('button');
    btn.id = 'btnPrintGlobal';
    btn.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: var(--accent); color: #04101F; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5); border-radius: 50px; padding: 12px 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: var(--font-display); letter-spacing: 0.1em; transition: transform 0.2s;';
    btn.innerHTML = '🖨️ IMPRIMIR';
    btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.addEventListener('click', openPrintModal);
    document.body.appendChild(btn);
  } else {
    if (existingBtn) existingBtn.remove();
  }
}

function openPrintModal() {
  const db = getDB();
  const division = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  if (!division) return toast('Sin división activa', 'error');

  const matches = db.matches.filter(m => m.divisionId === division.id).sort((a,b) => a.matchday - b.matchday);
  const matchdays = [...new Set(matches.map(m => m.matchday))];

  openModal({
    id: 'print-modal',
    title: 'CENTRO DE IMPRESIÓN',
    body: `
      <div class="field">
        <label>¿Qué deseas imprimir?</label>
        <select class="select" id="print-type">
          <option value="standings">🏆 Tabla General</option>
          <option value="matchday">📅 Jornada completa</option>
          <option value="match">⚔️ Resultado de un Partido</option>
        </select>
      </div>
      <div class="field" id="print-matchday-wrap" style="display:none;">
        <label>Selecciona la Jornada</label>
        <select class="select" id="print-matchday-select">
          ${matchdays.map(md => `<option value="${md}">Jornada ${md}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="print-match-wrap" style="display:none;">
        <label>Selecciona el Partido</label>
        <select class="select" id="print-match-select">
          ${matches.map(m => {
            const A = db.teams.find(t => t.id === m.teamAId)?.name || 'TBD';
            const B = db.teams.find(t => t.id === m.teamBId)?.name || 'TBD';
            return `<option value="${m.id}">J${m.matchday} · ${A} vs ${B}</option>`;
          }).join('')}
        </select>
      </div>
      <div id="print-preview-area" style="display:none; margin-top:20px; text-align:center; background:var(--bg-deep); padding:10px; border-radius:8px; overflow:auto; max-height:400px;">
        <img id="print-image-preview" style="max-width:100%; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.5);">
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close>CANCELAR</button>
      <button class="btn btn-primary" id="btn-generate-print">GENERAR IMAGEN</button>
      <button class="btn btn-primary" id="btn-download-print" style="display:none; background:var(--success); border-color:var(--success); color:#000;">⬇ DESCARGAR</button>
      <button class="btn" id="btn-native-print" style="display:none; border-color:var(--accent); color:var(--accent);">🖨️ IMPRIMIR</button>
    `,
    onMount: root => {
      const typeSel = root.querySelector('#print-type');
      const wrapMd = root.querySelector('#print-matchday-wrap');
      const wrapMatch = root.querySelector('#print-match-wrap');
      const previewArea = root.querySelector('#print-preview-area');
      const imgPreview = root.querySelector('#print-image-preview');
      const btnGen = root.querySelector('#btn-generate-print');
      const btnDl = root.querySelector('#btn-download-print');
      const btnPrint = root.querySelector('#btn-native-print');

      typeSel.addEventListener('change', () => {
        wrapMd.style.display = typeSel.value === 'matchday' ? '' : 'none';
        wrapMatch.style.display = typeSel.value === 'match' ? '' : 'none';
        previewArea.style.display = 'none';
        btnDl.style.display = 'none';
        btnPrint.style.display = 'none';
        btnGen.style.display = 'inline-flex';
      });

      btnGen.addEventListener('click', async () => {
        btnGen.textContent = 'GENERANDO...';
        btnGen.disabled = true;

        try {
          const type = typeSel.value;
          let htmlContent = '';

          // Obtenemos el tema para usarlo en el documento
          const theme = db.config.theme?.active || {};

          if (type === 'standings') {
            htmlContent = buildStandingsHTML(db, division, theme);
          } else if (type === 'matchday') {
            const md = root.querySelector('#print-matchday-select').value;
            htmlContent = buildMatchdayHTML(db, division, md, theme);
          } else if (type === 'match') {
            const matchId = root.querySelector('#print-match-select').value;
            htmlContent = buildMatchHTML(db, division, matchId, theme);
          }

          if (typeof html2canvas === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
          }

          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          tempDiv.style.top = '0';
          tempDiv.style.width = '1000px'; // Ancho fijo para buena calidad
          tempDiv.innerHTML = htmlContent;
          document.body.appendChild(tempDiv);

          const canvas = await html2canvas(tempDiv, { backgroundColor: '#ffffff', scale: 2 });
          const dataUrl = canvas.toDataURL('image/png');
          
          document.body.removeChild(tempDiv);

          imgPreview.src = dataUrl;
          previewArea.style.display = 'block';
          btnGen.style.display = 'none';
          btnDl.style.display = 'inline-flex';
          btnPrint.style.display = 'inline-flex';

          btnDl.onclick = () => {
            const a = document.createElement('a');
            a.download = `ZENITH_${type}_${Date.now()}.png`;
            a.href = dataUrl;
            a.click();
          };

          btnPrint.onclick = () => {
            const win = window.open('');
            win.document.write(`<img src="${dataUrl}" style="width:100%;" onload="window.print();window.close();">`);
          };

        } catch (e) {
          console.error(e);
          toast('Error generando imagen: ' + e.message, 'error');
        } finally {
          btnGen.textContent = 'GENERAR IMAGEN';
          btnGen.disabled = false;
        }
      });
    }
  });
}

// ---------- CONSTRUCTORES HTML PARA IMPRESIÓN ----------

function basePrintTemplate(title, subtitle, contentHTML, theme) {
  const brandName = theme.brandName || 'ZENITH CHAMPIONSHIP';
  const brandMotto = theme.brandMotto || 'YOUR LEVEL IS NOT YOUR LIMIT';
  const logo = theme.logo || '';
  const accent = theme.colors?.accent || '#6FA8FF';
  const gold = theme.colors?.gold || '#E6C476';
  
  // Convertimos el hex del acento a RGB para la sombra
  const hex2rgb = (hex) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1]+hex[1], 16); g = parseInt(hex[2]+hex[2], 16); b = parseInt(hex[3]+hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex[1]+hex[2], 16); g = parseInt(hex[3]+hex[4], 16); b = parseInt(hex[5]+hex[6], 16);
    }
    return `${r}, ${g}, ${b}`;
  };
  const accentRgb = hex2rgb(accent);

  return `
    <div style="font-family: 'Inter', sans-serif; background:#ffffff; color:#111; padding:40px; box-sizing:border-box; width: 1000px; min-height: 800px; display:flex; flex-direction:column;">
      
      <!-- ENCABEZADO CON IDENTIDAD DE LA LIGA -->
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid ${accent}; padding-bottom:20px; margin-bottom:30px;">
        <div style="display:flex; align-items:center; gap:20px;">
          ${logo 
            ? `<img src="${logo}" style="width:80px; height:80px; object-fit:contain;">` 
            : `<div style="width:80px; height:80px; background:${accent}; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:30px; font-weight:bold;">◆</div>`}
          <div>
            <div style="font-family: 'Rajdhani', sans-serif; font-size:32px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:#000; margin:0; line-height:1;">${brandName}</div>
            <div style="font-size:12px; color:#666; letter-spacing:3px; margin-top:6px; text-transform:uppercase;">${brandMotto}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px; font-weight:bold; color:${accent};">${title}</div>
          <div style="font-size:12px; color:#444; margin-top:4px;">${subtitle}</div>
          <div style="font-size:10px; color:#888; margin-top:2px;">Generado el ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      <!-- CUERPO -->
      <div style="flex:1;">
        ${contentHTML}
      </div>

      <!-- PIE DE PÁGINA -->
      <div style="text-align:center; margin-top:40px; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:15px; letter-spacing:1px;">
        DOCUMENTO OFICIAL · ${brandName} · GENERADO POR EL ECOSISTEMA ZENITH
      </div>
    </div>
  `;
}

function buildStandingsHTML(db, division, theme) {
  const season = db.seasons.find(s => s.active) || db.seasons[0];
  const standings = computeStandings(division.id, season?.id);
  const accent = theme.colors?.accent || '#6FA8FF';
  const gold = theme.colors?.gold || '#E6C476';

  const rows = standings.map(r => `
    <tr style="border-bottom: 1px solid #eaeaea;">
      <td style="padding:12px 8px; text-align:center; font-weight:bold; font-family:'Rajdhani',sans-serif; font-size:16px; width:50px; color:${r.pos === 1 ? gold : '#555'};">
        ${r.pos}
      </td>
      <td style="padding:12px 8px;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${r.logo ? `<img src="${r.logo}" style="width:32px; height:32px; object-fit:contain;">` : `<div style="width:32px; height:32px; background:#eee; border-radius:6px;"></div>`}
          <span style="font-weight:600; font-size:14px; color:#111;">${r.name}</span>
        </div>
      </td>
      <td style="padding:12px 8px; text-align:center; font-size:13px; color:#444;">${r.SJ}</td>
      <td style="padding:12px 8px; text-align:center; font-weight:bold; font-size:15px; color:${accent};">${r.PTS}</td>
      <td style="padding:12px 8px; text-align:center; font-size:13px; color:#444;">${r.SG}</td>
      <td style="padding:12px 8px; text-align:center; font-size:13px; color:#444;">${r.DP > 0 ? '+'+r.DP : r.DP}</td>
      <td style="padding:12px 8px; text-align:center; font-size:13px; color:#444;">${r.GF}</td>
      <td style="padding:12px 8px; text-align:center; font-size:13px; color:#444;">${r.GC}</td>
    </tr>
  `).join('');

  const content = `
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:${accent}15; border-bottom:2px solid ${accent};">
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">#</th>
          <th style="padding:12px 8px; text-align:left; font-size:11px; letter-spacing:1px; color:#111;">EQUIPO</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">SJ</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">PTS</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">SG</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">DP</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">GF</th>
          <th style="padding:12px 8px; text-align:center; font-size:11px; letter-spacing:1px; color:#111;">GC</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return basePrintTemplate(`TABLA GENERAL`, `${division.name} · ${season.name}`, content, theme);
}

function buildMatchdayHTML(db, division, matchday, theme) {
  const matches = db.matches.filter(m => m.divisionId === division.id && m.matchday == matchday);
  const accent = theme.colors?.accent || '#6FA8FF';
  
  const rows = matches.map(m => {
    const A = db.teams.find(t => t.id === m.teamAId) || { name: 'TBD' };
    const B = db.teams.find(t => t.id === m.teamBId) || { name: 'TBD' };
    const sA = m.games.filter(g => g.scoreA > g.scoreB).length;
    const sB = m.games.filter(g => g.scoreB > g.scoreA).length;
    const state = m.status === 'finished' ? 'FINALIZADO' : m.status === 'live' ? 'EN JUEGO' : 'PENDIENTE';
    const stateColor = m.status === 'finished' ? '#333' : m.status === 'live' ? '#B23A3A' : '#888';

    return `
      <div style="display:flex; align-items:center; justify-content:center; border-bottom:1px solid #eaeaea; padding:16px 0;">
        <div style="flex:1; display:flex; align-items:center; justify-content:flex-end; gap:12px; padding-right:20px;">
          <span style="font-weight:bold; font-size:16px; color:#111;">${A.name}</span>
          ${A.logo ? `<img src="${A.logo}" style="width:36px; height:36px; object-fit:contain;">` : ''}
        </div>
        
        <div style="background:#f8f9fa; padding:8px 24px; border-radius:8px; font-family:'Rajdhani',sans-serif; font-size:22px; font-weight:bold; border:1px solid #ddd; color:${accent}; min-width:100px; text-align:center;">
          ${sA} - ${sB}
        </div>
        
        <div style="flex:1; display:flex; align-items:center; justify-content:flex-start; gap:12px; padding-left:20px;">
          ${B.logo ? `<img src="${B.logo}" style="width:36px; height:36px; object-fit:contain;">` : ''}
          <span style="font-weight:bold; font-size:16px; color:#111;">${B.name}</span>
        </div>
        
        <div style="width:100px; text-align:right; font-size:11px; font-weight:bold; color:${stateColor}; letter-spacing:1px;">${state}</div>
      </div>
    `;
  }).join('');

  const content = `<div style="display:flex; flex-direction:column;">${rows}</div>`;
  return basePrintTemplate(`JORNADA ${matchday}`, division.name, content, theme);
}

function buildMatchHTML(db, division, matchId, theme) {
  const m = db.matches.find(x => x.id === matchId);
  if (!m) return '';

  const A = db.teams.find(t => t.id === m.teamAId) || { name: 'TBD' };
  const B = db.teams.find(t => t.id === m.teamBId) || { name: 'TBD' };
  const sA = m.games.filter(g => g.scoreA > g.scoreB).length;
  const sB = m.games.filter(g => g.scoreB > g.scoreA).length;
  const accent = theme.colors?.accent || '#6FA8FF';
  const gold = theme.colors?.gold || '#E6C476';

  let gamesHTML = '';
  if (m.games.length > 0) {
    gamesHTML = m.games.map((g, i) => {
      const pA = g.players.filter(p => p.teamId === A.id).map(p => {
        const pl = db.players.find(x=>x.id===p.playerId);
        return `${pl?.name} <span style="color:#666;font-size:10px;">(${p.goals}G, ${p.assists}A)</span>`;
      }).join('<br>');
      
      const pB = g.players.filter(p => p.teamId === B.id).map(p => {
        const pl = db.players.find(x=>x.id===p.playerId);
        return `${pl?.name} <span style="color:#666;font-size:10px;">(${p.goals}G, ${p.assists}A)</span>`;
      }).join('<br>');

      return `
        <div style="margin-bottom:20px; border:1px solid #eaeaea; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
          <div style="background:${accent}10; padding:10px; text-align:center; font-weight:bold; border-bottom:1px solid #eaeaea; color:${accent}; font-size:12px; letter-spacing:1px;">PARTIDA ${i+1}</div>
          <div style="display:flex; justify-content:space-between; padding:20px;">
            <div style="flex:1; text-align:right; padding-right:20px;">
              <div style="font-weight:bold; font-size:16px; margin-bottom:8px; color:#111;">${A.name}</div>
              <div style="font-size:12px; color:#444; line-height:1.6;">${pA || 'Sin datos'}</div>
            </div>
            <div style="font-family:'Rajdhani',sans-serif; font-size:32px; font-weight:bold; padding:0 20px; display:flex; align-items:center; color:${accent};">
              ${g.scoreA} - ${g.scoreB}
            </div>
            <div style="flex:1; text-align:left; padding-left:20px;">
              <div style="font-weight:bold; font-size:16px; margin-bottom:8px; color:#111;">${B.name}</div>
              <div style="font-size:12px; color:#444; line-height:1.6;">${pB || 'Sin datos'}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    gamesHTML = `<div style="text-align:center; color:#888; padding:40px; font-size:14px; border: 1px dashed #ccc; border-radius:12px;">No hay partidas registradas aún.</div>`;
  }

  const content = `
    <!-- HERO DEL PARTIDO -->
    <div style="display:flex; align-items:center; justify-content:center; gap:30px; margin-bottom:40px; background:linear-gradient(180deg, #fff, #f9f9f9); padding:30px; border-radius:16px; border:1px solid #eaeaea;">
      <div style="text-align:center;">
        ${A.logo ? `<img src="${A.logo}" style="width:80px; height:80px; object-fit:contain; margin-bottom:10px;">` : ''}
        <div style="font-weight:bold; font-size:20px; color:#111;">${A.name}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Rajdhani',sans-serif; font-size:64px; font-weight:800; color:${accent}; line-height:1;">${sA} - ${sB}</div>
        <div style="font-size:12px; color:#666; margin-top:10px; text-transform:uppercase; letter-spacing:2px;">${m.format} · Jornada ${m.matchday}</div>
      </div>
      <div style="text-align:center;">
        ${B.logo ? `<img src="${B.logo}" style="width:80px; height:80px; object-fit:contain; margin-bottom:10px;">` : ''}
        <div style="font-weight:bold; font-size:20px; color:#111;">${B.name}</div>
      </div>
    </div>
    ${gamesHTML}
  `;

  return basePrintTemplate(`RESUMEN DEL PARTIDO`, `${A.name} vs ${B.name}`, content, theme);
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

function updateHeaderLabels() {
  const db = getDB();
  if (!db) return;
  const active = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  const nameEl = document.getElementById('currentDivisionName');
  if (nameEl && active) nameEl.textContent = active.name;

  const viewingId = db.viewSeasonId;
  let season;
  if (viewingId) season = (db.archivedSeasons || []).find(s => s.id === viewingId) || null;
  else season = db.seasons.find(s => s.active) || db.seasons[0] || null;

  const chipSeason = document.getElementById('currentSeasonName');
  if (chipSeason && season) chipSeason.textContent = season.name;
}

function buildSeasonDropdown() {
  const db = getDB();
  const dropdown = document.getElementById('seasonDropdown');
  if (!dropdown) return;

  const viewingId = db.viewSeasonId;
  const activeSeason = db.seasons.find(s => s.active);
  const archived = [...(db.archivedSeasons || [])].sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));

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

  dropdown.innerHTML = `${activeHTML}${archived.length > 0 ? '<div class="season-dropdown-sep"></div>' : ''}${archivedHTML || ''}`;

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

function buildDivisionDropdown() {
  const db = getDB();
  const dropdown = document.getElementById('divisionDropdown');
  if (!dropdown) return;
  const visible = db.divisions.filter(d => d.visible !== false);
  if (!visible.length) { dropdown.innerHTML = `<div class="division-dropdown-empty">Sin divisiones</div>`; return; }
  
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

function setupHeaderEvents() {
  document.getElementById('seasonBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('seasonDropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      buildSeasonDropdown(); dd.classList.remove('hidden');
      document.getElementById('divisionDropdown')?.classList.add('hidden');
    } else dd.classList.add('hidden');
  });

  document.getElementById('divisionBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('divisionDropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      buildDivisionDropdown(); dd.classList.remove('hidden');
      document.getElementById('seasonDropdown')?.classList.add('hidden');
    } else dd.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    const sd = document.getElementById('seasonDropdown');
    if (sd && !sd.classList.contains('hidden') && !e.target.closest('#seasonSelector')) sd.classList.add('hidden');
    const dd = document.getElementById('divisionDropdown');
    if (dd && !dd.classList.contains('hidden') && !e.target.closest('#divisionSelector')) dd.classList.add('hidden');
  });
}

function setupMobileSidebar() {
  const sidebar = document.getElementById('publicSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open  = () => { sidebar?.classList.add('open'); overlay?.classList.add('open'); };
  const close = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('open'); };

  document.getElementById('menuToggle')?.addEventListener('click', open);
  document.getElementById('sidebarClose')?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

boot();
