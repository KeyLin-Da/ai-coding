# .codebuddy 配置目录

本目录包含 CodeBuddy AI 助手的自定义命令（Commands）和技能（Skills）配置，用于扩展和定制 AI 助手的功能。

## 目录结构

```
.codebuddy/
├── commands/          # 自定义命令
│   └── opsx/         # OpenSpec 工作流命令集
└── skills/           # 自定义技能
    ├── code-review/              # 代码评审技能
    ├── prd-analyzer/             # PRD 分析器技能
    └── openspec-*/               # OpenSpec 相关技能集合
tools/
└── ai-delivery-console/        # AI 需求交付控制台（可视化工具）
```

## Commands（命令）

### OpenSpec 工作流命令 (`opsx/`)

提供完整的 OpenSpec 变更管理工作流，支持从需求到实现的全流程管理。

| 命令文件 | 说明 |
|---------|------|
| `onboard.md` | 新手引导 - 通过实际任务演示完整的 OpenSpec 工作流程 |
| `new.md` | 创建新的变更容器 |
| `explore.md` | 探索模式 - 在实施前分析问题 |
| `continue.md` | 继续未完成的变更工作 |
| `apply.md` | 应用变更 - 执行任务清单 |
| `verify.md` | 验证变更完成情况 |
| `archive.md` | 归档已完成的变更 |
| `ff.md` | 快速前进（Fast-forward）变更 |
| `sync.md` | 同步规格说明 |
| `bulk-archive.md` | 批量归档多个变更 |

**使用方式：** 在 CodeBuddy 中使用 `/opsx:<command>` 调用

## Skills（技能）

### Coding 系列技能（支持 AI 需求交付控制台可视化执行）

以下技能均可通过 [AI 需求交付控制台](tools/ai-delivery-console/) 进行可视化管理和执行。

#### 🏗️ coding-design - 技术方案设计专家
基于 OpenSpec 体系进行需求分析、技术探索和技术方案设计输出。支持首次设计和二次评审模式，可查询数据库表结构和参考设计规范。

**输入参数：** `d=需求描述`（必填）、`r=需求编号`（必填）、`c=评审意见`（可选）  
**输出位置：** `docs/{需求编号}/technical-design/design_review.md`

---

#### 👨‍💻 coding-review - 代码评审官
资深 Java 架构师代码评审，聚焦高并发、分布式系统。支持增量评审、问题追踪、多工程联合评审和外部文档约束核对。

**输入参数：** `b=分支名`（必填）、`d=外部文档`（选填）  
**输出位置：** `docs/code_review/code_review_{分支名}/`

---

#### 📋 coding-prd-analyzer - PRD 分析器
读取多种来源的 PRD（飞书文档、蓝湖/墨刀/Axure、本地图片/PDF），批量梳理并输出结构化功能点清单。支持需求澄清模式。

**输入参数：** `id=需求ID`（必填）、`c=澄清描述`（可选）、`source列表`（可选）  
**输出位置：** `docs/{需求编号}/prd/analysis.md`

---

#### 🧪 coding-junit - 单元测试生成专家
根据 Git commit 变更自动生成 Java 单元测试代码。智能判断测试策略（新增接口/修改接口/性能优化），支持新旧返参对比测试和异常重跑。

**输入参数：** `模块名`（必填）、`描述说明`（可选）  
**输出位置：** `docs/{需求号}/junit/`

---

#### 💾 coding-database-query - 数据库查询工具
安全连接多种数据库（MySQL/PostgreSQL/SQLite/Oracle/SQL Server）执行只读查询。被 coding-design 用于数据库表结构探索。

**使用方式：** YAML 配置文件或命令行直接指定  
**安全限制：** 仅支持 SELECT/SHOW/DESCRIBE 等只读操作，禁止任何数据修改

---

### 🎯 [AI 需求交付控制台](tools/ai-delivery-console/)
**OpenSpec + 自定义技能可视化交付台**

面向本地工作区的可视化工具，用于按需求号聚合 PRD、技术方案、OpenSpec 实施验证、单元测试报告和代码评审报告。

**主要特性：**
- 📊 **需求级聚合**：按需求号自动索引所有相关产物
- 🔄 **Agent Provider 支持**：支持 Codex CLI 自动化执行或手动模式
- 📝 **实时终端输出**：通过 SSE 实时展示 Agent 执行日志
- 🔒 **安全边界**：只允许读写当前工作区内的文件路径
- ⚡ **并发控制**：修改型动作使用需求级锁文件

