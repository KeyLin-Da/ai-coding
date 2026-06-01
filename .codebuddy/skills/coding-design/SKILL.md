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
- `p=涉及工程模块`（可选）- 指定涉及的工程模块名称，多个模块用逗号分隔，如 opp-user,opp-material。用于精准定位相关代码
- `c=评审意见或补充说明`（可选）- 用于二次评审时提供评审意见、修改建议或补充说明

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

**解析涉及工程模块（如果提供了 p= 参数）：**
- 如果提供了 `p=` 参数，解析出涉及的工程模块列表
- 这些模块将作为代码搜索的优先范围，提高代码查找效率
- 支持的模块包括：opp-user、opp-material、opp-task、opp-learn、opp-admin-bff、opp-openapi、opp-gateway 等
- 示例：`p=opp-user,opp-material` 表示需求涉及用户服务和素材服务两个模块

**二次评审模式检测：**
- 如果提供了 `c=` 参数，则进入二次评审模式
- 二次评审模式下，需要读取已有的技术方案文档 `docs/{需求编号}/technical-design/design_review.md`
- 结合原有方案和新的评审意见进行修订和完善

### Step 1：解析输入

解析用户输入的需求描述和需求编号：
- 根据需求编号 `r` 自动生成 change-name 为 `req-{需求编号}`（例如：r=171635 → change-name=req-171635）
- **注意**：本技能不执行任何 OpenSpec 变更的创建或初始化操作，仅记录需求编号用于后续输出路径

**判断工作模式：**
- **首次设计模式**：未提供 `c=` 参数，从头开始进行技术方案设计
- **二次评审模式**：提供了 `c=` 参数，基于已有方案进行修订和完善

### Step 2：技术探索和分析

#### 2.1 二次评审模式（如果提供了 c= 参数）

**读取已有技术方案：**
```javascript
read_file({
  file_path: `docs/${需求编号}/technical-design/design_review.md`
})
```

**分析评审意见：**
- 理解用户提供的评审意见 `c=` 参数内容
- 识别需要修改的章节和具体问题点
- 确定修改范围和影响面

**针对性补充探索：**
- 如果评审意见涉及数据库设计，使用 `coding-database-query` 验证表结构
- 如果评审意见涉及接口变更，重新调用 `openspec-explore` 聚焦相关问题
- 如果评审意见涉及性能问题，使用 `coding-junit` 设计性能对比测试

#### 2.2 首次设计模式（未提供 c= 参数）

**代码探索策略：**

**如果提供了 `p=` 参数（涉及工程模块）：**
- 优先在指定的工程模块中进行代码搜索和分析
- 使用 `search_codebase` 工具时，通过 `target_directories` 参数限定搜索范围
- 示例：
  ```javascript
  search_codebase({
    query: "用户认证相关逻辑",
    key_words: "authentication,login,token",
    target_directories: ["/Users/key.lin/work/Projects/ai-coding/opp-user", "/Users/key.lin/work/Projects/ai-coding/opp-admin-bff"]
  })
  ```

**如果未提供 `p=` 参数：**
- 在整个工作区范围内进行代码搜索
- 根据需求描述自动识别可能涉及的模块

**调用 openspec-explore 进行需求探索：**

```javascript
Skill({
  skill: "openspec-explore",
  args: `<需求描述>`
})
```

### Step 2.5：数据库表结构查询（可选）

**如果技术方案设计需要了解现有数据库表结构、字段信息或数据分布情况，可以使用 `coding-database-query` 技能进行查询：**

#### 适用场景
- 需要了解现有表的字段结构和数据类型
- 需要查看索引配置和表关系
- 需要分析数据分布和统计信息
- 需要验证某些业务假设（如数据量级、字段取值范围等）

#### 使用方式

**方式一：使用 YAML 配置文件（推荐）**

```javascript
Skill({
  skill: "coding-database-query",
  args: `--config datasources.yaml --datasource opp_user --query "DESCRIBE user_info"`
})
```

**方式二：直接指定连接参数**

```javascript
Skill({
  skill: "coding-database-query",
  args: `--db-type mysql --url "jdbc:mysql://localhost:3306/opp_user" --username readonly --password xxx --query "SHOW CREATE TABLE user_info"`
})
```

#### 常用查询示例

**查看表结构：**
```sql
DESCRIBE table_name;
SHOW COLUMNS FROM table_name;
```

