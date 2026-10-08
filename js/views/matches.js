// ============================================================
// MATCHES VIEW — Solo lectura (visualizador)
// ============================================================
import { getDB } from '../services/storage.js';
import { state } from '../state.js';
import { openMatchSummary } from './matchSummary.js';

export function matchesView(){
  const db = getDB();
  const division = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  if (!division) return `<div class="card">Sin división activa.</div>`;

  const matches = db.matches
    .filter(m => m.divisionId === division.id)
    .sort((a, b) => a.matchday - b.matchday);

  const byDay = {};
  matches.forEach(m => (byDay[m.matchday] ||= []).push(m));

  return `
    <div class="page-head">
      <h1 class="page-title">JORNADAS</h1>
    </div>
    ${Object.keys(byDay).length === 0 ? '<div class="card">No hay jornadas generadas.</div>' : ''}
    ${Object.entries(byDay).map(([day, list]) => `
      <div class="card" style="margin-bottom:16px" data-matchday="${day}">
        <div class="card-header">
          <div class="card-title"><span class="dot">◆</span>JORNADA ${day}</div>
          <span class="card-sub">${list.length} partidos</span>
        </div>
        ${list.map(m => matchRow(m)).join('')}
      </div>
    `).join('')}
  `;
}

function matchRow(m){
  const db = getDB();
  const A = db.teams.find(t => t.id === m.teamAId) || null;
  const B = db.teams.find(t => t.id === m.teamBId) || null;
  const sA = m.games.filter(g => g.scoreA > g.scoreB).length;
  const sB = m.games.filter(g => g.scoreB > g.scoreA).length;
  const status = m.status === 'finished'
    ? `<span class="badge badge-win">FINAL</span>`
    : m.status === 'live' ? `<span class="badge badge-live">EN JUEGO</span>`
    : `<span class="badge">PENDIENTE</span>`;
  const dateLine = (m.date || m.time)
    ? `<div class="match-meta-line">
         ${m.date ? `<i class="fa-solid fa-calendar"></i> ${m.date}` : ''}
         ${m.time ? `<i class="fa-solid fa-clock"></i> ${m.time}` : ''}
         <span class="chip chip-accent" style="margin-left:6px">${m.format || 'BO3'}</span>
       </div>`
    : `<div class="match-meta-line"><span class="chip">${m.format || 'BO3'}</span> <span style="color:var(--muted);font-size:11px">sin fecha asignada</span></div>`;

  // Clickeable cuando tiene partidas jugadas (live o finished)
  const hasGames = (m.games || []).length > 0;
  const clickable = hasGames;
  const summaryAttr = clickable ? `data-match-summary="${m.id}"` : '';

  const renderSide = (team, side) => {
    if (!team){
      return `<div class="match-team match-team-${side === 'A' ? 'home' : 'away'}" data-slot="${side}" data-match-id="${m.id}" data-empty="true">
        <span style="color:var(--muted);font-size:11px">— vacío —</span>
      </div>`;
    }
    const logo = team.logo
      ? `<img src="${team.logo}" class="match-team-logo" alt="">`
      : `<div class="match-team-logo match-team-logo-empty">◆</div>`;
    const content = side === 'A'
      ? `${logo}<span class="match-team-name">${esc(team.name)}</span>`
      : `<span class="match-team-name">${esc(team.name)}</span>${logo}`;
    return `<div class="match-team match-team-${side === 'A' ? 'home' : 'away'}"
                 data-slot="${side}" data-match-id="${m.id}">${content}</div>`;
  };

  return `
    <div class="match-row" data-match-id="${m.id}" ${summaryAttr} style="${clickable ? 'cursor:pointer' : ''}">
      <div class="match-row-top">
        ${renderSide(A, 'A')}
        <div class="match-score">
          <span class="match-score-value">${sA}</span>
          <span class="match-score-sep">–</span>
          <span class="match-score-value">${sB}</span>
        </div>
        ${renderSide(B, 'B')}
      </div>
      <div class="match-row-bottom">
        ${dateLine}
        <div class="match-actions">
          ${status}
        </div>
      </div>
    </div>
  `;
}

export function bindMatchesEvents(){
  document.querySelectorAll('[data-match-summary]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const m = getDB().matches.find(x => x.id === row.dataset.matchSummary);
      if (!m) return;
      openMatchSummary(m, { title: `JORNADA ${m.matchday} · RESUMEN` });
    });
  });
}

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}