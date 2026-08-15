# dsh-ui-appearance

DeepSeek Harness 外观自定义插件 —— 自由调色的主题色板、壁纸背景、毛玻璃与背景氛围,全部实时预览、自动持久化。

> 零核心代码改动:完全通过官方插件机制(`ctx.theme.overrideTokens()` 主题扩展点与 `settings.general.item` 插槽)实现;卸载后界面完整恢复默认。

<!-- 演示:将录屏放入 docs/demo.gif 并替换此行
![demo](docs/demo.gif)
-->

## 界面

| 设置面板 | 壁纸 + 毛玻璃效果 |
|---|---|
| ![设置面板](docs/screenshot-settings.png) | ![壁纸毛玻璃](docs/screenshot-wallpaper.png) |

> 效果图中的壁纸素材 © MadYY([原图](docs/wallpaper-madYY.png)),仅作演示;用户上传自己的图片即可。

## 功能

**主题颜色** —— 6 个颜色角色:主色、背景色、面板色、输入框色、文字色、边框色。每个角色都支持取色器与 HEX 输入;文字选区与键盘焦点环自动跟随主色;消息气泡跟随主色(半透明时保留主色相)。

**壁纸背景** —— 点击上传或拖拽图片(JPG / PNG / WebP),自动压缩后作为全界面壁纸;上传时自动采样亮度,深色壁纸会协调抬亮表面、翻亮文字、按钮跟随变暗,保证可读性。也支持**视频背景**(MP4 / WebM,静音循环,与图片互斥),视频存入 IndexedDB,不占用 localStorage 配额。

**毛玻璃与半透明** —— 面板不透明度与毛玻璃强度两个滑块,让侧边栏、设置面板、聊天区、任务面板、卡片、按钮一同融进壁纸,而非突兀的实心色块;侧边栏可单独保持不透明。路径/文件名等强调字(`pnpm-lock.yaml`、`lib/`)的背景会保留主色的低透明度色相——强调靠色相而非实心,同时可用「强调字浓度」滑块独立调节深浅(0% 即完全透明)。

**背景氛围** —— 背景不透明度、背景模糊、背景遮罩三个独立滑块:不透明度控制壁纸的浓淡,模糊让壁纸退到远处,遮罩在壁纸上叠加随深浅色模式自动配色的纱帘,保证图片上的文字易读。

**预设起步** —— 默认 / 午夜 / 海洋 / 森林 / 玫瑰 / 单色六套预设,一键应用后仍可自由微调,不被预设锁死。

**配色分享** —— 一键导出配色 JSON(复制到剪贴板),粘贴导入即应用;与朋友交换配色方案只需一段文本。

所有修改实时生效,无需刷新,无需保存。

## 安装

```sh
# npm 发布版(推荐)
dsh plugin --profile <name> add dsh-ui-appearance

# 或从源码(已验证端到端)
git clone https://github.com/TQSY114514/dsh-ui-appearance.git
dsh plugin --profile <name> add file:<克隆到的本地路径>
```

卸载:`dsh plugin --profile <name> remove dsh-ui-appearance`

> 安装流程已验证端到端:`file:` 安装会把插件复制进 profile 目录树,host 半部零 `@deepseek-ai` 运行时依赖,浏览器与 Host 均能正确加载。克隆后 `pnpm install` 会自动构建;修改代码后重新执行 `pnpm install && pnpm prepare` 并重启 dsh web。
> 版本演进见 [CHANGELOG.md](CHANGELOG.md)。

## 使用

1. 打开 WebUI,进入侧栏「设置」→「通用」
2. 在「外观」行下方找到「个性化外观」,点击展开
3. 点预设快速换肤 → 用取色器或 HEX 微调每个颜色角色 → 上传或拖入壁纸 → 拖动氛围滑块
4. 完成。所有调整实时生效

## 持久化与恢复

- 设置保存在浏览器 localStorage(键 `dsh-ui-appearance.settings`),刷新与重启后保留,多标签页自动同步
- 从 profile 移除插件后界面恢复默认:卸载时自动回收所有覆写 token、样式表与背景图层
- 注意:设置跟随浏览器,换浏览器或清除站点数据会丢失;壁纸以压缩后的 data URL 存储,受 localStorage 配额约束

