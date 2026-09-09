import { relativeTime } from '../../core/library.js';

const ICONS = {
  pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 1.6h3.2l-.5 5 2 2.4H4.9l2-2.4z"/><path d="M8 9v5.4"/></svg>',
  edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.4 2.6l2 2L4.8 13.2 2 14l.8-2.8z"/><path d="M10.2 3.8l2 2"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.4h10.4M6.4 4.4V2.8h3.2v1.6M4.4 4.4l.7 8.4h5.8l.7-8.4"/></svg>'
};

export function renderCard(item, index, now = Date.now()) {
  const card = document.createElement('article');
  card.className = item.pinned ? 'card card--pinned' : 'card';
  card.tabIndex = 0;
  card.dataset.id = item.id;
  card.style.setProperty('--d', `${Math.min(index, 30) * 16}ms`);

  const top = document.createElement('div');
  top.className = 'card__top';

  const no = document.createElement('span');
  no.className = 'card__no';
  if (item.pinned) {
    const dot = document.createElement('i');
    dot.className = 'card__pin';
    no.append(dot);
  }
  no.append(document.createTextNode(`No.${String(index + 1).padStart(2, '0')}`));

  const acts = document.createElement('div');
  acts.className = 'card__acts';
  acts.innerHTML = `
    <button type="button" data-act="pin" title="${item.pinned ? '取消置顶' : '置顶'}" aria-label="置顶">${ICONS.pin}</button>
    <button type="button" data-act="edit" title="编辑" aria-label="编辑">${ICONS.edit}</button>
    <button type="button" data-act="del" title="删除" aria-label="删除">${ICONS.del}</button>`;

  top.append(no, acts);

  const head = document.createElement('div');
  head.className = 'card__head';

  const icon = document.createElement('span');
  icon.className = 'card__icon';
  if (item.icon && item.icon.type === 'uri') {
    const img = document.createElement('img');
    img.src = item.icon.value;
    img.alt = '';
    img.loading = 'lazy';
    icon.append(img);
  } else {
    icon.classList.add('card__mono');
    icon.style.setProperty('--h', String(item.icon?.hue ?? 24));
    icon.textContent = item.icon?.value || '#';
  }

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title || item.domain;
  title.title = item.title || item.domain;

  head.append(icon, title);

  const purpose = document.createElement('p');
  purpose.className = 'card__purpose';
  purpose.textContent = item.purpose || '';
  purpose.title = item.purpose || '';

  const foot = document.createElement('div');
  foot.className = 'card__foot';
  const host = document.createElement('span');
  host.className = 'card__host';
  host.textContent = item.display || item.domain;
  host.title = item.url;
  const meta = document.createElement('span');
  meta.className = 'card__meta';
  meta.textContent = `${item.visits ? `↑${item.visits} · ` : ''}${relativeTime(item.lastVisitedAt, now)}`;
  foot.append(host, meta);

  card.append(top, head, purpose, foot);
  return card;
}
