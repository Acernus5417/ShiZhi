const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_ICON = 220 * 1024;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function fetchBuffer(url, { timeout = 6000, redirects = 3 } = {}) {
  return new Promise((resolve) => {
    let lib;
    try {
      lib = new URL(url).protocol === 'http:' ? http : https;
    } catch {
      return resolve(null);
    }
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = lib.get(url, { headers: { 'user-agent': UA, accept: '*/*' }, timeout }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
        res.resume();
        try {
          return resolve(fetchBuffer(new URL(headers.location, url).href, { timeout, redirects: redirects - 1 }));
        } catch {
          return done(null);
        }
      }
      if (statusCode >= 400) {
        res.resume();
        return done(null);
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 1_500_000) {
          req.destroy();
          res.resume();
          return done(null);
        }
        chunks.push(c);
      });
      res.on('end', () => done({ status: statusCode, headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => done(null));
    req.on('timeout', () => {
      req.destroy();
      done(null);
    });
  });
}

function decode(body, contentType) {
  let charset = (contentType && /charset=["']?([\w-]+)/i.exec(contentType)?.[1]) || '';
  if (!charset) {
    const head = body.subarray(0, 2048).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
  }
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return body.toString('utf8');
  }
}

function clean(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);?/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取 <meta name/property="x" content="y">，两种属性顺序都兼容 */
function metaContent(html, name) {
  const pattern = new RegExp(
    `<meta\\b[^>]*?(?:name|property)\\s*=\\s*["']${name}["'][^>]*?>`,
    'i'
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return '';
  return clean(attrOf(tag, 'content')).slice(0, 300);
}

function attrOf(tag, name) {
  const m =
    tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1].trim() : '';
}

function iconCandidates(html, baseUrl) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attrOf(tag, 'rel').toLowerCase();
    if (!rel || !/icon/.test(rel)) continue;
    const href = attrOf(tag, 'href');
    if (!href || href.startsWith('data:')) continue;
    let absolute;
    try {
      absolute = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    const sizes = attrOf(tag, 'sizes');
    const biggest = Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
    out.push({ url: absolute, score: biggest + (rel.includes('apple') ? 200 : 0) });
  }
  out.sort((a, b) => b.score - a.score);
  try {
    out.push({ url: new URL('/favicon.ico', baseUrl).href, score: -1 });
  } catch {
    /* ignore */
  }
  return out;
}

function toDataUri(res) {
  const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!/^image\//.test(type) || type === 'image/svg+xml' || !res.body.length) return null;
  if (res.body.length > MAX_ICON) return null;
  return `data:${type};base64,${res.body.toString('base64')}`;
}

async function fetchMeta(rawUrl) {
  let target;
  try {
    target = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { title: '', icon: null };
  }

  const page = await fetchBuffer(target.href);
  let title = '';
  let icon = null;
  let description = '';
  let keywords = [];

  if (page && /text\/html/i.test(page.headers['content-type'] || '')) {
    const html = decode(page.body, page.headers['content-type']);
    title = clean(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html)?.[1] || '').slice(0, 80);
    description = metaContent(html, 'description') || metaContent(html, 'og:description');
    keywords = (metaContent(html, 'keywords') || '')
      .split(/[,，|、]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 8);
    for (const c of iconCandidates(html, target.href).slice(0, 3)) {
      const res = await fetchBuffer(c.url);
      const uri = res && toDataUri(res);
      if (uri) {
        icon = { type: 'uri', value: uri };
        break;
      }
    }
  }
  if (!icon) {
    const res = await fetchBuffer(new URL('/favicon.ico', target.href).href);
    const uri = res && toDataUri(res);
    if (uri) icon = { type: 'uri', value: uri };
  }
  return { title, icon, description, keywords };
}

module.exports = { fetchMeta };