## 工作原理

| 能力 | 机制 |
|---|---|
| 颜色 | `ctx.theme.overrideTokens()` 覆写 `--dsw-alias-*` 语义 token,浅/深模式切换自动重套,派生色按模式推导 |
| 背景图层 | 自有的固定定位图层,位于页面背景之上、内容之下,由 CSS 变量驱动 |
| 毛玻璃 | 背景图层整体模糊(`filter: blur`,背景模糊 + 毛玻璃两滑块之和),不动 `#root`,不产生 `backdrop-filter` 的包含块副作用 |
| 半透明 | 表面 token 按模式烘焙为 `rgba()`(角色色 → 深色翻转色 → 默认面色表),不依赖 `color-mix`,全浏览器可用;覆盖面含设置面板(`bg-layer-2`)、对话区任务面板/排队坞/目标栏(`specific-tip`)、行内代码与代码块(`markdown-*`)、命令/加号按钮及其 hover(`selector` / `interactive-bg-hover-solid`) |
| 强调与半透明 | 主操作按钮与强调字(`markdown-inline-code`)半透明化但保留品牌色相:按钮用主色 `α=面板不透明度`,强调字用主色低透明度(0~45%,默认 22%,与 harness 原生引用 chip 一致)——强调靠色相而非实心色块 |
| 气泡角色 | 气泡设置已移除:harness 将唯一的气泡背景渲染在用户消息上(AI 消息无气泡),气泡直接跟随主色(浓度 = 面板不透明度);主色未设置时保持默认浅蓝白 |
| 持久化 | 浏览器 localStorage(harness 的 settings 网关仅对产品命名空间开放浏览器写入),加载时按 schema 校验钳制 |

## 兼容性与限制

- 半透明直接烘焙为 `rgba()`,滑块全程平滑;毛玻璃与背景模糊合并为背景图层的一次模糊(两滑块之和),不依赖 `backdrop-filter`,开启时不会改变页面内固定定位元素的包含块,低端设备可把模糊调回 0
- 深色壁纸或深色背景色自动触发表面家族协调翻转;显式设置的文字色仍然优先
- 每个颜色角色单值双模式共用,派生色按当前模式自动推导
- 图片压缩预算 2MB、输入上限 5MB;受 localStorage 配额约束;持久化数据加载时会按 schema 校验与钳制,手改坏 localStorage 也不会产生无效样式
- 视频背景建议使用 H.264(MP4)或 VP8/VP9(WebM)编码;不支持的编码(如 HEVC)会自动降级回壁纸;更换视频会同步清理 IndexedDB 中的旧记录
- 代码的语法高亮文字色(shiki `--shiki-token-*`)是独立的语法语言配色,不随主色变化(与 IDE 惯例一致);主色为白色时强调字背景为白色半透明,在浅色表面上视觉上接近不可见,属正常物理结果
- 气泡跟随主色,没有独立的气泡颜色设置:harness 把唯一的气泡背景渲染在用户消息上,AI 消息没有气泡(渲染事实,插件无法细分);主色未设置时气泡保持默认浅蓝白

## 包结构

```
src/
├── index.ts                  # Host 半部(空 apply,零运行时依赖)
├── invariant.ts              # 运行时不变式伴生
├── appearance-settings.ts    # 设置类型与默认值
└── client/
    ├── index.ts              # apply():localStorage 持久化、插槽注册
    ├── applier.ts            # DOM 应用器(token 覆写、背景图层、毛玻璃)
    ├── tokens.ts             # 颜色角色 → token 映射、预设、半透明烘焙
    ├── color.ts / image.ts   # 色值工具 / 图片压缩
    ├── video-store.ts        # IndexedDB 视频存储(20MB 上限)
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

`@deepseek-ai/*` 依赖全部为 optional peer,运行期由宿主提供;唯一运行时依赖是 `clsx`。CI 构建与产物断言全绿。

## License

MIT
