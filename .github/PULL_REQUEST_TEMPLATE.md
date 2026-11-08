<!--
提交 PR 前，请确认您已阅读并理解 [参与贡献指南 (CONTRIBUTING.md)](./CONTRIBUTING.md) 与 [项目宪法 (AGENTS.md)](./AGENTS.md)。
违反规范或未经验证的 AI 生成代码（AI Slop）可能会被延后处理或直接关闭。请勿随意删除此模板章节。
-->

## 变更描述 / Summary

<!-- 请亲自用简洁清晰的语言说明：这个 PR 做了什么工作？解决了什么问题或新增了什么能力？为什么这样设计？ -->

## 关联 Issue / Related Issues

<!-- 例如：Closes #42 · Part of #38 · 如无关联 Issue 可填 N/A -->

## 变更类型 / PR Type

- [ ] Bug 修复 (`fix`)
- [ ] 新功能 (`feat`)
- [ ] 重构优化 (`refactor`)
- [ ] 文档与多语言 (`docs`)
- [ ] 测试与构建 (`test` / `chore`)

## AI 辅助开发声明 / AI-Assisted Development

<!-- 本次 PR 是否使用了 AI 编程工具辅助？请如实勾选并填写具体模型名称 -->

- [ ] 未使用 AI 辅助（No AI was used）
- [ ] 使用了 AI 辅助部分开发，但我已逐行检查、完全理解并本地验证了所有改动
- [ ] 主要由 AI 生成实现，但我完全掌握每一处代码逻辑、CSS 特异性与边界状态（`0%` / `100%` / 深浅色切换），非盲目提交

AI 辅助工具与模型（Tool & Exact Model）: <!-- 如使用了 AI，请填写具体工具与模型名称，如 Claude 4.6 Opus / GPT-5.4 / Gemini 3.1 Pro；未使用请填 无 -->

## 本地验证输出 / Validation Evidence

<!--
必须贴实际命令与输出，不接受只勾选（见 CONTRIBUTING 第 3 节第 7 条）。
请粘贴 `pnpm typecheck`（零错误）、`pnpm prepare`（零警告）与 `pnpm test`（全绿，含 passed 计数）的结尾输出；
涉及 UI 视觉/交互变更，请再附深色 / 浅色 / 半透明状态截图。
没有可复现证据的 PR 会被要求补充后再审。
-->

```text
（在此粘贴 pnpm typecheck / pnpm prepare / pnpm test 的实际结尾输出）
```

## 提交前自检 / Pre-submission Checklist

- [ ] 我已阅读并遵守 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 与 [`AGENTS.md`](./AGENTS.md) 中的工程红线（零核心改动、卸载可逆、不手改 `lib/`）
- [ ] 单一职责：本 PR 仅聚焦解决一件事，未夹带无关重构或无意义格式变更
- [ ] 边界状态已验证：已检查浅色模式、深色模式、`0%` 全透明、`100%` 不透明及毛玻璃下的视觉与交互表现（无 `hover snapped opaque` 或白底黑字反转崩溃）
- [ ] 已在上方「本地验证输出」贴出 `pnpm typecheck` 的实际输出（零错误）
- [ ] 已在上方「本地验证输出」贴出 `pnpm prepare` 的实际输出（零警告）
- [ ] 已在上方「本地验证输出」贴出 `pnpm test` 的实际输出（全绿，含 passed 计数）
- [ ] 中英文文案（`src/client/locales.ts`）与文档（`README.md` / `README.en.md`）已同步更新（若涉及界面或功能变更）

## 补充说明或截图 / Screenshots & Notes

<!-- 如涉及 UI 视觉或交互变更，请附上深/浅色模式或半透明状态下的预览截图 -->
