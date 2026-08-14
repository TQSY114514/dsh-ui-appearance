# DeepSeek Harness 外观自定义插件 (dsh-ui-appearance)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) WebUI 提供个性化外观系统:主题调色盘、自定义背景图片、背景透明度/模糊、UI 面板透明度与毛玻璃效果。所有修改实时预览、持久保存,禁用插件后界面完整恢复默认。

> 零核心代码改动:完全通过 Harness 官方插件机制(`ctx.theme.overrideTokens()` 主题扩展点 + `ctx.settingsScope` 设置持久化 + `settings.general.item` 插槽)实现。

## 安装(一条命令)

```sh
dsh plugin --profile <name> add https://github.com/TQSY114514/dsh-ui-appearance.git
```

卸载:`dsh plugin --profile <name> remove @deepseek-ai/dsh-client-ui-appearance`

克隆后 `pnpm install` 会自动触发 `prepare` 构建出 `lib/`;`tests/` 依赖 harness 工作区的测试运行时,独立仓库不跑测试。

## 功能

- **预设主题**:默认 / 午夜 / 海洋 / 森林 / 玫瑰 / 单色,一键应用后可继续微调
- **主题颜色**:8 个颜色角色(主色、背景色、面板色、输入框色、文字色、边框色、用户/AI 消息气泡),支持取色器与 HEX 输入;文字选区与键盘焦点环自动跟随主色
- **背景图片**:点击上传或拖拽上传(JPG / PNG / WebP),自动压缩(最长边阶梯 1920/1280/960px、WebP/JPEG 质量阶梯、存储预算 2MB、输入上限 5MB),支持预览/更换/删除;**深色壁纸自动协调**(采样亮度 <35% 时表面抬亮、文字翻亮、按钮跟随变暗)
- **背景透明度** 0–100%:只作用于背景图层,不影响文字与控件
- **背景模糊** 0–30px:模糊背景图层,前景内容保持清晰
- **背景遮罩** 0–100%:在背景图上叠加随浅/深色模式自动配色的渐变纱帘,保证图片上的文字可读
- **界面透明度** 0–100%:侧边栏、聊天区、输入框等表面半透明
- **毛玻璃强度** 0–20px:轻量 `backdrop-filter` 毛玻璃

## 安装

### 方式 B:插件安装(推荐终端用户,无需改动仓库)

包根即插件包:自带 `cordis.patch.yml`(声明于 `dsh.bundle.patch`)与自包含独立构建(`prepare` 脚本 + `tsdown.standalone.config.ts`,不依赖 harness 仓库;`@deepseek-ai/*` peer 全部 optional,运行期由宿主提供):

```sh
dsh plugin --profile <name> add <path-or-git-url>
```

`dsh plugin add` 会把插件加入 profile 的 bundle 层叠(`dsh.profile.bundles`),浏览器插件名单与 Host 装载列表随之生效。卸载:`dsh plugin --profile <name> remove @deepseek-ai/dsh-client-ui-appearance`。**修改插件后需要重新构建 `lib/` 再重启 dsh web**(`pnpm install && pnpm prepare`)。

### 方式 A:源码安装(在 DeepSeek Harness 仓库内开发)

1. 克隆 DeepSeek Harness 仓库,把本仓库的 `src/`、`tests/`、`cordis.patch.yml` 放入其 `packages/client/ui-appearance/`,补上该包在 harness 内的 `package.json`/`tsconfig.json`/`tsdown.config.ts`(monorepo 形态)。
2. 接线三处(注意 `cordis.patch.yml` 的行必须加在 `- insert:` 列表内——放在文件顶层是"覆写已有行"语义,新插件不会被装载):

   - `packages/bundle/web-app/cordis.patch.yml` —— 在 `- insert:` 块内的 `ui-theme` 行后新增:
     ```yaml
     - id: ui-appearance
       name: '@deepseek-ai/dsh-client-ui-appearance'
     ```
   - `packages/bundle/web-app/package.json` —— dependencies 中新增:
     ```json
     "@deepseek-ai/dsh-client-ui-appearance": "workspace:^"
     ```
   - `tsconfig.client.json` —— references 中新增:
     ```json
     { "path": "./packages/client/ui-appearance" }
     ```

