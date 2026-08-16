# Changelog

本插件的版本演进记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

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
