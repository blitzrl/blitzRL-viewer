// ============================================================
// PLAYOFFS VIEW — Bracket visual, solo lectura
// ============================================================
import { getDB } from '../services/storage.js';
import { state } from '../state.js';
import { getPlayoff, getFormatForRound } from '../services/playoffs.js';
import { openMatchSummary } from './matchSummary.js';

// ============================================================
// LAYOUT
// ============================================================
const W = 220;
const H = 125;
const GAP_V = 26;
const GAP_H = 90;
const PAD = 40;
const TITLE_OFFSET = 34;

export function playoffsView(){
  const db = getDB();
  const division = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  if (!division) return `<div class="card">Sin división activa.</div>`;
  const playoff = getPlayoff(division.id);

  if (!playoff || !playoff.bracket || !playoff.bracket.rounds){
    return `
      <div class="page-head">
        <h1 class="page-title">PLAY-OFFS</h1>
      </div>
      <div class="card" style="text-align:center;padding:40px;color:var(--muted)">
        El bracket aún no se ha generado.
      </div>
    `;
  }

  const champion = playoff.championId ? db.teams.find(t => t.id === playoff.championId) : null;

  return `
    <div class="page-head">
      <h1 class="page-title">PLAY-OFFS</h1>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="chip chip-accent">${esc(division.name)}</span>
        ${champion ? `<span class="chip chip-gold">🏆 ${esc(champion.name)}</span>` : ''}
      </div>
    </div>

    <div class="bracket-v6-wrap" id="bracketWrap">
      <div class="bracket-v6-canvas" id="bracketCanvas"></div>
    </div>
  `;
}

export function bindPlayoffsEvents(){
  renderBracketCanvas();

  const wrap = document.getElementById('bracketWrap');
  if (wrap){
    wrap.addEventListener('click', (e) => {
      const nodeEl = e.target.closest('[data-summary-match]');
      if (!nodeEl) return;
      const [roundId, idx] = nodeEl.dataset.summaryMatch.split(':');
      try {
        const db2 = getDB();
        const div2 = db2.divisions.find(d => d.id === state.divisionId) || db2.divisions[0];
        const pl2 = getPlayoff(div2.id);
        const rd = pl2?.bracket?.rounds?.find(r => r.id === roundId);
        const m = rd?.matches?.[+idx];
        if (!m) return;

        const games = m.games || [];
        const status = m.winnerId ? 'finished' : (games.length > 0 ? 'live' : 'pending');

        openMatchSummary({
          id: m.id,
          teamAId: m.teamA?.teamId,
          teamBId: m.teamB?.teamId,
          games: games,
          format: m.format || getFormatForRound(roundId, div2),
          status
        }, { title: `RESUMEN · ${rd.name}` });
      } catch (err){
        console.error('[ZENITH] Summary error:', err);
      }
    });
  }
}

// ============================================================
// RENDER DEL BRACKET
// ============================================================
function renderBracketCanvas(){
  const canvas = document.getElementById('bracketCanvas');
  if (!canvas) return;

  const db = getDB();
  const division = db.divisions.find(d => d.id === state.divisionId) || db.divisions[0];
  const playoff = getPlayoff(division.id);
  if (!playoff || !playoff.bracket || !playoff.bracket.rounds) return;

  const rounds = playoff.bracket.rounds;
  const playInRound = rounds.find(r => r.id === 'playIn');
  const mainRounds = rounds.filter(r => r.id !== 'playIn');
  if (mainRounds.length === 0) return;

  const N0 = mainRounds[0].matches.length;
  const H_TOTAL = N0 * H + (N0 - 1) * GAP_V;

  let xCursor = PAD;
  const xPlayIn = playInRound ? xCursor : null;
  if (playInRound) xCursor += W + GAP_H;
  const mainX = [];
  mainRounds.forEach(() => {
    mainX.push(xCursor);
    xCursor += W + GAP_H;
  });

  const positions = {};

  if (playInRound){
    const piMatches = playInRound.matches;
    const piH = piMatches.length * H + (piMatches.length - 1) * GAP_V;
    const piTop0 = TITLE_OFFSET + (H_TOTAL - piH) / 2;
    positions.playIn = piMatches.map((_, i) => {
      const top = piTop0 + i * (H + GAP_V);
      return { top, center: top + H / 2, x: xPlayIn };
    });
  }

  positions[mainRounds[0].id] = [];
  for (let i = 0; i < N0; i++){
    const center = TITLE_OFFSET + i * (H + GAP_V) + H / 2;
    positions[mainRounds[0].id].push({ top: center - H / 2, center, x: mainX[0] });
  }

  for (let r = 1; r < mainRounds.length; r++){
    const prev = positions[mainRounds[r - 1].id];
    const cur = mainRounds[r];
    positions[cur.id] = [];
    for (let i = 0; i < cur.matches.length; i++){
      const cA = prev[2 * i].center;
      const cB = prev[2 * i + 1].center;
      const center = (cA + cB) / 2;
      positions[cur.id].push({ top: center - H / 2, center, x: mainX[r] });
    }
  }

  const canvasW = xCursor - GAP_H + PAD;
  const canvasH = TITLE_OFFSET + H_TOTAL + PAD;
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';

  let html = '';

  if (playInRound){
    html += `<div class="bracket-v6-title" style="left:${xPlayIn}px;top:0;width:${W}px">${esc(playInRound.name)}</div>`;
  }
  mainRounds.forEach((round, r) => {
    const isFinal = r === mainRounds.length - 1;
    html += `<div class="bracket-v6-title ${isFinal ? 'is-final' : ''}" style="left:${mainX[r]}px;top:0;width:${W}px">${esc(round.name)}</div>`;
  });

  if (playInRound){
    playInRound.matches.forEach((m, i) => {
      const p = positions.playIn[i];
      html += renderNode(m, playInRound.id, i, p.x, p.top, true);
    });
  }

  mainRounds.forEach(round => {
    round.matches.forEach((m, i) => {
      const p = positions[round.id][i];
      html += renderNode(m, round.id, i, p.x, p.top, false);
    });
  });

  const paths = [];

  for (let r = 0; r < mainRounds.length - 1; r++){
    const cur = mainRounds[r];
    const nxt = mainRounds[r + 1];
    const curPos = positions[cur.id];
    const nxtPos = positions[nxt.id];

    nxt.matches.forEach((m, i) => {
      const pA = curPos[2 * i];
      const pB = curPos[2 * i + 1];
      const pP = nxtPos[i];
      if (!pA || !pB || !pP) return;

      const xRight = pA.x + W;
      const xLeftNext = pP.x;
      const xMid = xRight + (GAP_H / 2);

      paths.push(`M ${xRight} ${pA.center} L ${xMid} ${pA.center}`);
      paths.push(`M ${xRight} ${pB.center} L ${xMid} ${pB.center}`);
      paths.push(`M ${xMid} ${pA.center} L ${xMid} ${pB.center}`);
      paths.push(`M ${xMid} ${pP.center} L ${xLeftNext} ${pP.center}`);
    });
  }

  const svgPathHTML = paths.map(d => `<path d="${d}" />`).join('');
  const svg = `<svg class="bracket-v6-lines" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">${svgPathHTML}</svg>`;

  canvas.innerHTML = svg + html;
}

