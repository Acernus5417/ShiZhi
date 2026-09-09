export const INTAKE_MODES = ['edit', 'quick'];
export const BRIDGE_PORT = 17820;

/**
 * 规范化浏览器扩展送来的收录请求。
 * 返回 { ok, mode, url, title, purpose, category, tags } 或 { ok:false, reason }。
 */
export function parseIncoming(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) return { ok: false, reason: 'missing-url' };

  return {
    ok: true,
    mode: INTAKE_MODES.includes(raw.mode) ? raw.mode : 'edit',
    url,
    title: typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '',
    purpose: typeof raw.purpose === 'string'
      ? raw.purpose.replace(/\s+/g, ' ').trim().slice(0, 20)
      : '',
    category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 20) : '',
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
      : []
  };
}
