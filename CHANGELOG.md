# Changelog

本插件的版本演进记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.20] - 2026-10-07

### Fixed

- **背景三层架构重构与不透明度/遮罩视觉解耦**:
  - **根本原因**：之前不透明度直接作用于背景层，当存在壁纸打孔时，调低壁纸不透明度直接穿透露出底层白色的浏览器 `body`，视觉效果与高遮罩（蒙白）混淆雷同。
  - **修复方案**：重构为底层基础画布（#dsw-appearance-bg 容器承载用户设定的“背景色”）、中层媒体层（`::before` 图片 / `<video>` 视频承载不透明度与模糊）、顶层防眩光遮罩（`::after` 渐变蒙层，现亦支持视频）的三层独立体系。调低不透明度时壁纸平滑融入用户背景色，消除白斑；遮罩层纯粹提供文字防眩光保护。并在设置面板不透明度滑块下方补充了直观提示文案。
- **面板色与背景色角色彻底解耦**:
  - **根本原因**：之前多级表面（`layer-1` ~ `layer-3`）及气泡在缺少独立面板配置时回落至背景色进行衍生，导致用户修改背景色时连带影响界面面板和气泡底色。
  - **修复方案**：收敛角色边界，背景色仅控制基础画布底色（`--dsw-alias-bg-base`），面板、气泡及浮层控件底色全由“面板色”独立掌管，彻底消除联动副作用。

## [0.1.19] - 2026-10-07

### Fixed

- **设置面板主题颜色选项角色名称文本丢失（回归修复）**:
  - **根本原因**：在早前优化原生取色器拖拽体验（commit `69c37f3`）时，`ColorField` 组件模板内不慎遗漏了 `<span className={css.colorLabel}>{label}</span>`，导致颜色网格中仅展示色块与十六进制输入框，缺少“强调色”、“背景”、“面板”、“文字”、“输入框”、“边框”等角色名称提示。
  - **修复方案**：恢复 `ColorField` 内的 `.colorLabel` 角色名称展示，并在组件测试中增加渲染断言以防止后续回归。

## [0.1.18] - 2026-10-07

### Fixed

