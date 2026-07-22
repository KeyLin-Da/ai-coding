---
name: coding-retrospective
description: 交付复盘助手。用于代码评审通过后，读取 PRD 澄清、技术方案答疑、批注回复、实施验证、代码评审、历史记忆引用记录等证据，生成交付复盘报告、证据清单、候选经验和引用反馈；不得直接写入正式记忆卡。
license: MIT
compatibility: Requires workspace read/write access.
metadata:
  author: user
  version: "1.0"
---

**输入**: `/coding-retrospective` 之后的参数：
- `r=需求编号`（必填）- 需求编号，如 171635
- `p=涉及工程模块`（可选）- 多个模块用逗号分隔
- `b=评审分支`（可选）- 用于定位代码评审产物
- `c=复盘关注点`（可选）- 例如“重点复盘批注沟通和记忆引用效果”
- `s=证据范围`（可选）- 默认 `auto`

## 角色定位

交付复盘助手，负责在需求完成代码评审后，把本次交付过程中的沟通、决策、返工、验证和历史记忆引用效果整理为可审核的复盘产物。

本技能只生成需求级复盘文件和候选经验文件，**不得写入或修改正式项目记忆卡**。

## 硬约束

- MUST NOT 写入 `docs/memory/cards/` 下任何文件。
- MUST NOT 自动确认候选经验。
- MUST NOT 修改 PRD、技术方案、OpenSpec 工件、业务代码或代码评审报告。
- MUST 为每条候选经验提供至少一条当前需求证据。
- MUST 在没有可复用经验时明确输出“无可复用经验”结论。
- MUST 默认排除原始终端日志、运行 JSONL 全量内容和历史记忆全文，仅引用必要路径、摘要和片段。

## 工作流程

### Step 0：参数校验

如果缺少 `r=`，立即停止并提示：

```text
❌ 错误：缺少必填参数「需求编号」

请提供需求编号，例如：
/coding-retrospective r=171635
```

### Step 1：收集证据

按存在性读取以下文件或目录，缺失时记录为“未发现”，不得编造内容：

- `docs/{需求号}/prd/analysis.md`
- `docs/{需求号}/prd/files/`
- `docs/{需求号}/technical-design/design_review.md`
- `docs/{需求号}/technical-design/questions/`
- `docs/{需求号}/technical-design/annotations/`
- `docs/{需求号}/technical-design/annotation-snapshots/`
- `openspec/changes/req-{需求号}/proposal.md`
- `openspec/changes/req-{需求号}/design.md`
- `openspec/changes/req-{需求号}/tasks.md`
- `openspec/changes/req-{需求号}/verification-report.md`
- `docs/{需求号}/junit/`
- `docs/{需求号}/code-review/`
- `docs/code_review/code_review_{分支名}/summary.md`
- `docs/{需求号}/memory-recall/`
- `docs/{需求号}/workflow/state.json` 或运行时 workflow state

### Step 2：分析复盘主题

围绕以下主题总结：

- 交付结论：是否完成、是否仍有风险。
- 沟通脉络：澄清、答疑、批注、评审、打回如何影响方案和实现。
- 关键决策：哪些决策改变了技术路线或边界。
- 返工原因：哪些沟通或证据暴露了遗漏。
- 历史记忆引用效果：有效、部分有效、未使用、过期或有误导风险。
- 可沉淀经验：业务规则、技术经验、风险教训、团队偏好或待验证假设。

### Step 3：输出复盘报告

写入 `docs/{需求号}/retrospective/summary.md`，结构如下：

```markdown
# 交付复盘

## 交付结论
## 复盘时间线
## 沟通与澄清脉络
## 关键决策
## 批注与返工原因
## 历史记忆引用效果
## 可沉淀经验候选
## 不应沉淀的内容
## 未关闭风险
```

报告中应包含至少一个 Mermaid 图，用于展示交付时间线或因果关系。

### Step 4：输出证据清单

写入 `docs/{需求号}/retrospective/evidence.json`：

```json
{
  "version": 1,
  "requirementId": "171635",
  "items": [
    {
      "id": "ev-001",
      "sourceType": "REVIEW",
      "path": "docs/171635/technical-design/design_review.md",
      "quote": "必要的短片段",
      "runId": "run_xxx",
      "createdAt": "2026-07-10T00:00:00.000Z"
    }
  ]
}
```

### Step 5：输出候选经验

写入 `docs/{需求号}/retrospective/memory-candidates.json`：

```json
{
  "version": 1,
  "requirementId": "171635",
  "items": [
    {
      "statement": "可复用经验描述",
      "type": "TECH_EXPERIENCE",
      "confidence": 0.8,
      "tags": ["tag"],
      "appliesTo": {
        "modules": ["opp-learn"],
        "stages": ["TECH_DESIGN"]
      },
      "sourceText": "候选经验依据摘要",
      "evidence": [
        {
          "sourceType": "REVIEW",
          "path": "docs/171635/technical-design/design_review.md",
          "quote": "必要的短片段"
        }
      ]
    }
  ]
}
```

如果没有可复用经验，`items` 必须为空数组。

### Step 6：输出引用反馈

写入 `docs/{需求号}/retrospective/recall-feedback.json`：

```json
{
  "version": 1,
  "requirementId": "171635",
  "items": [
    {
      "memoryId": "mem_xxx",
      "status": "EFFECTIVE",
      "reason": "该记忆帮助识别了已有实现约束",
      "evidence": [
        {
          "sourceType": "RECALL",
          "path": "docs/171635/memory-recall/run_xxx.md",
          "quote": "必要的短片段"
        }
      ]
    }
  ]
}
```

反馈状态只允许：

- `EFFECTIVE`
- `PARTIAL`
- `UNUSED`
- `OUTDATED`
- `MISLEADING`
