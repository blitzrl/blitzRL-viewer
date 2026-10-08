// ============================================================
// MARKET VIEW — Solo lectura (visualizador público)
// ============================================================
import { getDB } from '../services/storage.js';
import { openModal } from '../services/ui.js';

let _mktDiv  = 'all';
let _mktType = 'all';

export function marketView(){
  const db = getDB();
  const log = [...(db.transferLog || [])].sort((a, b) => b.date - a.date);

  const filtered = log.filter(m => {
    if (_mktDiv !== 'all' && m.toDivisionId !== _mktDiv && m.fromDivisionId !== _mktDiv) return false;
    if (_mktType !== 'all' && m.type !== _mktType) return false;
    return true;
  });

  const totals = {
    total: log.length,
    transfers: log.filter(m => m.type === 'transfer').length,
    free: log.filter(m => m.type === 'free').length,
    pending: log.filter(m => m.type === 'pending').length
  };

  return `
    <div class="page-head">
      <h1 class="page-title">TRANSFER MARKET</h1>
      <span class="chip chip-readonly">📖 SOLO LECTURA</span>
    </div>

    <div class="market-kpi-strip">
      <div class="kpi"><div class="kpi-val">${totals.total}</div><div class="kpi-lab">MOVIMIENTOS</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--accent)">${totals.transfers}</div><div class="kpi-lab">FICHAJES</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--success)">${totals.free}</div><div class="kpi-lab">AGENTES LIBRES</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--gold)">${totals.pending}</div><div class="kpi-lab">PENDIENTES</div></div>
    </div>

    <div class="card market-filters-card">
      <div class="market-filters">
        <div class="field market-filter-field">
          <label>División</label>
          <select class="select" id="mkt-fdiv">
            <option value="all">Todas</option>
            ${db.divisions.map(d => `<option value="${d.id}" ${_mktDiv === d.id ? 'selected' : ''}>${d.tier || '?'}ª · ${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field market-filter-field">
          <label>Tipo</label>
          <select class="select" id="mkt-ftype">
            <option value="all">Todos</option>
            <option value="transfer" ${_mktType === 'transfer' ? 'selected' : ''}>Fichajes</option>
            <option value="free" ${_mktType === 'free' ? 'selected' : ''}>Agentes Libres</option>
            <option value="pending" ${_mktType === 'pending' ? 'selected' : ''}>Pendientes</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><span class="dot">◆</span>HISTORIAL DE MOVIMIENTOS</div>
        <span class="card-sub">${filtered.length} movimiento${filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap market-table-wrap">
        <table class="ztable market-table">
          <thead>
            <tr>
              <th class="col-mkt-date">FECHA</th>
              <th class="col-mkt-player">JUGADOR</th>
              <th class="col-mkt-route">ORIGEN → DESTINO</th>
              <th class="num col-mkt-type">TIPO</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">Sin movimientos registrados</td></tr>'
              : filtered.map(m => marketRow(m)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function marketRow(m){
  const db = getDB();
  const player = db.players.find(p => p.id === m.playerId) || {};
  const fromTeam = db.teams.find(t => t.id === m.fromTeamId);
  const toTeam = db.teams.find(t => t.id === m.toTeamId);
  const typeLabel = m.type === 'transfer' ? 'FICHAJE' : m.type === 'free' ? 'LIBRE' : 'PENDIENTE';
  const typeClass = m.type === 'transfer' ? 'transfer' : m.type === 'free' ? 'free' : 'pending';

  return `
    <tr class="market-row-clickable" data-player-market="${m.playerId}" ${player.id ? '' : 'style="cursor:default"'}>
      <td class="col-mkt-date" style="font-size:11px;color:var(--muted)">
        ${m.date ? new Date(m.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
      </td>
      <td class="col-mkt-player">
        <div class="player-cell">
          ${player.profilePicture
            ? `<img src="${player.profilePicture}" class="player-cell-avatar" alt="">`
            : `<div class="player-cell-avatar player-cell-avatar-empty">${esc((player.name || '?').slice(0, 2).toUpperCase())}</div>`}
          <span class="player-cell-name">${esc(player.name || m.playerName || '?')}</span>
        </div>
      </td>
      <td class="col-mkt-route">
        <div class="market-route">
          <span class="market-team-pill">
            ${fromTeam?.logo ? `<img src="${fromTeam.logo}" alt="">` : ''}
            <span class="market-team-name">${esc(m.fromTeamName || 'Sin equipo')}</span>
          </span>
          <span class="market-arrow">→</span>
          <span class="market-team-pill">
            ${toTeam?.logo ? `<img src="${toTeam.logo}" alt="">` : ''}
            <span class="market-team-name">${esc(m.toTeamName || 'Agente libre')}</span>
          </span>
        </div>
      </td>
      <td class="num col-mkt-type">
        <span class="market-type-chip ${typeClass}">${typeLabel}</span>
      </td>
    </tr>
  `;
}

export function bindMarketEvents(){
  const fd = document.getElementById('mkt-fdiv');
  if (fd) fd.addEventListener('change', () => {
    _mktDiv = fd.value;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  const ft = document.getElementById('mkt-ftype');
  if (ft) ft.addEventListener('change', () => {
    _mktType = ft.value;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  document.querySelectorAll('[data-player-market]').forEach(row => {
    row.addEventListener('click', (e) => {
      const pid = row.dataset.playerMarket;
      if (!pid) return;
      const db = getDB();
      const player = db.players.find(x => x.id === pid);
      if (!player) return;
      location.hash = '#/players/' + pid;
    });
  });
}

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}