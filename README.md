# dsh-ui-appearance

[English](README.en.md) · 中文

DeepSeek Harness 生态中首个支持多维度 UI 参数深度自定义的外观插件 —— 不局限于固定预设，支持面板/输入框/代码块透明度微调、毛玻璃强度、壁纸/视频背景及色板智能衍生；WebUI 与 DSH Desktop 均可使用。

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/zh/p/TQSY114514/dsh-ui-appearance/)
[![npm version](https://img.shields.io/npm/v/dsh-ui-appearance.svg?style=flat-square&color=cb3837&labelColor=161b22&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-ui-appearance)
[![downloads](https://img.shields.io/npm/dt/dsh-ui-appearance.svg?style=flat-square&color=3fb950&labelColor=161b22&label=downloads)](https://www.npmjs.com/package/dsh-ui-appearance)
[![CI](https://img.shields.io/github/actions/workflow/status/TQSY114514/dsh-ui-appearance/build.yml?style=flat-square&label=ci&labelColor=161b22&logo=githubactions&logoColor=white)](https://github.com/TQSY114514/dsh-ui-appearance/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/TQSY114514/dsh-ui-appearance.svg?style=flat-square&color=8250df&labelColor=161b22&label=release)](https://github.com/TQSY114514/dsh-ui-appearance/releases)
[![license](https://img.shields.io/npm/l/dsh-ui-appearance.svg?style=flat-square&color=8b949e&labelColor=161b22)](./LICENSE)

> 零核心代码改动:完全通过官方插件机制(`ctx.theme.overrideTokens()` 主题扩展点与 `settings.general.item` 插槽)实现;卸载后界面完整恢复默认。

## 界面

| 设置面板 | 壁纸 + 毛玻璃效果 |
|---|---|
| ![设置面板](docs/screenshot-settings.png) | ![壁纸毛玻璃](docs/screenshot-wallpaper.png) |

在 **[DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)**(桌面客户端)中同样开箱即用,以下为实拍:

| 高级模式(桌面原生布局与材质) | 兼容模式(上游默认 Web client) |
|---|---|
| ![高级模式](docs/screenshot-desktop-fancy.webp) | ![兼容模式](docs/screenshot-desktop-compat.webp) |

官方桌面端新版实拍(社区版截图保留在上方):

| 官方桌面端(新版高级模式) |
|---|
| ![官方桌面端](docs/screenshot-desktop-official.png) |

> 效果图中的壁纸素材 © MadYY([原图](docs/wallpaper-madYY.png)),仅作演示;用户上传自己的图片即可。

## 功能

**深浅双模式独立外观** —— 设置面板顶部提供「浅色模式 / 深色模式」独立分段卡，分别配置双模式下的 6 种颜色角色与预设，实时跟随宿主状态与系统 `prefers-color-scheme` 自适应切换。接入 WCAG 2.1 动态反解算法（次级文字 $\ge 7:1$、三级说明字 $\ge 4.5:1$），彻底杜绝浅色模式“白底淡字”或深色模式图标隐形。

**主题颜色** —— 6 个核心颜色角色：主色、背景色、面板色、输入框色、文字色、边框色。每个角色支持原生取色器与 HEX 精确输入，全局色彩严格遵循**所见即所得**（不隐式篡改你手选的文字色）；主操作按钮、文字选区高亮、键盘焦点环跟随主色，用户消息气泡跟随面板色，并在局部实心/半透明表面自动做可读性对比度兜底。

**壁纸与视频背景（最高 200MB）** —— 支持上传或拖拽图片（JPG / PNG / WebP / GIF），或**粘贴 URL 一键加载**（自动按扩展名分流，支持 CORS 友好直链）。原画质通过 IndexedDB Blob 存储（零额外堆内存复制，不占 localStorage 配额；超 4096px 等比缩边，限内 GIF 保留动效）。上传时自动采样平均亮度并**智能提取主色衍生周边色阶**。支持原生流式硬解**动态视频背景**（MP4 / WebM，静音循环播放，最高 200MB）。

**毛玻璃与多维独立半透明机制** —— **主面板、侧边栏、设置与弹窗、输入框、代码块**均拥有独立的 0%~100% 连续不透明度滑块，互不干扰（彻底解决主面板全透时设置弹窗看不清字的问题）。**毛玻璃强度（`glassBlur`）与背景模糊（`backgroundBlur`）完全解耦**：背景模糊仅作用于底层壁纸/视频，而毛玻璃精准作用于侧边栏、输入框、斜杠命令（`/`）浮层、消息气泡、代码块、设置弹窗及弹窗外围遮罩。行内代码等强调字保留低透明度主色相，配合「强调字浓度」滑块精细微调；中性控件 hover 状态同步烘焙透明度，鼠标悬停平滑自然，绝不闪现死白/死黑的实心水泥块（解决 `hover snapped opaque`）。

**背景三层架构与氛围** —— 独创三层渲染架构：底层基础画布（承载自定义纯色背景）、中层媒体层（承载壁纸/视频的独立不透明度与模糊）、顶层防眩光遮罩（随深浅色模式自动配色的纱帘渐变）。调低壁纸不透明度时平滑融入自定义背景底色，消除白斑；遮罩层有效保证亮图之上的文字易读性。

**双模式专属预设** —— 浅色 5 款专属预设（晨曦、云天、薄荷、樱粉、雅灰）+ 深色 6 款经典预设（默认、午夜、海洋、森林、玫瑰、单色），一键应用并支持自由微调。

**配色方案分享** —— 一键导出配色 JSON 至剪贴板，粘贴即可导入应用；欢迎在 GitHub Discussions 社区分享交流你的专属配色方案。

所有修改实时生效，无需刷新，无需保存。

## 安装

### 方式一：npm 一行命令（推荐）

```sh
dsh plugin --profile <name> add dsh-ui-appearance
```

### 方式二：一键脚本（Windows，无需 npm 账号与 git）

```powershell
powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/TQSY114514/dsh-ui-appearance/main/install.ps1' -OutFile install.ps1; .\install.ps1"
```

脚本直接从 npm registry 拉取已构建的发布包（`lib/` 预构建产物随包分发），链接进 profile 自己的 `node_modules` 并在该 profile 的 `package.json` 中注册（`dependencies` 条目 + `dsh.profile.bundles`，与 `dsh plugin add` 的产物一致）——幂等，可重复执行。可选参数：

```powershell
.\install.ps1 -Version '0.1.26'     # 固定版本（默认装最新发布版）
.\install.ps1 -DshHome 'D:\.dsh'    # 自定义 DSH 主目录（默认 %DSH_HOME% 或 %USERPROFILE%\.dsh）
.\install.ps1 -ProfileName 'web'    # 目标 profile（默认 web；profile 需已初始化）
```

### 方式三：源码安装（已验证端到端）

```sh
git clone https://github.com/TQSY114514/dsh-ui-appearance.git
dsh plugin --profile <name> add file:<克隆到的本地路径>
```

卸载：`dsh plugin --profile <name> remove dsh-ui-appearance`（脚本安装则删除 profile `node_modules` 下的 junction 与 `package.json` 中对应的 `dependencies`/`bundles` 条目）。

**更新**：新版本发布后，重新执行 `add` 命令或安装脚本即可升级到最新版。

> **DSH Desktop 用户**：Desktop 的 profile 与 Web 版相互独立——三种方式都可用，但要把插件装进 Desktop 实际激活的 profile（默认名为 `desktop`；Desktop 内置终端里直接跑 `dsh plugin` 即可，默认作用于当前激活的 profile）。

> 安装流程已验证端到端:npm registry 与 `file:` 源码直装两种方式均实测可用(host 半部零 `@deepseek-ai` 运行时依赖,浏览器与 Host 均能正确加载)。克隆后 `pnpm install` 会自动构建;修改代码后重新执行 `pnpm install && pnpm prepare` 并重启 dsh web。
> 版本演进见 [CHANGELOG.md](CHANGELOG.md)。

## 使用

1. 打开 WebUI,进入侧栏「设置」→「通用」
2. 在「外观」行下方找到「个性化外观」,点击展开
3. 点预设快速换肤 → 用取色器或 HEX 微调 6 个颜色角色 → 上传或拖入壁纸/视频 → 拖动氛围与界面滑块
4. 完成。所有调整实时生效,无需刷新、无需保存

设置面板内容一览:

| 区块 | 控件 |
|---|---|
| 模式与预设 | 浅色模式（默认 / 晨曦 / 云天 / 薄荷 / 樱粉 / 雅灰）与深色模式（默认 / 午夜 / 海洋 / 森林 / 玫瑰 / 单色）独立切换，一键应用后可继续微调 |
| 主题颜色 | 6 个角色 × (取色器 + HEX 输入)：主色、背景色、面板色、输入框色、文字色、边框色（全局所见即所得，气泡/按钮/选区内置智能对比度兜底） |
| 背景 | 图片上传/更换/删除、视频上传/删除、**URL 加载(图片/视频)**、背景不透明度、背景模糊、背景遮罩 |
| 界面 | 面板不透明度、侧边栏不透明度、设置与弹窗不透明度、输入框不透明度、代码块不透明度、强调字浓度、毛玻璃强度 |
| 配色方案 | 导出配色、导入配色(JSON 文本) |

## 持久化与恢复

- 设置保存在浏览器 localStorage(键 `dsh-ui-appearance.settings`),刷新与重启后保留,多标签页自动同步
- 从 profile 移除插件后界面恢复默认:卸载时自动回收所有覆写 token、样式表与背景图层
- 注意:设置跟随浏览器,换浏览器或清除站点数据会丢失;壁纸原图存 IndexedDB(localStorage 只存记录键),不受 localStorage 配额约束,并已向浏览器申请持久化存储降低被清理概率

## 工作原理

| 能力 | 机制 |
|---|---|
| **颜色与对比度** | `ctx.theme.overrideTokens()` 覆写 `--dsw-alias-*` 语义 Token，支持深浅双模式独立配置与所见即所得色彩还原。内置 WCAG 2.1 动态反解算法（`a11yLabelStep`）保证次级文字 $\ge 7:1$、三级文字 $\ge 4.5:1$；针对用户消息气泡（`bubbleInk`，综合面板透明度与底层画布/壁纸合成色）、文字选区（`selectionColors`）及主色按钮提供局部对比度自动兜底，既保留自定义文字色又杜绝撞色隐形 |
| **背景三层架构** | 自主研发三层独立图层（底层纯色画布 + 中层媒体层 + 顶层防眩光遮罩），沉底在 `position: fixed; z-index: -1`。当壁纸/视频生效时，自动对宿主底座（`--dsw-alias-bg-base`）进行**透明打孔**，绝不给 `#root` 赋予 `position`/`z-index`，从原理上消除层叠上下文（Stacking Context）陷阱，保证宿主与设置弹窗永远位于最顶层 |
| **组件级毛玻璃与边缘抗虚** | 背景模糊采用底层画布 `filter: blur` 配合 `inset: -48px` 外扩延伸，彻底消除屏幕四周半透明羽化白边；毛玻璃强度（`glassBlur`）则解耦为组件级 `backdrop-filter`，并在侧边栏（`[class*="_sidebarCol"]::before`）与输入框卡片（`[data-composer-card]::before`）采用伪元素隔离技术，既不捕获 Windows 桌面端 `position: fixed` 标题栏按钮，也不形成 CSS Backdrop Root 裁剪斜杠命令（`/`）浮层 |
| **交互悬停闭环** | 中性控件与操作按钮的 Hover 态 Token（`--dsw-alias-interactive-bg-hover` 及 `-solid`）在半透明模式下同步烘焙当前透明度，保持悬停微调明暗（10%~15%）的同时严格透出背景，杜绝鼠标滑过按钮闪烁成实心水泥块（避免 `hover snapped opaque`） |
| **视频原生硬解** | 基于 Chromium 原生硬件加速流式解码，静音循环播放。视频文件通过 IndexedDB Blob 引用直存（最高 200MB），不经 Base64 编码，零额外堆内存复制 |
| **持久化与清理** | 外观配置存入浏览器 `localStorage`（键 `dsh-ui-appearance.settings`），跨标签页瞬时同步；图片与视频存入 `IndexedDB`。更换媒体或“恢复全部默认”时自动执行 Blob 垃圾回收（`deleteImage` / `deleteVideo`），绝不产生孤儿文件残留 |

## 兼容性与限制

- **多端开箱即用**：完整支持 WebUI 与 [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)（高级模式与兼容模式均可正常使用）；内建针对 Windows 官方桌面端自定义标题栏框架（`.BynINW_frame`）的透明打孔补丁（[#31](https://github.com/TQSY114514/dsh-ui-appearance/issues/31)）。
- **深浅双模式独立配置**：支持浅色模式与深色模式各自保存一套独立的 6 色调色盘与专属预设，跟随系统或宿主深浅色无缝自适应切换。
- **性能与低端设备优化**：半透明计算直接在 CSS 变量层面预烘焙为 `rgba()`，拖动滑块时自动冻结全局 CSS 过渡动画确保 60fps 丝滑跟手；若设备性能有限可直接将“毛玻璃”和“背景模糊”滑块归零关闭。
- **大文件媒体支持**：图片不压缩、原图直存 IndexedDB（超 4096px 智能等比缩边为 WebP，限内 GIF 保留动效）；视频上限放宽至 200MB，支持拖拽上传与网络 URL 加载。
- **语法高亮与气泡**：代码块高亮（Shiki）遵循语法高亮独立配色规范；用户消息气泡跟随面板色与透明度（字色与选区高亮自适应对比度），AI 消息保持透明融入背景。

## 常见问题 (FAQ)

- **Q: 安装或更新后在 DSH 设置中没有看到「个性化外观」入口？**
  - **检查 Profile**：确认插件装入了当前运行的 profile（DSH Desktop 默认 profile 为 `desktop`，Web 版通常为 `web`；可运行 `dsh plugin list` 检查）。
  - **编译与重启**：若克隆源码直装，请确保先执行了 `pnpm prepare` 生成 `lib/` 产物，并重启 DSH 服务（如 `dsh web`）。
  - **强制刷新**：按 `Ctrl + F5`（Mac 为 `Cmd + Shift + R`）强制刷新浏览器，清除前端旧缓存。

- **Q: 为什么上传壁纸或视频后，界面依然是一片实心底色，看不到背景？**
  - **打孔被遮挡**：我们的背景层沉底在 `z-index: -1`，并通过将官方底座 `--dsw-alias-bg-base` 设为 `transparent` 实现透光。若您同时启用了**第三方实心全量皮肤**（如部分强制给 `body` 或 `#root` 赋予了不透明背景色的主题插件），底部的天窗会被堵住。建议排查并停用全实心第三方皮肤，或在其设置中降低不透明度。
  - **Windows 桌面端标题栏**：请确保升级至本插件最新版本，已内置对 Windows 桌面端框架层的自动打孔修复（[#31](https://github.com/TQSY114514/dsh-ui-appearance/issues/31)）。

- **Q: 为什么拉大了「毛玻璃」滑块，侧边栏/输入框/设置面板却看不出毛玻璃效果？或者主界面调成全透明后怎么保证设置窗口看清字？**
  - **需配合半透明使用**：毛玻璃（`backdrop-filter`）需要组件底色处于半透明状态才能透出背后的磨砂画面。若对应的「侧边栏不透明度」「输入框不透明度」或「设置与弹窗不透明度」仍在 `100%`（纯实心），实心底色会遮住毛玻璃效果；只需将其调低至 `40%~80%` 即可呈现通透的磨砂玻璃质感。
  - **多路独立不透明度**：主聊天面板、侧边栏、设置与弹窗、输入框、代码块的不透明度彼此完全独立。你可以将「面板不透明度」设为 `0%` 让聊天区完整透出壁纸，同时将「设置与弹窗不透明度」保留在 `80%~95%` 并开启「毛玻璃」，兼顾全透壁纸与设置弹窗的高可读性。

- **Q: 上传视频或输入视频 URL 后黑屏、无法播放或提示解码错误？**
  - **编码格式限制**：Chromium 内核原生硬解支持 **H.264 (MP4)** 和 **VP8 / VP9 (WebM)**。若视频采用了浏览器未原生支持的编码（例如 HEVC / H.265、部分 `.mov` 容器或特定音频轨），会导致解码失败。建议使用转码工具（如 HandBrake 或 FFmpeg）将其转码为标准的 H.264 MP4 格式后再次上传。

- **Q: 粘贴图片或视频 URL 提示加载失败？**
  - **跨域与防盗链（CORS）**：由于浏览器安全沙箱限制，粘贴的 URL 所属服务器必须允许跨域访问（携带 CORS 请求头）且未开启严格防盗链。若遇到受限链接，建议直接将图片或视频下载到本地后拖拽上传（本地文件直接走 IndexedDB，原画质存储且无网络依赖）。

- **Q: 重置设置或频繁更换视频，会不会导致磁盘空间被垃圾文件占满？**
  - **完全不会**。本插件拥有严密的生命周期管理机制：在用户更换新壁纸/视频、或者在设置面板点击「恢复全部默认」时，代码会立即主动调用 `deleteImage` 与 `deleteVideo` 清理 IndexedDB 中的旧 Blob 记录，绝不会残留孤儿文件。

- **Q: 我的外观配置保存在哪里？如何备份与跨设备迁移？**
  - 设置数据保存在浏览器的 `localStorage` 中，图片与视频本体保存在 `IndexedDB` 中。
  - **一键备份与迁移**：在设置面板底部的「配色方案」区块点击「导出配色」，配置 JSON 将自动复制到剪贴板；在其他浏览器或设备中粘贴并点击「导入」即可一瞬间还原你的专属设计。欢迎在 GitHub Discussions 社区分享交流你的配色方案！

- **Q: 卸载插件后会残留样式或影响 DSH 界面吗？**
  - **绝对干净**。插件遵循“零核心代码改动、卸载必须可逆”的项目宪法。执行 `dsh plugin remove dsh-ui-appearance` 卸载后，插件会自动注销所有 Token 覆写、移除 `#dsw-appearance-bg` 图层与动态样式表，界面 100% 逐像素恢复 DSH 官方原生默认状态。

## 包结构

```
src/
├── index.ts                  # Host 半部(空 apply,零运行时依赖)
├── invariant.ts              # 运行时不变式伴生
├── appearance-settings.ts    # 设置类型与默认值
└── client/
    ├── index.ts              # apply():localStorage 持久化、插槽注册
    ├── applier.ts            # DOM 应用器(token 覆写、三层背景、毛玻璃)
    ├── tokens.ts             # 颜色角色 → token 映射、双模式预设、半透明烘焙
    ├── color.ts / image.ts   # 色值工具 / 图片预处理(超 4096px 缩边,不降质)
    ├── blob-db.ts            # IndexedDB 底座(DB v2:图片+视频两 store)
    ├── image-store.ts        # IndexedDB 图片存储(键化引用与 GC)
    ├── video-store.ts        # IndexedDB 视频存储(200MB 上限与 GC)
    ├── color-scheme.ts       # 配色导出/导入(纯函数)
    ├── settings-store.ts     # 设置镜像 store
    ├── locales.ts            # 中英文案
    └── AppearanceCustomizerRow.tsx + .module.css   # 设置行 UI
tests/                        # 测试(`pnpm test` 独立运行,@deepseek-ai 运行时以 tests/stubs 桩替代)
types/client.d.ts             # 手写 client 半部类型声明
cordis.patch.yml              # bundle patch
tsdown.standalone.config.ts   # 自包含构建
vitest.config.ts              # 独立测试配置(alias 指向 tests/stubs)
lib/                          # 构建产物
```

`@deepseek-ai/*` 依赖全部为 optional peer，运行期由宿主提供；唯一运行时依赖是 `clsx`。**178 个 vitest 测试全绿**（独立仓库可独立运行），CI 构建与产物断言全绿。

## License

MIT
