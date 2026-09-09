const http = require('node:http');

const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

/**
 * 只监听回环地址的小服务：浏览器扩展用它把网址交给拾址。
 * 数据文件始终由应用自己写，外部只提交请求。
 */
function createBridge({ port, onIntake, isEnabled }) {
  let server = null;
  let error = '';

  const respond = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      ...CORS
    });
    res.end(body);
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('payload too large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

  server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        return res.end();
      }

      const path = (req.url || '').split('?')[0];

      if (req.method === 'GET' && path === '/ping') {
        return respond(res, 200, {
          ok: true,
          app: 'shizhi',
          port,
          enabled: isEnabled()
        });
      }

      if (!isEnabled()) {
        return respond(res, 503, { ok: false, reason: 'disabled' });
      }

      if (req.method === 'POST' && path === '/add') {
        let payload = {};
        try {
          payload = JSON.parse((await readBody(req)) || '{}');
        } catch {
          return respond(res, 400, { ok: false, reason: 'bad-json' });
        }
        const result = (await onIntake(payload)) || { ok: false, reason: 'unknown' };
        return respond(res, result.ok ? 200 : 422, result);
      }

      return respond(res, 404, { ok: false, reason: 'not-found' });
    } catch (err) {
      return respond(res, 500, { ok: false, reason: err?.message || 'server-error' });
    }
  });

  return {
    port,
    get running() {
      return Boolean(server.listening);
    },
    get error() {
      return error;
    },
    start() {
      return new Promise((resolve) => {
        server.on('error', (err) => {
          error = err?.code === 'EADDRINUSE' ? 'port-in-use' : err?.message || 'error';
          resolve(false);
        });
        server.listen(port, HOST, () => {
          error = '';
          resolve(true);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
      });
    }
  };
}

module.exports = { createBridge };