- **浅色模式下次级/三级文字及输入框占位符对比度不足（WCAG AA 保底与动态反解）** ([#33](https://github.com/TQSY114514/dsh-ui-appearance/issues/33)):
  - **根本原因**：原有三级文字推导采用固定混色权重（向白色混入 58%），设下了数学天花板（纯黑在白底仅 3.03:1，默认值仅 2.50:1），导致浅色模式下三级文字与说明小字偏淡难读；同时未接管宿主输入框占位符依赖的 `--dsw-alias-label-caption`（仅 2.10:1）；背景反转分支硬编码了次级/三级常量；深色模式下未接管 `--dsw-alias-menu-icon` 导致搭配浅面板时图标隐形（1.03:1）。
  - **修复方案**：
    1. 引入符合 WCAG 2.1 规范的二分反解算法（`a11yLabelStep`），在保证原有设计色阶的同时，动态反解出满足目标对比度的最大混色权重，确保次级文字 $\ge 7:1$、三级文字 $\ge 4.5:1$。
    2. 全面接管并输出 `--dsw-alias-label-caption`，输入框 `::placeholder` 对比度从 2.10:1 提升至 $\ge 4.5:1$。
    3. 接管 `--dsw-alias-menu-icon` 并保证 $\ge 7:1$ 对比度，彻底杜绝深色模式下菜单图标隐形。
    4. 重构 `invert.background` 背景反转分支，次级、三级、caption 及图标全部接入自适应动态反解，消除反转后的对比度断层。

## [0.1.17] - 2026-10-02

### Fixed

- **Windows 官方桌面端（DSH 0.2.0+）背景被外层框架遮挡及受面板不透明度干扰** ([#31](https://github.com/TQSY114514/dsh-ui-appearance/issues/31)):
  - **根本原因**：官方桌面端针对 Windows 自定义标题栏（`[data-windows-titlebar]`）将包裹全屏的外层三栏框架 `.BynINW_frame` 及其标题栏拖拽条 `:before` 硬编码为 `background: var(--dsw-specific-sidebar-fill)`。当表面不透明度（`surfaceAlpha`）为 100% 时，该不透明底色完整覆盖了底层壁纸（导致主聊天区全灰）；而调低表面透明度时，因外层框架变半透明才透出壁纸，造成“背景图片随面板不透明度忽亮忽暗”的错觉。
  - **修复方案**：在背景媒体激活时（`data-dsw-has-bg`），自动对 Windows 桌面端框架层（`[data-windows-titlebar] [class*="_frame"]`）及其顶部拖拽条进行透明打孔，使其行为与 macOS（官方自带 `background: 0 0`）和 Web 端保持一致。主聊天区域在表面不透明度 100% 下清晰完整展示背景图，调节面板透明度时仅侧边栏和面板自身改变透明度，不再干扰主区域壁纸。卸载或清空背景时自动恢复默认样式。

### Changed

- **设置项顺序调整**：将常规设置中“外观定制”入口插槽的 `order` 调整为 `1000`，确保其在官方新增设置项后始终保持在“常规设置”的最底部。

## [0.1.16] - 2026-10-01

### Fixed

- **浮层菜单与小面板（Agent 模式权限下拉框、左下角头像菜单、任务面板等）透明度与毛玻璃跟随调节**:
  - **透明度支持**：修复 DSH 底层通用组件 `MenuSurface`（Agent 模式权限选项、用户头像菜单、模型下拉等）使用未接管的私有 Token `--dsw-menu-surface-fill`，导致其背景透明度始终被锁死在官方默认值（浅色 58%、深色 45%）的问题。现将 `--dsw-menu-surface-fill` 与任务面板 `--dsw-alias-fill-l1` 纳入表面体系与强制映射，使所有浮层面板完美跟随「表面透明度 (`surfaceAlpha`)」实时无级调节。
  - **毛玻璃滤镜接管**：修复官方为浮层写死 `--dsw-menu-backdrop-filter: blur(40px) saturate(150%)` 导致小面板始终固定有 40px 模糊的问题。现已由「毛玻璃 (`glassBlur`)」滑块统一接管控制，设为 0px 时彻底关闭模糊，调大时平滑加深虚化，卸载时干净复原。

## [0.1.14] - 2026-10-01

### Fixed

- **实心标签（如 Agent 预设“新任务默认”）在低透明度下文字隐形问题**:
  - 修复 DSH 官方 `Tag` 组件在 `data-tone="solid"` 下使用表面 Token `--dsw-alias-bg-layer-3` 作为文字颜色导致的隐形问题。当用户调低表面透明度（`surfaceAlpha < 1`）时，文字随之透明化（在透明度为 0% 时完全透明隐形），导致实心标签只剩底色看不清文字。
  - 通过注入 `:is(#root, body) [data-tone='solid'] { color: var(--dsw-alias-label-primary-inverted) !important; }`，强制使用恒定高对比度且不透明的反转文字墨水色，确保无论表面透明度如何调整均始终清晰可读。
- **任务产出物与“已修改 X 个文件”卡片支持跟随表面透明度（`surfaceAlpha`）**:
  - DSH 官方 deliverables 组件写死了静态不透明 Token（`--changes-fill` / `--deliverable-fill` 为 `--dsw-static-neutral-50/850`），导致开启半透明时卡片标题和产出物文件项依然呈现为不透明实心方块。
  - 现已将其映射至受控的半透明别名 Token（`--dsw-alias-bg-module-platform` 与 `--dsw-alias-interactive-bg-hover-solid`），使完成任务后的文件改动栏与产出物卡片实时同步半透明与悬浮反馈。

## [0.1.13] - 2026-10-01

### Fixed

- **默认预设主题色号显示与交互修复** ([Discussion #30](https://github.com/TQSY114514/dsh-ui-appearance/discussions/30)):
  - 修复默认主题（`default` 预设）下色号文本框因初始值为空字符串而展示为空白的问题。现自动显示当前深/浅色模式下的原生基准色号（如浅色背景 `#ffffff`、深色背景 `#151517`、品牌主色 `#4176e6` 等），与其它主题预设行为保持一致。
  - 增加 `placeholder={stock}` 兜底及样式；当用户清空输入框或输入默认色号时，自动重置为空字符原生基准，避免产生冗余自定义覆写。
- **暗色壁纸自适应翻转下的子表面白底白字问题** ([Discussion #30](https://github.com/TQSY114514/dsh-ui-appearance/discussions/30)):
  - 补全 `calcFlip` 中对子表面（输入框 `input`、平台模块 `mod`、层级3 `l3`、浮层 `overlay`、提示 `tip` 等）的反转计算，并接入 `bakeAlpha` 与 `translucent`，确保暗色壁纸自适应翻转下文字与输入框表面对比度正确。

### Added

- **外观模式切换说明** ([Discussion #30](https://github.com/TQSY114514/dsh-ui-appearance/discussions/30)):
  - 在浅色/深色模式分段切换器下方新增引导说明文案，说明该切换器用于分别配置浅色和深色配方，而非更改客户端全局深浅色主题。

## [0.1.12] - 2026-09-25

### Added

- **兼容 DSH `0.1.7-rc.1+` 设置面板图标重命名** ([#28](https://github.com/TQSY114514/dsh-ui-appearance/issues/28)):
  - 新增 `PersonalizationIcon` 适配层，自动按优先级解析 `IconPersonalizationOutlineRegular`（`>= 0.1.7-rc.1`）、`IconPersonalizationOutlineMedium` 与 `IconPersonalizationOutline16`（`<= 0.1.6`），并提供内联 SVG 兜底，解决升级 DSH `0.1.7-rc.1` 后因旧图标名 `undefined` 触发 `SlotErrorBoundary` 导致设置入口不可见的问题。

### Fixed

- **修复用户发言气泡内文件/技能引用标签（`.refChip`）同色不可读问题** ([#27](https://github.com/TQSY114514/dsh-ui-appearance/issues/27)):
  - 在用户消息气泡作用域（`#root [class*="_bubble"]`）内将 `--dsw-alias-state-business-primary` 与 `--dsw-alias-brand-primary` 局部映射至气泡文字前景色（兼容主色自动反色与自定义文字色），并为 `.refChip` 增加 14% 透明度自适应胶囊底衬与下划线。

### Changed

- **文档**: README 徽章升级为 `flat-square` 深色方角风格，并将 npm 下载量徽章从月下载量（`dm`）切换为总下载量（`dt`）。

## [0.1.11] - 2026-09-19

### Fixed

- **仅设置视频背景时视频不显示** ([#22](https://github.com/TQSY114514/dsh-ui-appearance/issues/22)):
  - 修复主题 Token 覆盖计算时仅判定 `backgroundImage` 而漏判 `backgroundVideo` 的缺陷。在 DSH 0.1.5+ 环境下，仅设置视频时同样将底座 `--dsw-alias-bg-base` 设为 `transparent`，避免宿主外层框架遮挡底层视频。
  - 修复 `transparent` 底色在 `surfaceAlpha < 1` 下经过 `withAlpha` 烘焙产生 `rgba(NaN, NaN, NaN, a)` 无效样式的隐患。
  - 修复视频解码失败后删除视频（或切回图片壁纸）时警告提示不会消失的状态复位问题。

### Added

- **视频背景大小上限放宽至 200MB**:
  - 视频存储采用 IndexedDB Blob 引用机制（不占用 localStorage 配额且零额外内存复制），播放基于 Chromium 原生流式硬解，放宽至 200MB 完美覆盖各类 1080p/4K 动态壁纸循环素材。
  - 同步更新 URL 加载大小限制文案、扩展名识别（支持 `.mp4`, `.webm`, `.ogv`, `.ogg`, `.mov`, `.mkv`, `.m4v`）。
- **视频解码与格式容错提示**:
  - 当视频编码不受当前浏览器解码器支持（如 HEVC/H.265）时，展示友好提示文案。
  - 支持拖拽视频文件设置背景，且优化了“更换视频”/“删除视频”的按钮交互。

## [0.1.10] - 2026-09-12

### Added

- **主色与背景角色的文字自动反转**（[#18](https://github.com/TQSY114514/dsh-ui-appearance/issues/18) 续）:
  - 角色级「反」开关为主色与背景色独立生效:主色的「反」控制主色表面上的文字（气泡内文字等）自动使用对比色;背景色的「反」控制全局文字自动使用对比色,无需手动搭配深浅文字。
  - 背景反转在已设置自定义文字色时同样生效（显式覆盖优先级高于文字角色）。

### Changed

- **反转角色收敛**:面板与输入框角色的「反」开关移除——单一全局 label token 无法表达每个子表面的墨色、会跨表面劫持全局文字,只保留语义安全的整表面角色（主色/背景）。
- **对比度墨色判定偏向浅墨**:饱和品牌色（如 `#4176e6`）现在自动配白字,浅色品牌色仍配深字。

### Fixed

- **侧边栏徽标字母不再丢失**:背景反转现在同步重导 `-inverted`/`-foreground` 配对 token,翻转后的浅色徽标 chip 配深色字母,不再同色消失。
- **拖拽丝滑度**:颜色拖拽合并到渲染帧（rAF 对齐,替代 30fps 定时器）,取色器会话期间冻结宿主过渡动画,接近 60fps 跟手。
- **取色面板深/浅 tab 跟随宿主当前模式**同步切换。
- **重置按钮/重置全部**:`invert` 标志改为深拷贝,不再意外改写共享默认值。

## [0.1.9] - 2026-09-12

### Security

- **修复 vitest 路径穿越/任意文件读取漏洞（GHSA）**:将 `vitest` 与 `@vitest/mocker` 从 `4.1.10` 升级到 `4.1.11`（官方补丁版本，无需破坏性升级到 5.x）。

### Changed

- **升级构建工具**: `tsdown` 从 `0.22.14` 升级到 `0.23.0`，构建产物保持兼容。
- **文档**: README 加入「Listed on DSH Directory」徽章；Awesome DSH Plugin 徽章跳转由首页改为本插件详情页（中/英分链）。

## [0.1.8] - 2026-09-05

### Added

- **深浅色双模式独立外观与跟随系统自适应** ([#18](https://github.com/TQSY114514/dsh-ui-appearance/issues/18)):
  - 设置面板顶部加入浅色模式与深色模式分段选项卡，支持独立配置浅色与深色模式下的 6 种颜色角色与预设。
  - 实时监听宿主界面模式状态与系统 prefers-color-scheme，显示「当前」徽章并默认聚焦当前激活模式。
  - 基于 DSH 主题扩展点原生 `{ light, dark }` Token 推导，彻底解决系统在浅色/深色切换时颜色不适配、文字对比度失衡的问题。
  - 新增 5 款精选浅色主题预设：晨曦 (Dawn)、云天 (Sky)、薄荷 (Mint)、樱粉 (Sakura)、雅灰 (Clay)。
  - 自动平滑迁移历史单套外观配置，老数据无损继承；配色方案导入导出同步支持双模式。

## [0.1.7] - 2026-09-04

### Fixed

- **适配 DeepSeek Harness 0.1.2+**: 将设置 store 引擎 (`defineStore`) 迁移至 `@deepseek-ai/dsh-client-store`，更新 `dsh.client.inject` 声明、`peerDependencies` 及构建放行规则，避免最新版 Harness / Desktop 环境下因缺少旧运行时注入而导致插件加载失败。
- **更新依赖**: 升级 `@testing-library/react` 到 `^16.3.3` (PR #17)。

## [0.1.6] - 2026-08-26

### Changed

- **壁纸不再压缩、不再限大小**:原图直接存入 IndexedDB(localStorage 只存记录键),仅超过 4096px 时等比缩边为 WebP(限内的 GIF 动画原样保留);旧 data URL 壁纸升级后自动迁移;已向浏览器申请持久化存储降低被清理概率。视频上限放宽至 50MB,并改为 Blob 引用直存(不再全量读入内存)
- 本地上传失败提示报具体原因:类型不符 / 超过大小上限 / 读取失败分流提示(此前图片与视频一律笼统报「无法读取」)

## [0.1.5] - 2026-08-23

### Fixed

- **设置界面被第三方顶层面板盖住**([#10](https://github.com/TQSY114514/dsh-ui-appearance/issues/10)):样式表里 `#root { position: relative; z-index: 1 }` 让 #root 成为 stacking context,设置对话框(`z-index: 1000`)被困在其内部、对外等效 z=1——启用 dsh-better-sidebar 等在 #root 之外放置顶层面板(z=40)的插件后,设置界面被盖住;现改为壁纸图层压到 `z-index: -1`(内容之下、body 背景之上,视觉不变),#root 不再创建 stacking context,对话框回到顶层
- **毛玻璃滑杆接管对话框遮罩模糊**:宿主对话框遮罩的 `--dsw-mask-blur` 原生恒为 `blur(2px)` 且从不变化;现跟随毛玻璃滑杆——调大时被面板/弹窗盖住的界面内容(含文字)随之模糊,调到 0 完全清晰(`blur(0px)`,不回落宿主默认 2px);卸载或禁用插件即恢复宿主原生状态

## [0.1.4] - 2026-08-21

### Added

- **一键安装脚本** `install.ps1`:从 npm registry 拉取发布包(自带预构建 `lib/`),解包到持久插件目录并注册进 profile,无需 Node/pnpm 环境;支持 `-Version`/`-DshHome`/`-Profile` 参数,重复执行幂等

### Fixed

- **悬浮跳回实心**:发送键(`button-info-hover`)与主操作按钮/full access 启用键(`button-primary-hover`)的 hover 填充此前不透明,半透明界面下鼠标一悬停按钮就"变实";现跟随输入框不透明度同步烘焙,悬浮与常态观感一致
- **"harness" 徽章白底白字**:文字色设为浅色时侧栏徽章消失——徽章依赖的反色 token(`label-primary-inverted`)未随文字色配对重算;现在覆写文字色的同时同步烘焙 `-inverted`/`-foreground` 配对
- **"+"命令按钮不跟随主题**:输入框左侧命令按钮的静止/悬浮色此前只在半透明分支覆盖且用库存近白基色,面板 100% 时保持白色;现接入中性控件家族(面板色派生、深色翻转、半透明重烘)
- **输入框不透明度在面板 100% 时失效**:发送键/停止键/"+"键的独立旋钮此前被包裹在面板透明度条件内,面板全不透明时调节无效;现与输入框表面同一契约,任意面板值下都生效
- 排查确认其余 hover token(`interactive-bg-hover` / `-danger` / `button-tool-bar-hover`)库存值本身即低透明度,无此问题,保持原样

## [0.1.3] - 2026-08-17

### Changed

- **默认主色 = 品牌蓝**(`#4176e6`):按用户要求改回,发送按钮/链接/强调字全部跟蓝色;空 accent(旧设置)也自动显示蓝色而非白色
- **发送键/停止键/命令键**(`button-primary-fill`/`button-info-fill`/`specific-selector`)全部改由**输入框不透明度**控制,面板透明度不再影响它们——不会"抽搐"
- **设置面板色块**:空角色显示 stock 默认色(主色=蓝、文字=黑),取色器 value 也同步为 stock 色,不再显示白色

### Fixed

- 修复 `button-info-fill` 默认色与 `button-primary-fill` 不一致导致停止按钮视觉差异

## [0.1.2] - 2026-08-17

### Changed

- **默认主色 = 白色**(产品决策):强调元素(按钮/链接/强调字)默认跟随白色,界面其余保持主题原样;强调字 chip 不再出现蓝色/黑色
- **输入框/代码块不透明度 = 绝对语义**:100% = 完全不透明,与面板不透明度零耦合(修复面板 100% 时独立旋钮被重置的 bug)
- **壁纸自动取色扩展为智能配色**:背景/面板/输入框/边框按主色派生亮度阶梯;文字色保持用户控制,不被翻白
- 设置面板色块显示主题实际默认色(所见即所得,未设置时不再误导为白色)

### Fixed

- 面板不透明度 100% 时输入框/代码块独立设置被跳过

## [0.1.1] - 2026-08-15

### Added

- 背景区新增 **URL 加载**:粘贴图片或视频 URL 一键加载,按扩展名自动分流(视频走 IndexedDB,图片走压缩管线);CORS/网络/HTTP/类型/大小五类失败各有明确提示

### Changed

- 独立仓库支持自验证:tsconfig paths 映射 `@deepseek-ai/*` peer 到最小声明(`types/peers.d.ts`),`tsc --noEmit` 不再依赖 harness 工作区

## [0.1.0] - 2026-08-15

正式发布版。功能自 rc.6 无变化,仅版本转正(rc 阶段已累计 97 个测试、双环境验证、端到端安装实测)。

## [0.1.0-rc.6] - 2026-08-15

### Fixed

- 半透明覆盖补全:命令(加号)按钮及其 hover、任务按钮 hover、对话区任务面板/排队坞/目标栏、行内代码与代码块、设置面板(bg-layer-2 跟随面板色)
- 强调字(行内代码 chip)背景从实心白改为主色低透明度——强调靠色相而非实心

### Added

- 强调字浓度滑块(0~45%,默认 22%,与 harness 原生引用 chip 一致)
- 气泡跟随主色:移除两个气泡颜色角色(8 角色 → 6 角色),更简约;此前「用户消息气泡」因 harness 渲染断链而无效的问题一并消除

## [0.1.0-rc.5] - 2026-08-15

### Added

- 视频背景(IndexedDB 存储,20MB 上限,解码失败自动降级回壁纸)
- 配色导入/导出(JSON 分享 6 色角色)
- 侧边栏保持不透明开关
- npm 分发名 `dsh-ui-appearance`(原 `@deepseek-ai/dsh-client-ui-appearance`)

## [0.1.0-rc.4] - 2026-08-15

### Added

- 背景遮罩(scrim,随深浅模式自动配色)
- 文字选区/键盘焦点环跟随主色
- 独立安装器(tsdown standalone 构建 + cordis.patch.yml + prepare 脚本)

### Fixed

- pending-map 竞态:被抑制的旧 RPC 回包不再闪现旧值

## [0.1.0-rc.3] - 2026-08-15

### Fixed

- 半透明空串 bug:未自定义颜色时调节面板透明度会产出非法 `color-mix` 导致表面全透明
- 120ms 防抖窗口内的最后编辑被 RPC 回包覆盖丢失
- 误覆写 `--dsw-alias-brand-text` 导致按钮文字与底色同色不可读
- 图片降级无上限(可达数十 MB)

### Added

- 取色器/HEX 输入/滑块补齐 `aria-label`

## [0.1.0-rc.2] - 2026-08-15

### Added

- 深色壁纸/深色背景自动协调翻转(表面层抬亮、侧边栏跟随、文字翻亮、按钮跟随变暗)
- imageDark 自动亮度采样(<35% 平均亮度判暗)
- 图片阶梯压缩(1920/1280/960px × 质量 0.82→0.5,WebP 优先)

## [0.1.0-rc.1] - 2026-08-14

### Added

- 8 个颜色角色调色盘(取色器 + HEX 输入)
- 背景图片(上传/拖拽,自动压缩)
- 背景不透明度/背景模糊
- 面板不透明度/毛玻璃
- 6 套预设主题
- localStorage 持久化,实时预览
