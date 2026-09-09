import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestCategory,
  suggestFromLearned,
  suggestFromSeed,
  suggestFromRules,
  learnFrom,
  resolveCategory
} from '../src/core/classify.js';

const learned = { 'github.com': '工具' };

test('习惯词典优先于一切（哪怕和常识不同）', () => {
  const r = suggestCategory({ url: 'https://github.com/a/b', title: 'repo' }, { learned });
  assert.equal(r.category, '工具');
  assert.equal(r.source, 'learned');
});

test('域名直查命中常见站点', () => {
  assert.equal(suggestFromSeed({ url: 'https://www.bilibili.com/video/1' }), '影音');
  assert.equal(suggestFromSeed({ url: 'https://developer.mozilla.org/zh-CN/' }), '开发');
  assert.equal(suggestFromSeed({ url: 'https://example.com' }), null);
});

test('关键词规则：标题权重高于描述', () => {
  const r = suggestFromRules({ url: 'https://x.io/p', title: '图标素材下载', description: '一些图标' });
  assert.ok(r);
  assert.equal(r.category, '设计');
  assert.ok(r.score >= 2);
});

test('关键词规则：描述与网址也能凑分', () => {
  const r = suggestFromRules({
    url: 'https://x.io/docs',
    title: '一个网站',
    description: '提供 API 与 SDK 文档'
  });
  assert.ok(r);
  assert.equal(r.category, '开发');
});

test('拿不准就返回 null，不瞎猜', () => {
  assert.equal(suggestCategory({ url: 'https://example.com', title: '首页', description: '欢迎' }, {}), null);
  assert.equal(suggestFromRules({ url: 'https://example.com', title: '首页' }), null);
  assert.equal(suggestFromLearned({ url: 'https://example.com' }, {}), null);
});

test('手动归类写入词典，空分类不写入', () => {
  const next = learnFrom({ url: 'https://a.com/x', category: '影音' });
  assert.equal(next['a.com'], '影音');
  assert.deepEqual(learnFrom({ url: 'https://b.com', category: '' }), {});
  assert.deepEqual(learnFrom({ url: '', category: '影音' }), {});
});

test('分类只能从已有类别中选，其余归到其它', () => {
  assert.equal(resolveCategory('工具', ['开发', '影音', '其它']), '其它');
  assert.equal(resolveCategory('影音', ['开发', '影音', '其它']), '影音');
  assert.equal(resolveCategory('', ['开发', '其它']), '其它');
  // 手动添加「工具」之后，它才成为可选分类
  assert.equal(resolveCategory('工具', ['开发', '工具', '其它']), '工具');
});

test('写入后能被 suggestCategory 用上', () => {
  const dict = learnFrom({ url: 'https://tool.example.org/x', category: '工具' });
  const r = suggestCategory({ url: 'https://tool.example.org/y', title: '另一个页面' }, { learned: dict });
  assert.equal(r.source, 'learned');
  assert.equal(r.category, '工具');
});