**查看建表语句（包含索引）：**
```sql
SHOW CREATE TABLE table_name;
```

**查看表索引：**
```sql
SHOW INDEX FROM table_name;
```

**统计数据量：**
```sql
SELECT COUNT(*) as total_rows FROM table_name;
```

**查看最近数据样本：**
```sql
SELECT * FROM table_name ORDER BY create_time DESC LIMIT 10;
```

**查看字段值分布：**
```sql
SELECT status, COUNT(*) as count 
FROM table_name 
GROUP BY status 
ORDER BY count DESC;
```

#### 注意事项
- ⚠️ **只读操作**：`coding-database-query` 技能仅支持 SELECT、DESCRIBE、SHOW 等只读查询，禁止任何数据修改操作
- 🔒 **使用只读账号**：建议使用具有最小权限的只读账号进行查询
- 📋 **配置管理**：推荐使用 `datasources.yaml` 配置文件管理数据源，避免在命令行中暴露敏感信息
- ⏱️ **性能考虑**：对于大表查询，务必添加 LIMIT 限制返回行数

### Step 2.6：数据库设计规范参考（可选）

**如果技术方案需要进行数据库设计或评审现有设计，可以参考公司数据库设计规范：**

#### 规范文档位置
- 飞书文档：[MYSQL数据库设计规范](https://infinitus.feishu.cn/wiki/YwxMw2QDtinz2xkeLGicBNmYnvf)

#### 使用方式

通过 `lark-doc` 技能读取规范文档：

```javascript
// 第一步：查询 wiki 节点获取真实 token
Skill({
  skill: "lark-doc",
  args: `wiki spaces get_node --params '{"token":"YwxMw2QDtinz2xkeLGicBNmYnvf"}'`
})

// 第二步：根据返回的 obj_token 读取文档内容
Skill({
  skill: "lark-doc",
  args: `docs +fetch --doc {obj_token}`
})
```

#### 注意事项
- 📖 **强制遵守**：数据库设计必须严格遵守公司规范
- 🔍 **评审检查**：技术方案评审时需对照规范逐项检查
- 💡 **性能优化**：规范中的建议都是基于性能优化的最佳实践

### Step 3：输出技术评审方案

按照 [technical-design-format.yaml]中定义的格式规范，生成完整的技术方案评审方案。

**二次评审模式的特殊处理：**
- 保留原方案中未被质疑的部分
- 重点修订评审意见涉及的章节
- 在修订处标注修改原因（引用评审意见）
- 如有重大调整，在文档开头增加"修订记录"章节，说明本次修订的背景和主要内容

**修订记录示例（仅在二次评审模式且存在重大调整时添加）：**

```markdown
## 修订记录

| 版本 | 日期 | 修订人 | 修订内容 | 评审意见来源 |
|------|------|--------|----------|-------------|
| v1.1 | 2026-05-21 | AI架构师 | 修正ER图语法，改为标准Mermaid格式 | 评审反馈：ER图有问题 |
| v1.0 | 2026-05-21 | AI架构师 | 初始版本 | - |
```

## 可用技能工具

本技能在执行过程中可以调用以下技能工具：

1. **openspec-explore** - 用于需求探索和技术分析（**唯一允许使用的 openspec 命令**）
2. **coding-database-query** - 用于查询数据库表结构和数据（可选，按需使用）
3. **lark-doc** - 用于读取飞书文档中的数据库设计规范（可选，按需使用）
4. **coding-junit** - 用于单元测试设计和性能对比测试（在 unit_test 章节需要时使用）

## 重要限制

⚠️ **OpenSpec 命令使用限制：**

- ✅ **允许使用**：`openspec-explore` - 用于需求探索和技术分析
- ❌ **禁止使用**：所有其他 openspec 命令，包括但不限于：
  - `openspec-new-change`
  - `openspec-apply-change`
  - `openspec-archive-change`
  - `openspec-continue-change`
  - `openspec-sync-specs`
  - `openspec-verify-change`
  - 以及其他任何 openspec-* 命令

**原因**：本技能专注于技术方案设计评审，不涉及 OpenSpec 变更的生命周期管理。如需执行其他 openspec 操作，请使用对应的专用技能。

## 输出位置

- 评审报告: `docs/{需求编号}/technical-design/design_review.md`
