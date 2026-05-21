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

## Agent Bridge 降级

`coding-prd-analyzer`、`coding-design`、`coding-junit`、`coding-review` 不是普通 CLI。当前 Runner 如果没有可用 Agent Bridge，会把运行状态设置为 `WAITING_FOR_AGENT`，并展示标准调用文本，例如：

```text
/coding-design d=docs/172014/prd/analysis.md r=172014
```

用户可以复制该文本交给 Agent 执行；执行完成后在页面点击“刷新产物”重新索引文件。

## 安全边界

- Runner 只允许读写当前工作区内的文件路径。
- OpenSpec 命令使用参数数组执行，不使用 shell 字符串拼接。
- 修改型动作使用需求级锁文件，避免同一需求并发写入。
- Markdown 保存会比较文件 hash，发现外部修改时阻止覆盖。
