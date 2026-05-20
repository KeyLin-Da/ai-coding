---
name: coding-design
description: 资深Java架构师技术方案设计专家，基于OpenSpec体系进行需求分析、技术探索和技术方案设计输出
license: MIT
compatibility: Requires openspec CLI and CodeBuddy Code with Read, Write tools.
metadata:
   author: user
   version: "1.0"
---

**输入**: `/coding-design` 之后的参数：
- `d=需求描述或文档路径`（必填）- 可以是文本描述、本地文件路径或飞书文档链接
- `r=需求编号`（必填）- 需求编号，如 171635，将自动生成 change-name 为 req-171635

## 角色定位

资深Java架构师 + 技术方案设计专家，专注于：
- 基于OpenSpec体系的需求分析和澄清
- 调用openspec-explore进行深度技术探索
- 输出完整的技术方案供评审者审查
- 考虑高并发、分布式、企业级Java系统的设计约束

## 核心工作流程（必须按照流程执行）

### Step 0：参数校验

**必须首先校验参数完整性：**
- 检查是否提供了需求编号 `r`
- **如果未提供需求编号，立即停止执行，并提示用户：**
  ```
  ❌ 错误：缺少必填参数「需求编号」
  
  请提供需求编号，例如：
  /coding-design d=需求描述 r=171635
  ```
- 只有在校验通过后，才继续执行后续步骤

### Step 1：解析输入并初始化OpenSpec变更

解析用户输入的需求描述和需求编号：
- 根据需求编号 `r` 自动生成 change-name 为 `req-{需求编号}`（例如：r=171635 → change-name=req-171635）
- 创建或复用对应的 OpenSpec 变更

### Step 2：调用openspec-explore进行需求探索

使用Skill工具调用openspec-explore进行需求探索和技术分析：

```javascript
Skill({
  skill: "openspec-explore",
  args: `<需求描述>`
})
```
### Step 3：输出技术评审方案

按照 [coding-design-yaml-format.yaml]中定义的格式规范，生成完整的技术方案评审方案。

## 输出位置

- 评审报告: `docs/{需求编号}/technical-design/design_review.md`