function renderNode(m, roundId, idx, x, y, isPlayIn){
  const ready = m.teamA?.teamId && m.teamB?.teamId;
  const reported = !!m.winnerId;
  const isBye = m.isBye === true;
  const hasGames = (m.games || []).length > 0;

  const wonA = (m.games || []).filter(g => g.scoreA > g.scoreB).length;
  const wonB = (m.games || []).filter(g => g.scoreB > g.scoreA).length;

  const winnerA = reported && m.teamA?.teamId === m.winnerId;
  const winnerB = reported && m.teamB?.teamId === m.winnerId;

  let footHTML = '';
  if (isBye){
    footHTML = `<span class="bracket-v6-foot-text muted">— BYE —</span>`;
  } else if (reported){
    footHTML = `<span class="bracket-v6-foot-text">✔ FINAL</span>`;
  } else if (hasGames){
    footHTML = `<span class="badge badge-live" style="font-size:9px;padding:2px 6px">EN JUEGO</span>`;
  } else if (ready){
    footHTML = `<span class="bracket-v6-foot-text muted">PENDIENTE</span>`;
  } else {
    footHTML = `<span class="bracket-v6-foot-text muted">ESPERANDO</span>`;
  }

  const classes = ['bracket-v6-node'];
  if (isPlayIn) classes.push('is-playin');
  if (reported && !isBye && hasGames) classes.push('is-reported');

  // ✅ Cambio: clickeable cuando hay partidas jugadas (live o finished)
  const summaryAttr = (!isBye && hasGames) ? `data-summary-match="${roundId}:${idx}"` : '';
  // Cursor pointer también cuando está en vivo (no solo reportado)
  const cursorStyle = (!isBye && hasGames && !reported) ? 'cursor:pointer;' : '';

  return `
    <div class="${classes.join(' ')}" style="left:${x}px;top:${y}px;width:${W}px;height:${H}px;${cursorStyle}" ${summaryAttr}>
      ${renderRow(m.teamA, winnerA, 'A', m, roundId, idx, wonA, wonB, isBye)}
      ${renderRow(m.teamB, winnerB, 'B', m, roundId, idx, wonA, wonB, isBye)}
      <div class="bracket-v6-foot">${footHTML}</div>
    </div>
  `;
}

function renderRow(team, isWinner, side, match, roundId, idx, wonA, wonB, isBye){
  if (!team || !team.teamId){
    return `
      <div class="bracket-v6-row empty" data-slot="${side}" data-match-id="${match.id}" data-round-id="${roundId}" data-match-index="${idx}">
        <span class="bracket-v6-seed">–</span>
        <span class="bracket-v6-name tbd">TBD</span>
      </div>`;
  }
  const seed = team.pos ? `${team.pos}` : '–';

  let scoreDisplay = '';
  let scoreColor = 'var(--muted)';
  if (isBye){
    scoreDisplay = '—';
    scoreColor = 'var(--muted)';
  } else if ((wonA + wonB) > 0){
    scoreDisplay = side === 'A' ? wonA : wonB;
    scoreColor = isWinner ? 'var(--success)' : 'var(--silver-light)';
  } else {
    scoreDisplay = '0';
    scoreColor = 'var(--muted)';
  }

  return `
    <div class="bracket-v6-row ${isWinner ? 'winner' : ''}"
         data-slot="${side}" data-match-id="${match.id}" data-round-id="${roundId}" data-match-index="${idx}">
      <span class="bracket-v6-seed">${seed}</span>
      ${team.logo
        ? `<img src="${team.logo}" class="bracket-v6-logo" alt="">`
        : `<span class="bracket-v6-logo placeholder">◆</span>`}
      <span class="bracket-v6-name">${esc(team.name)}</span>
      <span style="font-family:var(--font-display);font-size:15px;color:${scoreColor};min-width:22px;text-align:right;letter-spacing:.04em;flex-shrink:0;font-weight:600">${scoreDisplay}</span>
    </div>
  `;
}

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}