**支持的技能：**
- `coding-prd-analyzer` - PRD 分析与澄清
- `coding-design` - 技术方案设计
- `coding-junit` - 单元测试生成与执行
- `coding-review` - 代码评审

**产物约定：**
- PRD：`docs/{需求号}/prd/analysis.md`
- 技术方案：`docs/{需求号}/technical-design/design_review.md`
- OpenSpec：`openspec/changes/req-{需求号}`
- 单元测试报告：`docs/{需求号}/junit/**`
- 代码评审：`docs/code_review/code_review_{分支名}/summary.md`
- 工作流元数据：`docs/{需求号}/workflow/state.json`
- 运行日志：`docs/{需求号}/workflow/runs/{runId}.jsonl`

**启动方式：**
```bash
cd tools/ai-delivery-console
npm install
npm run server:dev  # 后端服务 (http://127.0.0.1:8718)
npm run dev         # 前端服务 (http://127.0.0.1:5178)
```

---

### OpenSpec 技能集合

以下技能为 OpenSpec 工作流提供辅助功能：

| 技能名称 | 说明 |
|---------|------|
| `openspec-new-change` | 创建新的 OpenSpec 变更 |
| `openspec-continue-change` | 继续处理现有变更 |
| `openspec-apply-change` | 应用变更任务 |
| `openspec-verify-change` | 验证变更完成度 |
| `openspec-archive-change` | 归档单个变更 |
| `openspec-bulk-archive-change` | 批量归档变更 |
| `openspec-ff-change` | 快速推进变更 |
| `openspec-sync-specs` | 同步规格说明 |
| `openspec-explore` | 探索和分析变更需求 |
| `openspec-onboard` | OpenSpec 新手引导 |

## 工作流程示例

### 代码评审流程

```bash
# 首次评审
/code-review b=feature_opp_157396

# 增量评审（复用历史检查点）
/code-review b=feature_opp_157396

# 带外部文档约束的评审
/code-review b=bugfix_opp_170025 d=review-notes.md,https://xxx.feishu.cn/docx/xxx
```

### PRD 分析流程

```bash
# 分析单个飞书文档
/prd https://example.feishu.cn/docx/AbCdEfGh

# 分析多个设计稿
/prd https://lanhu.app/xyz123,https://modao.cc/abc456

# 混合来源分析
/prd https://example.feishu.cn/docx/abc,./mockups/login.png,./docs/req.pdf

# 生成功能点后，手动创建 OpenSpec 变更
/opsx:new prd-20260424-login
```

### OpenSpec 完整工作流

```bash
# 1. 新手引导（首次使用）
/opsx:onboard

# 2. 创建变更
/opsx:new add-user-authentication

# 3. 探索需求
/opsx:explore add-user-authentication

# 4. 编写提案、规格、设计、任务
# （AI 辅助生成各 artifacts）

# 5. 应用变更
/opsx:apply add-user-authentication

# 6. 验证完成
/opsx:verify add-user-authentication

# 7. 归档变更
/opsx:archive add-user-authentication
```

## 配置说明

### 代码评审配置

- **检查点文件：** `.checkpoint.json` - 记录各工程最后评审的 commit hash
- **忽略文件：** `.fileignore` - 配置不需要评审的文件路径模式
- **评审规则：** 遵循《阿里巴巴 Java 开发手册》及项目规范

### PRD 分析配置

- **输出目录：** `./prd-output/` - 自动创建，存储分析结果
- **时间戳格式：** `YYYYMMDD-HHMMSS`
- **OpenSpec 对接：** 生成草稿供参考，需手动创建变更

## 最佳实践

1. **代码评审：**
   - 定期执行增量评审，避免累积过多变更
   - 重要评审建议附带外部文档约束（会议纪要、设计文档）
   - 关注 `summary.md` 中的总体评审结论和问题状态

2. **PRD 分析：**
   - 确保飞书文档有正确的分享权限
   - 设计稿链接建议使用公开访问链接
   - 生成的功能点清单需人工审查后再创建 OpenSpec 变更

3. **OpenSpec 工作流：**
   - 变更命名使用 kebab-case 格式
   - 保持变更范围小而聚焦
   - 及时归档已完成的变更

## 版本信息

- **code-review skill:** v1.0
- **prd-analyzer skill:** v1.0
- **许可证：** MIT

## 相关链接

- [CodeBuddy 官方文档](https://codebuddy.com/docs)
- [OpenSpec 项目](https://github.com/openspec-project/openspec)
- [阿里巴巴 Java 开发手册](https://github.com/alibaba/p3c)
