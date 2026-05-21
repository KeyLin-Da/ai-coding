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

按照 [coding-design-yaml-format.yaml]中定义的格式规范，生成完整的技术方案评审方案。

## 可用技能工具

本技能在执行过程中可以调用以下技能工具：

1. **openspec-explore** - 用于需求探索和技术分析
2. **coding-database-query** - 用于查询数据库表结构和数据（可选，按需使用）
3. **lark-doc** - 用于读取飞书文档中的数据库设计规范（可选，按需使用）
4. **coding-junit** - 用于单元测试设计和性能对比测试（在 unit_test 章节需要时使用）

## 输出位置

- 评审报告: `docs/{需求编号}/technical-design/design_review.md`
