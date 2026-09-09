import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/main/store.js';

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'shizhi-'));
}

test('首次加载返回默认空库', async () => {
  const store = createStore(await tmpDir());
  const data = await store.load();
  assert.equal(data.version, 1);
  assert.deepEqual(data.items, []);
  assert.ok(data.categories.includes('开发'));
  assert.equal(data.prefs.theme, 'paper');
});

test('保存后可原样读回', async () => {
  const store = createStore(await tmpDir());
  const data = await store.load();
  data.items.push({ id: 'x1', url: 'https://a.com/', title: 'A' });
  await store.save(data);
  const again = await store.load();
  assert.equal(again.items.length, 1);
  assert.equal(again.items[0].title, 'A');
});

test('保存前留下备份', async () => {
  const dir = await tmpDir();
  const store = createStore(dir);
  await store.save({ ...(await store.load()), items: [{ id: 'a' }] });
  await store.save({ ...(await store.load()), items: [{ id: 'b' }] });
  const bak = JSON.parse(await fs.readFile(path.join(dir, 'library.bak.json'), 'utf8'));
  assert.equal(bak.items[0].id, 'a');
});

test('主文件损坏时回退到上一版备份', async () => {
  const dir = await tmpDir();
  const store = createStore(dir);
  await store.save({ ...(await store.load()), items: [{ id: 'v1' }] });
  await store.save({ ...(await store.load()), items: [{ id: 'v2' }] });
  await fs.writeFile(path.join(dir, 'library.json'), '{ 坏掉的 json', 'utf8');
  const data = await store.load();
  assert.equal(data.items[0].id, 'v1');
});

test('主文件与备份都损坏时返回默认库而不抛错', async () => {
  const dir = await tmpDir();
  const store = createStore(dir);
  await fs.writeFile(path.join(dir, 'library.json'), 'not json', 'utf8');
  await fs.writeFile(path.join(dir, 'library.bak.json'), 'also not json', 'utf8');
  const data = await store.load();
  assert.deepEqual(data.items, []);
});

test('保存是原子写：不产生残留临时文件', async () => {
  const dir = await tmpDir();
  const store = createStore(dir);
  await store.save(await store.load());
  const files = await fs.readdir(dir);
  assert.ok(!files.some((f) => f.includes('.tmp')));
});
