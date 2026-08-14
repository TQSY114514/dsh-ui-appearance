# dsh-ui-appearance

**DeepSeek Harness 第一个可自由定制外观的插件** —— 8 个颜色角色随意调、背景图当壁纸、透明度/模糊/遮罩/毛玻璃随手配。不是选预设,是**改颜色**。

> 零核心代码改动:完全走官方插件机制(`ctx.theme.overrideTokens()` 主题扩展点 + `settings.general.item` 插槽),卸载即恢复默认。

<!-- 演示:把 30 秒录屏 GIF 放到 docs/demo.gif 并替换这行
![demo](docs/demo.gif)
-->

## 功能

| 能力 | 说明 |
|---|---|
| 🎨 8 角色调色盘 | 主色、背景色、面板色、输入框色、文字色、边框色、用户/AI 气泡 —— 每个都支持取色器与 HEX 输入,文字选区与键盘焦点环自动跟随主色 |
| 🖼 壁纸背景 | 点击上传或拖拽,自动压缩(阶梯缩放 + 质量阶梯,WebP 优先),预览/更换/删除 |
| 🌙 深色壁纸自动适配 | 上传时采样亮度,暗图自动抬亮表面、翻亮文字、按钮跟随变暗 —— 深色壁纸不会白字黑底 |
| 🧊 毛玻璃 | 面板不透明度 0–100% + 毛玻璃强度 0–20px,侧边栏、聊天区、卡片、按钮一起融进壁纸 |
| 🌫 背景氛围 | 背景不透明度 / 背景模糊 / 背景遮罩,三个滑块独立控制壁纸的呈现 |
| ⚡ 预设起步 | 默认 / 午夜 / 海洋 / 森林 / 玫瑰 / 单色,一键应用后继续微调,不被锁死 |

所有修改**实时生效**,无需刷新、无需保存。

## 安装(一条命令)

```sh
git clone https://github.com/TQSY114514/dsh-ui-appearance.git
dsh plugin --profile <name> add file:<克隆到的本地路径>
```

卸载:`dsh plugin --profile <name> remove @deepseek-ai/dsh-client-ui-appearance`

> 已验证端到端。`file:` 安装会把插件复制进 profile 目录树,host 半部零 `@deepseek-ai` 运行时依赖;克隆后 `pnpm install` 自动构建。改代码后重新 `pnpm install && pnpm prepare` 并重启 dsh web。

## 使用

1. 打开 WebUI → 侧栏「设置」→「通用」
2. 「外观」行下方即是「个性化外观」,点击展开
3. 点预设快速换肤 → 取色器/HEX 微调 → 拖入壁纸 → 拖滑块
4. 完事。实时生效,没有保存按钮。

## 持久化与恢复

- 设置存浏览器 localStorage(键 `dsh-ui-appearance.settings`),重启/刷新后保留,多标签页自动同步
- 移除插件后界面完整恢复默认(卸载时自动回收所有覆写 token、样式表与图层)
- 注意:设置跟随浏览器;换浏览器或清除站点数据会丢失

## 工作原理

| 能力 | 机制 |
|---|---|
| 颜色 | `ctx.theme.overrideTokens()` 覆写 `--dsw-alias-*` 语义 token,浅/深切换自动重套,派生色按模式推导 |
| 背景图层 | 自有的固定定位图层,位于页面背景之上、内容之下,CSS 变量驱动 |
| 半透明 | 表面 token 烘焙为 `rgba()`(角色色 → 深色翻转色 → 默认面色表),全浏览器可用 |
| 持久化 | 浏览器 localStorage(harness 的 settings 网关只对产品命名空间开放浏览器写入) |

## 与生态内其他外观项目

| 项目 | 形态 | 外观能力 |
|---|---|---|
| **dsh-ui-appearance(本插件)** | 纯插件 | 任意颜色 + 壁纸 + 透明度/模糊/遮罩/毛玻璃,完全自由 |
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | 插件集合 | 皮肤中心提供 9 款预设皮肤,不可自由调色 |
| [Deepseek-Harness-Desktop](https://github.com/ChisaAlter/Deepseek-Harness-Desktop) | Electron 桌面壳 | 浅/深两套色 + 毛玻璃 + 透明度(壳层有限调节) |
| [dskin](https://github.com/dancingmemory/dskin) 等 | 装饰皮肤 | 像素宠物皮肤,非外观系统 |

**定位:别人换皮肤,你改颜色。**

## 兼容性与限制

- 半透明直接烘焙 `rgba()`,不依赖 `color-mix`,全浏览器可用、滑块全程平滑
- 毛玻璃仅在滑块 > 0 时启用 `backdrop-filter`(低端设备可调回 0)
- 深色壁纸/深色背景色自动触发表面家族协调翻转(显式设置的文字色仍然优先)
- 每个颜色角色单值双模式共用,派生色按当前模式自动推导
- 图片压缩预算 2MB / 输入上限 5MB,受 localStorage 配额约束

## 包结构

```
src/
├── index.ts                  # Host 半部(空 apply,零运行时依赖)
├── invariant.ts              # 运行时不变式伴生
├── appearance-settings.ts    # 设置类型 + 默认值
└── client/
    ├── index.ts              # apply():localStorage 持久化 + 插槽注册
    ├── applier.ts            # DOM 应用器(token 覆写 + 背景图层 + 毛玻璃)
    ├── tokens.ts             # 颜色角色 → token 映射 + 预设 + 半透明烘焙
    ├── color.ts / image.ts   # 色值工具 / 图片压缩
    ├── settings-store.ts     # 设置镜像 store
    ├── locales.ts            # 中英文案
    └── AppearanceCustomizerRow.tsx + .module.css   # 设置行 UI
tests/                        # 69 个测试(依赖 harness 工作区运行时)
types/client.d.ts             # 手写 client 半部类型声明
cordis.patch.yml              # bundle patch
tsdown.standalone.config.ts   # 自包含构建
lib/                          # 构建产物
```

`@deepseek-ai/*` 全部为 optional peer,运行期由宿主提供;唯一运行时依赖是 `clsx`。CI 构建 + 产物断言全绿。

## License

MIT
