# 拾址 · SHIZHI

> 一个只做一件事的本地网址速查台。
> **装帧是编辑部的，操作是速查台的。**

把常去的网站收进一本编排讲究的「索引册」，写一句用途，以后只在这里找——
不用再翻浏览器的收藏夹，也不用在一堆"未命名书签"里猜。


## 一、它是什么

| | |
| --- | --- |
| **定位** | 个人日常速查的网址卡片库，20–200 条量级 |
| **核心动作** | 扫视 → 单击 → 默认浏览器打开（两步） |
| **数据** | 全部在你自己电脑上，不联网、不上传 |


## 二、功能速览

| 能力 | 说明 |
| --- | --- |
| 卡片首页 | 编号、图标、单行名称、单行用途、域名、打开次数与相对时间 |
| 一键打开 | 单击卡片 → `shell.openExternal` → 系统默认浏览器，同时累加次数 |
| 检索 | `Ctrl + K`，匹配名称 / 网址 / 用途 / 标签，`Enter` 开第一条 |
| 分类 + 标签 | 分类做主导航，标签最多 4 个，均可检索 |
| 排序 | 最近访问 / 最近添加 / 访问最多 / 按名称；置顶恒在最前 |
| 自动抓取 | 粘贴网址即抓标题与图标，失败退化为域名首字母的彩色字母标记 |
| 浏览器联动 | 网页右键「手动收录 / 快速收录」，链接右键收录该链接 |
| 五套主题 | 纸 / 夜读 / 暮色 / 松墨 / 夜航，后三套自带背景图 |
| 自定义背景 | 导入图片 → 按窗口比例裁剪 → 铺满；卡片自动转半透明悬浮 |
| 自动分类 | 习惯词典 → 域名直查 → 关键词规则 → AI（可选），四层递进 |
| 导入导出 | 浏览器书签 HTML 导入（文件夹变分类）、JSON 备份导出 |
| 开机启动 | 保证浏览器侧随时可收录 |

---

## 三、技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 运行时 | **Electron 31.7.7** | 需要真正独立窗口 + `shell.openExternal` + 本地文件读写 |
| 界面 | **原生 HTML / CSS / ES Module**，零框架 | 卡片数量有限，框架是纯粹的负担；也避免 ESM 在 `file://` 下的打包复杂度 |
| 样式 | CSS 自定义属性 + `data-theme` 切换 | 五套主题只换变量，不改结构 |
| 主进程 | CommonJS（包内 `"type": "module"`，主进程用 `.cjs`） | Electron 主进程 CJS 最稳，`core/` 保持 ESM 供渲染层与测试共用 |
| 后端逻辑 | **仅 Node 内置模块**（`http` / `fs` / `path` / `url`） | 零第三方运行时依赖，打包体积小、换机无依赖 |
| 浏览器扩展 | **Manifest V3**（原生 JS） | 只用 `contextMenus` / `activeTab` / `scripting` / `notifications` |
| 通信 | 本机 HTTP 桥 `127.0.0.1:17820` | 零注册表、跨浏览器、数据文件始终由应用独占写入 |
| 打包 | electron-builder 26（NSIS + portable） | 一个配置出安装版和绿色版 |
| 测试 | `node --test` + `node:assert` | 无需框架，纯逻辑单测 41 例 |
| 图标 | PowerShell `System.Drawing` 生成 PNG + 自写 ICO 编码器 | 不依赖图像库 |

**运行时依赖：0 个。** 只有开发期依赖 `electron-builder`。

---

## 四、架构

```
拾址/
├─ src/
│  ├─ core/               纯逻辑，零 Electron 依赖（可单测）
│  │  ├─ url.js           网址归一化 / 域名 / 去重 key / 字母标记色相
│  │  ├─ library.js       条目模型 / 检索 / 筛选 / 排序 / 相对时间
│  │  ├─ classify.js      分类四层 + resolveCategory（收敛到已有分类）
│  │  ├─ bookmarks.js     Netscape 书签 HTML 解析
│  │  └─ intake.js        浏览器提交参数的规范化（纯函数 + 单测）
│  ├─ main/
│  │  ├─ index.cjs        窗口 / IPC / 单实例锁 / 收录编排
│  │  ├─ bridge.cjs       本机 HTTP 服务（/ping、/add）
│  │  ├─ favicon.cjs      抓标题、图标、描述、关键词（带超时与重定向）
│  │  ├─ ai.cjs           云端 chat/completions 兜底分类
│  │  └─ store.js         JSON 读写（原子写 + 备份 + 损坏回退）
│  ├─ preload.cjs         contextBridge → window.shizhi
│  └─ renderer/           index.html + tokens.css + app.css + js/
├─ extension/             浏览器扩展（MV3）
├─ test/                  41 例单测
├─ build/                 icon.ico + 各尺寸 PNG
└─ docs/  DESIGN.md  介绍.md  设置说明.md
```

