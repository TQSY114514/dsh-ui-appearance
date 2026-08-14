# @deepseek-ai/dsh-client-ui-appearance

个性化外观插件(Appearance Customizer)——为 DeepSeek Harness WebUI 增加一个简单直观的个性化外观系统:主题调色盘、自定义背景图片、背景透明度/模糊、UI 面板透明度与毛玻璃效果。所有设置实时预览并持久保存,插件禁用后界面完整恢复默认。

## 功能

- **预设主题**:默认 / 午夜 / 海洋 / 森林 / 玫瑰 / 单色,点击立即应用,之后仍可自由微调
- **主题颜色**:8 个颜色角色,支持系统取色器与 HEX 输入,一键恢复默认;文字选区与键盘焦点环自动跟随主色
  - 主色、背景色、面板色、输入框色、文字色、边框色、用户消息气泡、AI 消息气泡
- **背景图片**:点击上传或拖拽上传(JPG / PNG / WebP 等),带预览、更换、删除;自动压缩(最长边阶梯 1920/1280/960px,WebP/JPEG 质量阶梯,存储预算 2MB,输入上限 5MB);上传时自动采样亮度,深色壁纸自动协调表面/文字/按钮对比度
- **背景透明度**:0–100% 滑块,只影响背景图片层,不影响文字与控件
- **背景模糊**:0–30px 滑块,模糊背景图层,前景内容始终清晰
- **背景遮罩**:0–100% 滑块,在背景图上叠加一层随浅/深色模式自动配色的渐变纱帘,保证图片上的文字可读
- **界面透明度**:0–100% 滑块,让侧边栏、聊天区、输入框等表面半透明
- **毛玻璃强度**:0–20px 滑块,对主要表面施加轻量 `backdrop-filter` 毛玻璃

## 工作原理

不修改任何 Harness 核心代码,完全走官方插件机制:

1. **颜色**:通过 `ctx.theme.overrideTokens()` 把用户颜色映射到 `--dsw-alias-*` 语义 token(品牌色、背景、层级表面、文字、边框、气泡等)。这是主题系统为第三方定制提供的官方扩展点;浅色/深色切换时由 `ThemePresenter` 自动重新套用,派生色(次要文字、层级表面)按当前模式自动推导,保证两种模式下都可读。文字选区与键盘焦点环通过覆写后的品牌 token 自动跟随主色。
2. **背景图层**:插件自有的固定定位图层(`#dsw-appearance-bg`),位于页面背景之上、内容之下(`#root` 提升为 `z-index:1`),`background-image` / `opacity` / `filter: blur()` 全部由 CSS 变量驱动,实时生效。
3. **背景遮罩**:叠加在背景图层自身 `background-image` 栈内的渐变纱帘,alpha 由 `--dsw-appearance-scrim` 变量驱动,随滑块实时重绘;纱帘色随 `data-ds-dark-theme` 自动切换(浅色模式白纱、深色模式近黑纱)。
4. **界面透明度**:把表面 token 覆写为 `color-mix(... transparent)` 半透明值,不透明时保持原值(老浏览器无 `color-mix` 时自动降级为不透明界面)。
5. **持久化**:通过 Harness 自带的用户设置机制(`ctx.settingsScope`,命名空间 `ui-appearance`),写入 Host 用户设置文档,重启后仍然存在。

## 安装

### 方式 A:源码安装(harness 仓库内,本插件已按此配置好)

1. `packages/client/ui-appearance/` — 插件包本体
2. `packages/bundle/web-app/cordis.patch.yml` — 浏览器插件名单新增 `ui-appearance` 行(注意必须加在 **`- insert:` 列表内**——顶层行是"覆写已有行"语义,新插件不会被装载)
3. `packages/bundle/web-app/package.json` — 新增依赖 `@deepseek-ai/dsh-client-ui-appearance`
4. `tsconfig.client.json` / `tsconfig.base.json` — 类型检查聚合与源码解析映射

之后安装依赖并重新构建:

