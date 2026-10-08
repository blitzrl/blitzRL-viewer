// ============================================================
// NEWS VIEW — Solo lectura (visualizador)
// ============================================================
import { getDB } from '../services/storage.js';
import { openModal } from '../services/ui.js';
import { renderBlocksHTML } from './dashboard.js';

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// ============================================================
// VISTA PRINCIPAL
// ============================================================
export function newsView(){
  const db = getDB();
  const sorted = [...db.news].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.date || '').localeCompare(a.date || '');
  });

  return `
    <div class="page-head">
      <h1 class="page-title">NOTICIAS</h1>
      <span class="chip chip-readonly">📖 SOLO LECTURA</span>
    </div>
    <div class="news-list-grid">
      ${sorted.map(n => `
        <div class="news-list-card ${n.pinned ? 'pinned' : ''} ${n.goldenFrame ? 'golden' : ''}" data-news-open="${n.id}">
          ${n.banner ? `<div class="news-list-banner"><img src="${n.banner}"></div>` : ''}
          <div class="news-list-body">
            <div class="news-list-cat">
              ${n.pinned ? '📌 ' : ''}${esc(n.category || 'GENERAL')} · ${n.date || ''}
              ${n.goldenFrame ? ' · 🏆 DESTACADA' : ''}
            </div>
            <div class="news-list-title">${esc(n.title)}</div>
            <div class="news-list-excerpt">${esc((n.body || '').slice(0, 140))}${(n.body || '').length > 140 ? '…' : ''}</div>
          </div>
        </div>`).join('') || '<div class="card">Sin noticias</div>'}
    </div>
  `;
}

// ============================================================
// BINDING
// ============================================================
export function bindNewsEvents(){
  document.querySelectorAll('[data-news-open]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openNewsModal(card.dataset.newsOpen);
    });
  });
}

// ============================================================
// MODAL
// ============================================================
function openNewsModal(id){
  const db = getDB();
  const n = db.news.find(x => x.id === id);
  if (!n) return;

  const body = (n.blocks && n.blocks.length > 0)
    ? renderBlocksHTML(n.blocks, db)
    : `<div class="news-modal-body">${esc((n.body || '')).replace(/\n/g, '<br>')}</div>`;

  openModal({
    id: 'news-view-' + id,
    title: n.category || 'NOTICIA',
    wide: true,
    body: `
      <div class="news-modal ${n.goldenFrame ? 'golden-frame' : ''}">
        ${n.banner ? `<div class="news-modal-banner"><img src="${n.banner}" alt=""></div>` : ''}
        <h2 class="news-modal-title">${n.goldenFrame ? '🏆 ' : ''}${esc(n.title)}</h2>
        <div class="news-modal-meta">
          <span>${n.date || ''}</span>
          ${n.category ? `<span class="chip">${esc(n.category)}</span>` : ''}
          ${n.pinned ? `<span class="chip chip-gold">📌 FIJADA</span>` : ''}
        </div>
        ${body}
      </div>
    `,
    footer: `<button class="btn btn-ghost" data-close>CERRAR</button>`
  });
}