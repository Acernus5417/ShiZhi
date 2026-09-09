const PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^(?:localhost)$|^\d{1,3}(?:\.\d{1,3}){3}$/i;
const PALETTE = [8, 24, 42, 96, 152, 196, 264, 330];

export function normalizeUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, reason: 'empty' };
  let raw = input.trim().replace(/\s+/g, '').replace(/^[:/]{2,}/, '');

  // mailto:xxx / ftp:xxx 这类非网页协议，冒号后不是纯端口，直接判无效
  const scheme = raw.match(/^[a-z][a-z0-9+.-]*:(?!\/\/)(.*)$/i);
  if (scheme && !/^\d+(\/|$)/.test(scheme[1])) return { ok: false, reason: 'protocol' };

  if (!PROTOCOL.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');

  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'protocol' };
  if (!HOSTNAME.test(u.hostname)) return { ok: false, reason: 'invalid' };

  return { ok: true, url: u.href, host: u.host, domain: domainOf(u.hostname) };
}

export function domainOf(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return h.startsWith('www.') ? h.slice(4) : h;
}

function keyOf(value) {
  const parsed = normalizeUrl(value);
  if (!parsed.ok) return null;
  try {
    const u = new URL(parsed.url);
    const path = u.pathname.replace(/\/+$/, '');
    return `${domainOf(u.hostname)}${path}${u.search}`.toLowerCase();
  } catch {
    return null;
  }
}

export function sameUrl(a, b) {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return !!ka && ka === kb;
}

export function displayHost(value) {
  const parsed = normalizeUrl(value);
  if (!parsed.ok) return '';
  try {
    const u = new URL(parsed.url);
    const host = domainOf(u.hostname);
    const rest = (u.pathname === '/' ? '' : u.pathname) + u.search;
    const shown = rest.length > 26 ? `${rest.slice(0, 26)}…` : rest;
    return host + shown;
  } catch {
    return parsed.domain;
  }
}

export function monogram(domain) {
  const c = String(domain || '').replace(/[^a-z0-9]/gi, '').charAt(0);
  return (c || '?').toUpperCase();
}

export function hueFor(seed) {
  let h = 5381;
  for (const ch of String(seed || '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