### 数据流

```
浏览器右键
   │  POST /add { url, title, mode }
   ▼
bridge.cjs ──► handleIntake()
                  │
                  ├─ mode=quick：createItem → 落库 → 通知渲染层刷新
                  │                └─► enrichItem()：异步抓标题/图标 → 分类 → 补用途
                  │
                  └─ mode=edit：不落库 → 唤窗口到前台 → 打开预填弹层
                                 └─► 本地分类建议立即预选，AI 结果异步回填
```

**一条铁律**：扩展永远不写数据文件，只有应用自己写。这从根本上排除了
「外部脚本与运行中的实例抢写同一个 JSON」的冲突——这也是选 HTTP 桥而非
Native Messaging 的决定性理由。

---

## 五、实现路径（里程碑）

| 阶段 | 内容 |
| --- | --- |
| **v1 · 骨架** | Electron 无边框窗口 + 自绘刊头、卡片网格、录入弹层、检索、分类、置顶、导入导出、本地存储（原子写 + 备份） |
| **v2 · 去文字化** | 删掉工具行与分类导航，入口全部收进刊头图标；检索改为刊头内联展开；主区只剩卡片 |
| **v3 · 主题与背景** | 五套主题（`--veil-rgb` 遮罩色 + `--card-alpha` 卡片透明度）、背景裁剪器（比例与窗口一致 + 拖拽 + 缩放）、圆角卡片 |
| **v4 · 浏览器联动** | 本机 HTTP 桥 + MV3 扩展；手动收录 / 快速收录；单实例锁、开机启动 |
| **v5 · 自动分类** | 习惯词典 → 域名直查 → 关键词规则 → AI；`resolveCategory` 保证**分类只能人手动建**；取消「未分类」，兜底统一「其它」 |
| **v6 · 设计语言统一** | 破坏性操作=垃圾桶图标、关闭=× 图标、描边 1.35、单选项圆角+悬停底、有背景时浮层/弹层转毛玻璃、字号收敛两档、细滚动条 |
| **v7 · 打包分发** | 自绘图标（朱红印章 + 纸色针）、ICO 合成、NSIS 安装版 + 绿色便携版、独立目录 |

---

## 六、全流程配置方法

### 1. 开发运行

```bat
拾址\启动开发版.bat
```
等价于在工作区根目录执行：
```bash
node_modules\electron\dist\electron.exe 拾址
```
（依赖工作区根 `node_modules/electron`；拾址自身没有运行时依赖）

### 2. 测试

```bash
cd 拾址
node --test test/*.test.js
# ℹ tests 41 / pass 41 / fail 0
```

### 3. 打包

```bash
cd 拾址
npm i                  # 首次：安装 electron-builder（开发依赖）
npm run dist           # 安装版 + 便携版一起出
npm run dist:installer # 只要 NSIS 安装版
npm run dist:portable  # 只要便携版
```

产物在 `拾址/dist/`：

| 文件 | 说明 |
| --- | --- |
| `拾址-安装版.exe`（约 74 MB） | NSIS：可选目录、桌面与开始菜单快捷方式、装完即启动、带卸载程序 |
| `拾址-便携版.exe`（约 74 MB） | 单文件绿色版，双击即用 |
| `win-unpacked/` | 未压缩目录版 |

打包要点（写在 `package.json` 的 `build` 字段里）：

