# AGENTS.md

dsh-ui-appearance 的项目宪法。动手前先读。

## What this is

DeepSeek Harness WebUI 的外观自定义插件：主题色板、壁纸/视频背景、毛玻璃与半透明、背景氛围，
全部实时预览、自动持久化。**零核心代码改动**——完全通过官方插件机制实现
（`ctx.theme.overrideTokens()` 主题扩展点 + `settings.general.item` 插槽），卸载后界面完整恢复默认。

## Start

- 包管理：pnpm（`packageManager: pnpm@10.34.5`，`type: module`）。
- 依赖安装会触发构建（`postinstall`/`prepare` 自动编译 `src/` → `lib/`）。
- 修改代码后：重新 `pnpm install && pnpm prepare`，再重启 dsh web。
- 安装验证：`dsh plugin --profile <name> add dsh-ui-appearance`（npm 或 `file:` 源码直装均支持）。

## Architecture map

- **入口** `src/index.ts`：插件装配——注册主题扩展点与设置插槽。
- **客户端运行时** `src/client/`（注入 Host 浏览器侧）：
  - `AppearanceCustomizerRow.tsx` + `.module.css`：设置面板 UI。
  - `tokens.ts`：`--dsw-*` token 系统覆写（颜色/透明/毛玻璃的核心）。
  - `applier.ts`：把设置应用到 CSS 变量。
  - `color.ts` / `color-scheme.ts`：颜色角计算、深浅色模式适配、壁纸主色提取。
  - `image.ts` / `url-load.ts`：图片上传压缩、URL 加载分流（按扩展名）。
  - `video-store.ts`：视频背景（IndexedDB 存储，避开 localStorage 配额）。
  - `settings-store.ts`：设置持久化。
  - `locales.ts`：多语言文案。
- **invariant** `src/invariant.ts`：插件前置条件/一致性检查（运行时断言）。
- **构建产物** `lib/`：编译输出（`lib/index.js` + `.d.ts`，`files` 字段只发布 `lib/` 与 `cordis.patch.yml`）。
- **宿主注入声明**：`package.json` 的 `dsh.client.inject` 列出所需 `@deepseek-ai/dsh-client-*` 运行时。
- **文档** `docs/`：截图演示；`CHANGELOG.md`：版本演进。

## Hard rules

- **零核心改动**：只通过官方扩展点（`overrideTokens` / 设置插槽）实现，禁止 patch dsh 本体逻辑。
  `cordis.patch.yml` 只做声明性接入，不做业务改动。
- **卸载必须可逆**：任何设置改动用完要能还原默认；持久化键与 CSS 变量不能污染宿主全局。
- **`lib/` 是产物，不手改**：源码在 `src/`，编译输出 `lib/` 由构建生成；新导出必须同步补 `.d.ts`。
- **CSS Modules**：组件样式用 `.module.css`，别用全局 class 名污染 Host 页面。
- **媒体走 IndexedDB**：图片与视频（上限 200MB）全走 IndexedDB Blob 存储，不许进 localStorage（配额不够）；替换时同步清理旧记录。
- **实时性**：所有调整实时生效、无需刷新、无需保存按钮——新增设置项要保持这个交互契约。
- **UI 风格**：遵循 Host 的 `--dsw-*` 设计语言，视觉上融入而非突兀；见 `src/client/*.module.css` 既有写法。
- **提交纪律**：CI 跑 build.yml（`tests/` 目录有测试），改动后本地先过构建与测试再提交。

## Traps & hard-won lessons (踩坑备忘)

- **背景层沉底与宿主打孔（Issue #10, #22）**：
  - `#dsw-appearance-bg` 必须沉底在 `position: fixed; z-index: -1`，绝不能提升到 `z >= 0` 或对 `#root` 赋予 `position/z-index`（会导致宿主弹窗被第三方插件层级遮挡）。
  - DSH 0.1.5+ 宿主框架自带 `--dsw-alias-bg-base` 不透明底色；任何背景媒体（图片或视频）生效时，必须在 `tokens.ts` 中通过统一的 `hasBackgroundMedia` 将 `--dsw-alias-bg-base` 打孔为 `transparent`，否则会被外层框架遮挡得干干净净。
  - `transparent` 底色不能直接走 `withAlpha()`，必须前置短路返回 `transparent`，否则计算出 `rgba(NaN, NaN, NaN, a)` 会使 token 失效回落不透明。
- **视频解码与错误状态闭环（Issue #26）**：
  - 浏览器对不支持的编码（如 HEVC/H.265、部分 `.mov` 容器或特定音频轨）会触发 `<video>` 的 `onerror`，必须向上打通状态通道展示可自查提示，不可静默吞掉。
  - 清理视频（`key === ''`）时必须无条件重置错误状态（`reportVideoError(false)`），否则删除视频或切回壁纸后错误提示会永久常驻。
- **大文件存储与清理**：
  - 图片与视频上限均为 200MB，走 IndexedDB Blob 引用（`dsh-appearance-blobs`），零额外堆内存复制，播放由 Chromium 原生流式硬解。
  - 更换媒体必须清理 IndexedDB 旧记录，避免无感磁盘膨胀。

## Before changing X, read Y

- 改颜色/主题 → `src/client/tokens.ts` + `color.ts` + `color-scheme.ts`。
- 改设置面板 UI → `AppearanceCustomizerRow.tsx` + `settings-store.ts`。
- 改壁纸/视频 → `image.ts` + `url-load.ts` + `video-store.ts`。
- 改文案 → `locales.ts`。
- 改导出面 → `src/index.ts` + `package.json` `exports` + `lib/index.d.ts`。

## Verification

- `pnpm install`（含 prepare 构建）成功。
- `dsh plugin --profile <name> add .` 端到端安装可用（host 侧浏览器能加载）。
- 卸载后界面完整恢复默认。