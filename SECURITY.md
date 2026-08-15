# 安全策略

## 报告漏洞

请通过 **GitHub 私有漏洞披露(Security Advisory)** 报告,不要公开发 issue:

仓库主页 → Security → **Report a vulnerability**

或直接访问:https://github.com/TQSY114514/dsh-ui-appearance/security/advisories/new

## 响应承诺

- 1 个工作日内确认收到报告
- 7 天内给出影响评估与修复时间表

## 范围

以下问题属于本仓库的安全范围:

- 插件代码自身:颜色覆写、图片处理与压缩、localStorage 持久化、DOM/样式注入
- 插件与宿主(DeepSeek Harness)交互边界上的问题

**不在范围内**:宿主本身的问题,请向 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 报告;第三方依赖的已知漏洞,请通过 Dependabot 告警跟踪。

## 处理流程

1. 确认漏洞、评估影响范围
2. 编写修复与回归测试
3. 发布修复版本,并在 Security Advisory 中披露
4. 涉及敏感信息(密钥、用户数据)的问题优先修复后公开

## 提示

本插件将设置保存在浏览器 localStorage,不涉及服务端数据;报告问题时可附上复现步骤与浏览器版本,便于定位。