```jsonc
{
  "productName": "shizhi",        // 保持英文名：决定 userData 为 %APPDATA%\shizhi
  "icon": "build/icon.ico",
  "asar": false,                  // 让 extension/ 与主题背景图保持真实目录
  "electronDist": "../node_modules/electron/dist",   // 复用已有 Electron
  "electronVersion": "31.7.7",    // 与 electronDist 配套，必填
  "win": { "target": ["nsis", "portable"] },
  "nsis": {
    "oneClick": false,            // 允许自选安装目录
    "perMachine": false,          // 不需要管理员权限
    "shortcutName": "拾址",
    "language": "2052"            // 简体中文安装界面
  }
}
```

> 改图标：`scripts/make-icon.js` 会把 `build/icons/*.png` 合成 `build/icon.ico`，
> 并把 48/128 两枚同步给 `extension/icons/`，两端图标始终一致。

### 4. 安装浏览器扩展

```
edge://extensions 或 chrome://extensions
→ 打开「开发人员模式」
→ 「加载解压缩的扩展」→ 选择 拾址/extension
```

程序内也有入口：**⋮ → 设置 → 自定义 → 浏览器联动 → 打开扩展目录**。

| 菜单项 | 行为 |
| --- | --- |
| 手动收录 | 唤起拾址窗口，打开预填好的录入弹层 |
| 快速收录 | 静默入库，标题与图标随后自动补全 |
| 手动/快速收录此链接 | 收录链接而非当前页 |

### 5. 配置 AI（可选，默认关闭）

**⋮ → 设置 → AI 配置**，打开开关并填全三项：

| 项 | 示例 |
| --- | --- |
| 接口地址 | `https://api.example.com/v1`（自动补全 `/chat/completions`） |
| API Key | `sk-…` |
| 模型 | `gpt-4o-mini` |

- 兼容 OpenAI 的 `/chat/completions` 即可
- **只在录入时调用**，不会改动已有条目
- 只发送网址、标题、页面描述，**不发送正文**
- 结果只是建议，随手可改；改过即写入习惯词典

### 6. 数据与迁移

```
%APPDATA%\shizhi\
├─ library.json       网址 + 分类 + 全部偏好（含 AI 配置）
├─ library.bak.json   每次写入前的上一版
└─ background.jpg     自定义背景（用了自定义背景才有）
```

换机器：程序里「导出 JSON 备份」再导入，或直接拷 `library.json`（+ 想带背景就连 `background.jpg`）。

### 7. 快捷键

| 键 | 作用 |
| --- | --- |
| `Ctrl + N` | 新增网址 |
| `Ctrl + K` | 聚焦检索 |
| `Enter`（检索框内） | 打开第一条 |
| `Esc` | 关弹层 / 清检索 / 返回上级设置页 |

---

## 七、几处值得一提的实现

**为什么数据只由应用自己写**
扩展走 HTTP 而不是 Native Messaging，宿主脚本不会绕过应用直接改 JSON，因此不存在并发写坏数据的可能。

**为什么分类不能被 AI 创造**
所有规则与 AI 的产出都要过 `resolveCategory(guess, categories, 其它)`：
不在你已建分类里的结果一律落到「其它」。你手动加过之后，它才会成为 AI 的候选项。

**为什么 `normalizeItem` 不能填默认分类**
曾经在这里把空分类补成「其它」，结果异步补抓进来时认为"已有分类"，规则与 AI 全被跳过——
快速收录永远落在「其它」。修正后：空分类保留为"待分类"留给补抓，真正的兜底放到程序启动时。

**窗口抢焦点**
Windows 有前台锁定，`win.focus()` 常常无效。手动收录时用
`setAlwaysOnTop(true,'screen-saver')` 短暂提权再 500ms 后释放。

**原子写**
每次保存走「临时文件 + 重命名」，并先把上一版复制为 `.bak`；主文件损坏时自动回退备份，
两者都坏也能用默认配置正常启动。

---

## 八、文档

| 文档 | 面向 | 内容 |
| --- | --- | --- |
| `README.md` | 开发者 | 本文件：定位、技术栈、架构、实现路径、配置 |
| `docs/介绍.md` | 使用者 | 功能与使用方法的完整说明 |
| `docs/设置说明.md` | 使用者 | 设置每一项的含义与边界 |
| `DESIGN.md` | 维护者 | 设计决策记录（含踩坑） |
| `extension/README.md` | 使用者 | 扩展安装与权限说明 |
| `分发/README.md` | 使用者 | 与 `介绍.md` 同步，便于随包带走 |
