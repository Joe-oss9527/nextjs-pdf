# CLAUDE.md

> Project-specific memory for Claude Code.  
> This file should behave like a “soft link” to `AGENTS.md`: all规范性信息（项目结构、命令、配置、编码规范等）只在 `AGENTS.md` 维护，这里只做引用和少量补充说明。

---

## 单一事实来源（SSOT）

- **唯一权威文档：** `AGENTS.md` 是本仓库的单一事实来源，描述了：
  - 项目概览与目录结构
  - 依赖注入与服务架构（stateManager / metadataService 等）
  - 快速开始命令、测试与 lint 要求（含 516+ 测试约束）
  - 配置字段与 Joi 验证流程（含 stripUnknown: true 的注意事项）
  - 安全 / 性能 / Git 工作流 等规范
- **当 `AGENTS.md` 与本文件有出入时，一律以 `AGENTS.md` 为准。**
- 更新项目规范或命令时，只改 `AGENTS.md`；本文件只在需要时补充高层提示或链接。

推荐在 Claude Code 中把 `AGENTS.md` 设为首选阅读入口，然后再根据需要查看本文件。

---

## Claude Code 如何使用记忆

遵循 Claude Code 官方 memory 文档（https://code.claude.com/docs/en/memory），结合本仓库约定：

- **不要在记忆里复制整份 `AGENTS.md` 内容。**
  - 只存“怎么使用 `AGENTS.md`”和少量长期稳定的注意事项。
- **遇到开发任务时：**
  - 打开并阅读 `AGENTS.md`，获取：项目结构、命令、配置规则、测试和 Git 规范。
  - 按 `AGENTS.md` 中的工作流执行（如 make 命令、config 验证顺序等）。
- **遇到调试/排错：**
  - 优先查 `AGENTS.md` 的相关章节：
    - 配置问题 → “Configuration / Configuration Validation Workflow”
    - 测试/覆盖率 → “Testing Guidelines”
    - PDF 生成/Kindle 流程 → “Common Workflows”
  - 如需在 Claude 记忆中记录额外信息，只记录“查找路径”和“关键关键词”，不要重复粘贴长日志或实现细节。

---

## 面向 Claude 的关键索引（来自 AGENTS.md）

在对话中需要快速定位信息时，可以按以下索引直接打开 `AGENTS.md` 中的对应部分：

- **项目概览与架构：**
  - `AGENTS.md` → “Project Overview”  
  - `AGENTS.md` → “Project Structure & Architecture” / “Service Architecture”  
- **命令与工作流：**
  - `AGENTS.md` → “Quick Start”  
  - `AGENTS.md` → “Build, Test, and Development Commands”  
  - `AGENTS.md` → “Common Workflows”（新增文档目标 / 新配置项 / Scraping 流程 / Kindle PDF 等）  
- **配置与验证：**
  - `AGENTS.md` → “Configuration”  
  - `AGENTS.md` → “Configuration Validation Workflow”  
    - 记忆要点：字段必须先加到 `src/config/configValidator.js` 的 Joi schema，再加到对应配置文件（`config.json` / `doc-targets/*.json` / `config-profiles/*.json`），否则会被 `stripUnknown: true` 悄悄丢弃。  
- **测试与质量：**
  - `AGENTS.md` → “Testing Guidelines” / “Testing Requirements”  
    - 记忆要点：保持 516+ 通过；新公开函数要有测试；提交前 `make test && make lint`。  
- **安全 / 性能 / Git：**
  - `AGENTS.md` → “Security & Best Practices”  
  - `AGENTS.md` → “Git Workflow”  
    - 记忆要点：使用 `validateSafePath()` 做文件安全；使用 Conventional Commits；不要提交 PDF / logs / venv。  

---

## 可存入记忆的长期“坑点”摘要（不复述细节）

仅记录触发“去看哪里”的关键词，具体操作细节都在 `AGENTS.md` 或源码中：

- **配置字段失效 / 运行时为 undefined**
  - 关键词：`configValidator.js`、Joi schema、`stripUnknown: true`。  
  - 动作：打开 `AGENTS.md` 的 “Configuration Validation Workflow”，再看 `src/config/configValidator.js`。  
- **stateManager 和 metadataService 冲突导致 TOC / articleTitles 异常**
  - 关键词：Single Source of Truth、`articleTitles.json`、`stateManager` vs `metadataService`。  
  - 动作：查看 `AGENTS.md` 的 “Service Architecture / Single Source of Truth Principle”，确认只在 metadataService 中维护内容元数据。  
- **深色主题 PDF / 浮动 UI 元素打印进 PDF**
  - 关键词：PDF 样式处理、去掉导航/侧边栏/浮动输入框。  
  - 动作：查看 `AGENTS.md` 关于 PDF 生成和 Kindle 工作流，再按其中提示检查相关服务（如 pdf 样式处理和 selectors）。  

这些提示足够唤起“去找 AGENTS + 源码”的路径，而不会在记忆中复制整段实现或逐行说明。

---

## 维护约定

- 新增或修改规范、命令、配置字段、测试要求时：**只改 `AGENTS.md`**。  
- 如需在本文件补充内容：
  - 只写“面向 Claude 的索引 / 心智模型 / 记忆策略”；
  - 避免复制 `AGENTS.md` 的完整段落或具体行号；
  - 如有潜在冲突，一律以 `AGENTS.md` 为准，并优先更新 `AGENTS.md`。  

这样可以最大程度保证：规范集中在一处维护，`CLAUDE.md` 只是“软链接 + Claude 使用说明”，避免信息漂移。
