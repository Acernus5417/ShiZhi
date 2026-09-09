import { normalizeUrl, domainOf } from './url.js';

export const MIN_SCORE = 2;

/** 域名直查表：命中最可靠，来源记为 seed */
export const SEED_DOMAINS = {
  'github.com': '开发',
  'gitee.com': '开发',
  'gitlab.com': '开发',
  'developer.mozilla.org': '开发',
  'stackoverflow.com': '开发',
  'npmjs.com': '开发',
  'pypi.org': '开发',
  'juejin.cn': '开发',
  'csdn.net': '开发',
  'segmentfault.com': '开发',
  'runoob.com': '开发',
  'bilibili.com': '影音',
  'youtube.com': '影音',
  'music.163.com': '影音',
  'kugou.com': '影音',
  'iqiyi.com': '影音',
  'douyu.com': '影音',
  'figma.com': '设计',
  'dribbble.com': '设计',
  'behance.net': '设计',
  'unsplash.com': '设计',
  'iconfont.cn': '设计',
  'zhihu.com': '学习',
  'wikipedia.org': '学习',
  'bilibili.com/read': '学习',
  'arxiv.org': '学习',
  'coursera.org': '学习',
  'xunlei.com': '工具',
  'baidu.com': '工具',
  'flingtrainer.com': '工具',
  'vocalremover.org': '工具'
};

/** 关键词规则：域名命中 3 分、标题 2 分、描述或网址 1 分，达到阈值才采纳 */
export const KEYWORD_RULES = [
  {
    category: '开发',
    words: ['github', 'git', 'api', 'sdk', 'docs', 'documentation', 'npm', 'package', 'source',
      'code', 'repo', 'issue', 'docker', 'kubernetes', 'linux', 'server', 'database', 'sql',
      'python', 'java', 'javascript', 'typescript', 'react', 'vue', 'node', 'rust', 'go',
      '开发', '开发者', '文档', '接口', '源码', '编程', '框架', '教程', '部署', '运维']
  },
  {
    category: '设计',
    words: ['figma', 'sketch', 'design', 'dribbble', 'behance', 'ui', 'ux', 'icon', 'font',
      'color', 'palette', 'mockup', 'illustration', 'wallpaper', 'photo', '素材', '设计',
      '图标', '字体', '配色', '壁纸', '插画', '海报', 'logo']
  },
  {
    category: '影音',
    words: ['bilibili', 'youtube', 'video', 'music', 'anime', 'movie', 'tv', 'mv', 'live',
      'netflix', 'spotify', 'stream', '视频', '音乐', '番剧', '电影', '影视', '直播', '听歌', '弹幕', '追剧']
  },
  {
    category: '学习',
    words: ['wiki', 'course', 'tutorial', 'learn', 'mooc', 'edu', 'book', 'paper', 'arxiv',
      'zhihu', '知乎', '教程', '课程', '学习', '百科', '论文', '笔记', '问答', '知识']
  },
  {
    category: '工具',
    words: ['tool', 'tools', 'convert', 'converter', 'online', 'download', 'downloads', 'pan.',
      'ocr', 'compress', 'pdf', 'qr', 'translate', 'parser', 'trainer', 'utility', '在线',
      '转换器', '转换', '下载', '网盘', '解析', '修改器', '生成', '查询', '检测', '工具']
  }
];

function hostOf(url) {
  const parsed = normalizeUrl(url);
  if (!parsed.ok) return String(url || '').replace(/^https?:\/\//i, '').split('/')[0] || '';
  return domainOf(parsed.hostname || parsed.domain);
}

function baseDomain(host) {
  const parts = String(host || '').split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

function fields({ url, title, description, keywords }) {
  const desc = [description, ...(Array.isArray(keywords) ? keywords : [])].join(' ');
  return {
    url: String(url || '').toLowerCase(),
    title: String(title || '').toLowerCase(),
    desc: desc.toLowerCase()
  };
}

export function suggestFromLearned(input, learned = {}) {
  const host = hostOf(input.url);
  if (!host) return null;
  return learned[host] || learned[baseDomain(host)] || null;
}

export function suggestFromSeed(input) {
  const host = hostOf(input.url);
  if (!host) return null;
  if (SEED_DOMAINS[host]) return SEED_DOMAINS[host];
  for (const [domain, category] of Object.entries(SEED_DOMAINS)) {
    if (host.endsWith(`.${domain}`)) return category;
  }
  return null;
}

export function suggestFromRules(input, { minScore = MIN_SCORE } = {}) {
  const host = hostOf(input.url);
  const { url, title, desc } = fields(input);
  let best = null;

  for (const rule of KEYWORD_RULES) {
    let score = 0;
    const matched = [];
    for (const word of rule.words) {
      const needle = word.toLowerCase();
      if (host.includes(needle)) {
        score += 3;
        matched.push(word);
      } else if (title.includes(needle)) {
        score += 2;
        matched.push(word);
      } else if (desc.includes(needle) || url.includes(needle)) {
        score += 1;
        matched.push(word);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { category: rule.category, score, matched };
    }
  }

  if (!best || best.score < minScore) return null;
  return { ...best, confidence: Math.min(1, best.score / 5), matched: best.matched.slice(0, 3) };
}

/**
 * 综合入口：习惯词典 → 域名直查 → 关键词规则。
 * 返回 { category, source:'learned'|'seed'|'rule', confidence } 或 null（表示不敢猜）。
 */
export function suggestCategory(input, { learned = {}, minScore = MIN_SCORE } = {}) {
  const fromLearned = suggestFromLearned(input, learned);
  if (fromLearned) return { category: fromLearned, source: 'learned', confidence: 1 };

  const fromSeed = suggestFromSeed(input);
  if (fromSeed) return { category: fromSeed, source: 'seed', confidence: 0.9 };

  const fromRules = suggestFromRules(input, { minScore });
  if (fromRules) {
    return { category: fromRules.category, source: 'rule', confidence: fromRules.confidence };
  }
  return null;
}

/** 用户手动归类后记住，下次同域名直接套用（最新一次为准） */
export function learnFrom(item, learned = {}) {
  const host = hostOf(item?.url || item?.domain);
  if (!host || !item?.category) return learned;
  return { ...learned, [host]: item.category };
}

/**
 * 收敛分类结果：只接受用户已经建立过的分类，其余一律归到「其它」。
 * 分类体系只能由人手动添加，规则与 AI 都不得新建。
 */
export function resolveCategory(guessed, categories = [], fallback = '其它') {
  if (!guessed) return fallback;
  return categories.includes(guessed) ? guessed : fallback;
}
