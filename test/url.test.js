import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  domainOf,
  sameUrl,
  displayHost,
  monogram,
  hueFor
} from '../src/core/url.js';

test('补全缺失的协议', () => {
  assert.equal(normalizeUrl('example.com').url, 'https://example.com/');
  assert.equal(normalizeUrl('www.example.com/a/b').url, 'https://www.example.com/a/b');
});

test('保留原有协议并清理空白', () => {
  assert.equal(normalizeUrl('  http://a.cn  ').url, 'http://a.cn/');
  assert.equal(normalizeUrl('https://x.io').url, 'https://x.io/');
});

test('拒绝非法输入与非网页协议', () => {
  assert.equal(normalizeUrl('').ok, false);
  assert.equal(normalizeUrl('   ').ok, false);
  assert.equal(normalizeUrl(null).ok, false);
  assert.equal(normalizeUrl('mailto:a@b.com').ok, false);
  assert.equal(normalizeUrl('不是网址').ok, false);
});

test('提取域名并去掉 www', () => {
  assert.equal(domainOf('www.github.com'), 'github.com');
  assert.equal(domainOf('GitHub.com'), 'github.com');
  assert.equal(domainOf('docs.rs'), 'docs.rs');
  assert.equal(normalizeUrl('https://www.bilibili.com/video/x').domain, 'bilibili.com');
});

test('判定同一网址：忽略末尾斜杠、锚点与大小写', () => {
  assert.ok(sameUrl('https://a.com/x', 'https://a.com/x/'));
  assert.ok(sameUrl('https://A.com/x#top', 'https://a.com/x'));
  assert.ok(sameUrl('http://a.com', 'https://a.com/'));
  assert.ok(!sameUrl('https://a.com/x', 'https://a.com/y'));
  assert.ok(!sameUrl('https://a.com', 'https://b.com'));
});

test('展示用主机串带路径', () => {
  assert.equal(displayHost('https://github.com/a/b'), 'github.com/a/b');
  assert.equal(displayHost('https://www.baidu.com/'), 'baidu.com');
});

test('字母标记与色相稳定', () => {
  assert.equal(monogram('github.com'), 'G');
  assert.equal(monogram('9gag.com'), '9');
  assert.equal(hueFor('a.com'), hueFor('a.com'));
  assert.notEqual(hueFor('a.com'), hueFor('b.com'));
  assert.ok(hueFor('x.cn') >= 0 && hueFor('x.cn') < 360);
});
