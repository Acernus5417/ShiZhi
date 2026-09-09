import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIncoming, INTAKE_MODES, BRIDGE_PORT } from '../src/core/intake.js';

test('缺少网址时拒绝', () => {
  assert.equal(parseIncoming({}).ok, false);
  assert.equal(parseIncoming(null).reason, 'missing-url');
  assert.equal(parseIncoming({ url: '   ' }).ok, false);
});

test('模式缺省为编辑，显式 quick 也认', () => {
  assert.equal(parseIncoming({ url: 'https://a.com' }).mode, 'edit');
  assert.equal(parseIncoming({ url: 'https://a.com', mode: 'quick' }).mode, 'quick');
  assert.equal(parseIncoming({ url: 'https://a.com', mode: '乱写' }).mode, 'edit');
});

test('字段被裁剪到安全长度', () => {
  const r = parseIncoming({
    url: 'https://a.com',
    title: '标'.repeat(300),
    purpose: '用'.repeat(80),
    tags: ['a', 'b', 'c', 'd', 'e', 'f']
  });
  assert.equal(r.title.length, 120);
  assert.equal(r.purpose.length, 20);
  assert.equal(r.tags.length, 4);
});

test('用途里的换行与多余空白被压平', () => {
  assert.equal(parseIncoming({ url: 'https://a.com', purpose: '查\n文档   用' }).purpose, '查 文档 用');
});

test('端口与模式常量稳定', () => {
  assert.equal(BRIDGE_PORT, 17820);
  assert.deepEqual(INTAKE_MODES, ['edit', 'quick']);
});
