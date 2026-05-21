# AI 需求交付控制台

本工具是面向本地工作区的 OpenSpec + 自定义技能可视化交付台，用于按需求号聚合 PRD、技术方案、OpenSpec 实施验证、单元测试报告和代码评审报告。

## 启动

```bash
cd tools/ai-delivery-console
npm install
npm run server:dev
npm run dev
```

默认 Runner 地址为 `http://127.0.0.1:8718`，前端开发服务为 `http://127.0.0.1:5178`。如果需要指定工作区根目录：

```bash
AI_DELIVERY_WORKSPACE_ROOT=/Users/key.lin/work/Projects/ai-coding npm run server:dev
```

## 产物约定

- PRD：`docs/{需求号}/prd/analysis.md`
- 技术方案：`docs/{需求号}/technical-design/design_review.md`
- OpenSpec：`openspec/changes/req-{需求号}`
- 单元测试报告：`docs/{需求号}/junit/**`
- 代码评审：`docs/code_review/code_review_{分支名}/summary.md`
- 工作流元数据：`docs/{需求号}/workflow/state.json`
- 运行日志：`docs/{需求号}/workflow/runs/{runId}.jsonl`

PRD 阶段的“澄清描述”会保存到 workflow 的 `prdClarification` 字段，并在调用 `coding-prd-analyzer` 时作为 `/coding-prd-analyzer` 的 `c` 参数传递；未填写时不会使用需求标题兜底。

## Agent Provider

`coding-prd-analyzer`、`coding-design`、`coding-junit`、`coding-review` 不是普通 CLI。Runner 支持选择 Agent Provider 执行技能，默认包含：

- `manual`：只生成标准调用文本。
- `codex`：使用 `CODEX_COMMAND` 配置的 Codex CLI 命令执行 Prompt Envelope。

默认 Codex 命令：

```bash
CODEX_COMMAND='codex exec -C {workspaceRoot} -'
```

如需注册其它 Agent，可通过 `AGENT_PROVIDERS_JSON` 或 `AGENT_PROVIDERS_PATH` 提供本地 JSON 配置：

```json
[
  {
    "id": "custom-agent",
    "name": "Custom Agent",
    "inputMode": "PROMPT_FILE",
    "command": ["custom-agent", "run", "--file", "{promptFile}"],
    "available": true,
    "supportsStreaming": true
  }
]
```

Runner 会把技能动作包装成 `docs/{需求号}/workflow/prompts/{runId}.md`，并将 stdout/stderr 写入 `docs/{需求号}/workflow/runs/{runId}.jsonl`，页面通过 SSE 实时展示终端输出。

如果用户选择手动模式，或 Agent Provider 不可用，运行状态会变为 `WAITING_FOR_AGENT`，并展示标准调用文本，例如：

```text
/coding-design d=docs/172014/prd/analysis.md r=172014
```

用户可以复制该文本交给 Agent 执行；执行完成后在页面点击“刷新产物”重新索引文件。

## 安全边界

- Runner 只允许读写当前工作区内的文件路径。
- OpenSpec 命令使用参数数组执行，不使用 shell 字符串拼接。
- Agent Provider 只能来自本地显式配置，页面不能直接传入任意命令。
- 修改型动作使用需求级锁文件，避免同一需求并发写入。
- Markdown 保存会比较文件 hash，发现外部修改时阻止覆盖。