```sh
pnpm install
pnpm run build:lib:host        # 生成 Typert 契约产物(首次构建需要)
pnpm --filter @deepseek-ai/dsh-client-ui-appearance run bundle   # 构建本插件 client 包
pnpm run build:web             # 重建前端 dist
pnpm dsh web                   # 启动 WebUI
```

### 方式 B:插件安装(独立仓库分发,终端用户无需改动 harness)

独立仓库的包内自带 `cordis.patch.yml`(声明于 `dsh.bundle.patch`)与自包含构建(`prepare` 脚本 + `tsdown.standalone.config.ts`,不依赖 harness 仓库):

```sh
dsh plugin --profile <name> add <path-or-git-url>
```

`dsh plugin add` 执行 `prepare` 构建出 `lib/`,并自动把 `ui-appearance` 行插入浏览器插件名单与 Host 装载列表;卸载用 `dsh plugin remove ui-appearance`。

## 使用

1. 打开 WebUI,点击左下角侧栏的「设置」。
2. 在「通用」设置里,「外观」行(浅色/深色/跟随系统)下方即是「个性化外观」行。
3. 点击该行展开:
   - 点一个**预设**快速换肤;
   - 在**主题颜色**里点取色器或输入 HEX 微调每个角色;
   - 在**背景**里上传图片,拖图片到该区域也可以;拖动「背景图片透明度」「背景模糊」滑块;
   - 在**界面**里调「面板透明度」「毛玻璃强度」;
   - 「恢复默认」一键还原全部设置。
4. 所有修改实时生效,无需刷新页面,也无需点保存。

## 数据持久化

设置保存在 Harness 的用户设置文档(`ctx.settingsScope`,命名空间 `ui-appearance`,字段与 `AppearanceSettingsSchema` 一致),由 Host 端写入磁盘。重新打开 Harness 后主题颜色、背景图片(压缩后的 data URL)、透明度、模糊度全部保留。

## 禁用与恢复

- 从 `packages/bundle/web-app/cordis.patch.yml` 删除 `ui-appearance` 行,或在 profile 补丁中对该行设置 `disabled: true`,重新构建后界面即恢复默认。
- 插件运行期自身也会清理:所有覆写 token、样式表、背景图层、body 上的 CSS 变量都在插件卸载时一并回收(`AppearanceApplier.dispose`),不影响原浅色/深色主题与其他功能。

## 兼容性说明

- `color-mix()` 需要 Chrome 111+ / Safari 16.2+ / Firefox 113+;旧浏览器中「面板透明度」<100% 时表面保持不透明(其余功能正常)。
- `backdrop-filter` 在「毛玻璃强度」为 0 时完全关闭,避免无谓的渲染开销;开启后若在低端设备感到卡顿,调回 0 即可。
- 设置背景图片后,主区域(对话画布)会自动变为透明以透出壁纸;卡片、侧边栏、输入框默认保持不透明,调低「面板透明度」可让它们也透出(界面区有提示文案)。
- 深色壁纸或深色背景色会自动触发「surface 家族协调翻转」(表面抬亮、文字翻亮、按钮跟随变暗);此时显式设置的文字色仍然优先。
- 上传图片会被压缩(最长边阶梯 + 质量阶梯,WebP 优先)后以 data URL 存入设置文档;原图不会被保留,超过 5MB 的输入会被拒绝。

## Model Experience

None, as this plugin changes only the browser presentation (CSS tokens, a background layer, and surface translucency) and nothing here reaches a model request, a session event, or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **单色值与双模式**:每个颜色角色只存一个 HEX,浅色/深色模式共用;派生色(次要文字、层级表面)按当前模式自动推导,保证可读,但无法分别为两种模式指定不同的主色。
- **背景图片透出依赖表面透明度**:界面默认不透明,需将「面板透明度」调低背景图片才会透出;界面区有对应提示。
- **`color-mix()` 依赖**:「面板透明度」<100% 时表面半透明使用 `color-mix()`,需要 Chrome 111+ / Safari 16.2+ / Firefox 113+;旧浏览器自动降级为不透明表面,其余功能正常。
