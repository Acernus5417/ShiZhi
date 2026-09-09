import { normalizeUrl, domainOf, displayHost, monogram, hueFor, sameUrl } from './url.js';

export const DEFAULT_CATEGORIES = ['开发', '设计', '影音', '学习', '其它'];
/** 兜底分类：不在预设分类内的统一归到这里；「未分类」不再作为一个分类存在 */
export const OTHER = '其它';
export const PURPOSE_MAX = 20;

export function createId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createItem(input = {}, { now = Date.now(), id = createId() } = {}) {
  const parsed = normalizeUrl(input.url);
  if (!parsed.ok) throw new Error('网址看起来不太对，检查一下？');

  const domain = parsed.domain;
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 4)
    : [];

  return {
    id,
    url: parsed.url,
    host: domain,
    domain,
    display: displayHost(parsed.url),
    title: String(input.title || '').trim() || domain,
    purpose: String(input.purpose || '').replace(/\s+/g, ' ').trim().slice(0, PURPOSE_MAX),
    category: String(input.category || '').trim(),
    tags,
    pinned: Boolean(input.pinned),
    visits: Number(input.visits) || 0,
    lastVisitedAt: Number(input.lastVisitedAt) || 0,
    createdAt: Number(input.createdAt) || now,
    icon:
      input.icon && input.icon.type === 'uri'
        ? { type: 'uri', value: input.icon.value }
        : { type: 'mono', value: monogram(domain), hue: hueFor(domain) }
  };
}

function haystack(item) {
  return [item.title, item.purpose, item.display, item.url, item.category, ...(item.tags || [])]
    .join(' ')
    .toLowerCase();
}

export function searchItems(items, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...items];
  const tokens = q.split(/\s+/);
  return items.filter((item) => {
    const hay = haystack(item);
    return tokens.every((t) => hay.includes(t));
  });
}

export function filterItems(items, { category, tag, query } = {}) {
  let result = searchItems(items, query);
  if (category && category !== '全部') result = result.filter((i) => i.category === category);
  if (tag) result = result.filter((i) => (i.tags || []).includes(tag));
  return result;
}

export function sortItems(items, mode = 'recent') {
  const byName = (a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN');
  const ranked = [...items].sort((a, b) => {
    switch (mode) {
      case 'visits':
        return b.visits - a.visits || b.createdAt - a.createdAt;
      case 'added':
        return b.createdAt - a.createdAt;
      case 'name':
        return byName(a, b);
      case 'recent':
      default:
        return (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0) || b.createdAt - a.createdAt;
    }
  });
  return [...ranked.filter((i) => i.pinned), ...ranked.filter((i) => !i.pinned)];
}

export function mergeItems(existing, incoming) {
  const added = [];
  const duplicates = [];
  for (const raw of incoming) {
    const hit = existing.find((e) => sameUrl(e.url, raw.url)) || added.find((e) => sameUrl(e.url, raw.url));
    if (hit) {
      duplicates.push(hit);
      continue;
    }
    try {
      added.push(createItem(raw));
    } catch {
      /* 跳过无法解析的网址 */
    }
  }
  return { added, duplicates };
}

export function relativeTime(ts, now = Date.now()) {
  const t = Number(ts) || 0;
  if (!t) return '未访问';
  const diff = Math.max(0, now - t);
  const min = 60_000;
  if (diff < min) return '刚刚';
  if (diff < 60 * min) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))} 小时前`;
  if (diff < 30 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))} 天前`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function collectCategories(items) {
  const base = DEFAULT_CATEGORIES.filter((c) => items.some((i) => i.category === c));
  const extra = [];
  for (const item of items) {
    const c = item.category;
    if (c && !base.includes(c) && !extra.includes(c)) extra.push(c);
  }
  return [...base, ...extra];
}

export function collectTags(items) {
  const tags = [];
  for (const item of items) {
    for (const t of item.tags || []) if (t && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

export { domainOf, sameUrl };
