import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CATEGORIES } from '../core/library.js';

const FILE = 'library.json';
const BACKUP = 'library.bak.json';

export function defaultData() {
  return {
    version: 1,
    items: [],
    categories: [...DEFAULT_CATEGORIES],
    prefs: {
      theme: 'paper',
      sort: 'recent',
      width: 1200,
      height: 800,
      bridge: true,
      login: false,
      background: { on: false, blur: 14, dim: 38 },
      tuning: {},
      learned: {},
      ai: { enabled: false, baseUrl: '', apiKey: '', model: '' }
    }
  };
}

function sanitize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: 1,
    items: Array.isArray(raw.items) ? raw.items : [],
    categories: Array.isArray(raw.categories) && raw.categories.length
      ? raw.categories
      : base.categories,
    prefs: {
      ...base.prefs,
      ...(raw.prefs || {}),
      background: { ...base.prefs.background, ...(raw.prefs?.background || {}) },
      ai: { ...base.prefs.ai, ...(raw.prefs?.ai || {}) },
      learned: raw.prefs?.learned && typeof raw.prefs.learned === 'object' ? raw.prefs.learned : {}
    }
  };
}

export function createStore(dir) {
  const file = path.join(dir, FILE);
  const backup = path.join(dir, BACKUP);

  async function readJson(p) {
    try {
      return sanitize(JSON.parse(await fs.readFile(p, 'utf8')));
    } catch {
      return null;
    }
  }

  return {
    file,
    backup,
    async load() {
      return (await readJson(file)) ?? (await readJson(backup)) ?? defaultData();
    },
    async save(data) {
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.copyFile(file, backup);
      } catch {
        /* 首次保存没有旧文件可备份 */
      }
      const tmp = path.join(dir, `.${FILE}.${process.pid}.tmp`);
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, file);
      return data;
    }
  };
}