3. 构建并启动:
   ```sh
   pnpm install
   pnpm run build:lib:host
   pnpm --filter @deepseek-ai/dsh-client-ui-appearance run bundle
   pnpm run build:web
   pnpm dsh web
   ```

## 使用

1. 打开 WebUI → 侧栏「设置」→「通用」。
2. 「外观」(浅色/深色/跟随系统)下方即是「个性化外观」行,点击展开。
3. 点预设快速换肤 → 取色器/HEX 微调每个颜色角色 → 上传或拖入背景图片 → 拖动透明度/模糊滑块。
4. 所有修改**实时生效**,无需刷新、无需保存。

## 持久化与恢复

- 设置通过 Harness 自带用户设置机制(`ctx.settingsScope`,命名空间 `ui-appearance`)写入 Host 设置文档,重启后全部保留。
- 从 `cordis.patch.yml` 删除该行或设为 `disabled: true` 并重建,界面即恢复默认;插件卸载时也会自动回收所有覆写 token、样式表与图层。

## 工作原理

| 能力 | 机制 |
|---|---|
| 颜色 | `ctx.theme.overrideTokens()` 覆写 `--dsw-alias-*` 语义 token,浅/深色切换自动重套,派生色按模式推导 |
| 背景图层 | 自有的固定定位图层,位于页面背景之上、内容之下,由 CSS 变量驱动 `background-image` / `opacity` / `filter: blur()` |
| 背景遮罩 | 背景图层 `background-image` 栈内叠加渐变纱帘,alpha 由 `--dsw-appearance-scrim` 驱动,随 `data-ds-dark-theme` 自动换色 |
| 界面透明度 | 表面 token 覆写为 `color-mix(... transparent)` 半透明值 |
| 持久化 | `ctx.settingsScope` 命名空间 `ui-appearance` |

## 兼容性

- 半透明表面使用 `color-mix()`,需要 Chrome 111+ / Safari 16.2+ / Firefox 113+,旧浏览器自动降级为不透明表面
- 毛玻璃仅在滑块 > 0 时启用 `backdrop-filter`
- 设置背景图片后主区域自动透出壁纸;卡片、侧边栏、输入框默认不透明,调低「面板透明度」可让它们也透出
- 深色壁纸/深色背景色自动触发 surface 家族协调翻转(显式设置的文字色仍然优先)
- 每个颜色角色单值双模式共用,派生色按当前模式自动推导

## 包结构(根目录即插件包)

```
src/
├── index.ts                  # Host 半部:注册设置 schema
├── invariant.ts              # 运行时不变式伴生
├── appearance-settings.ts    # 设置命名空间 + schema + 默认值
└── client/
    ├── index.ts              # apply():scope 绑定、applier、插槽注册
    ├── applier.ts            # DOM 应用器(token 覆写 + 背景图层 + 毛玻璃)
    ├── tokens.ts             # 颜色角色 → token 映射 + 预设
    ├── color.ts / image.ts   # 色值工具 / 图片压缩
    ├── settings-store.ts     # 设置镜像 store
    ├── locales.ts            # 中英文案
    └── AppearanceCustomizerRow.tsx + .module.css   # 设置行 UI
tests/                        # 依赖 harness 工作区测试运行时,独立仓库不跑
types/client.d.ts             # 手写 client 半部类型声明(构建时复制进 lib/)
cordis.patch.yml              # bundle patch:`- insert:` ui-appearance 行
tsdown.standalone.config.ts   # 自包含构建(node ESM + client CJS closure + CSS)
lib/                          # 构建产物(index.js / invariant.js / client.js + d.ts)
```

`@deepseek-ai/*` 依赖全部为 optional peer,运行期由 DeepSeek Harness 宿主提供;唯一运行时依赖是 `clsx`。

## License

MIT
