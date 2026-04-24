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

### 核心技能

#### 📋 [code-review](skills/code-review/)
**资深 Java 架构师代码评审官**

专注于高并发、分布式、企业级 Java 系统的 PR 审核，支持多工程联合评审和增量评审。

**主要特性：**
- ✅ 增量评审：自动检测历史检查点，仅评审新增变更
- ✅ 问题追踪：自动检测历史问题是否已修复
- ✅ 分支归集：按分支名归集评审历史
- ✅ 外部文档约束：支持飞书文档、设计文档等外部约束条款核对
- ✅ 多工程联合评审：支持 Maven 多模块工程的依赖关系分析

**使用方式：** `/code-review b=<分支名> d=<外部文档>`

**输出位置：** `code_review/code_review_<分支名>/`

---

#### 📊 [prd-analyzer](skills/prd-analyzer/)
**产品需求文档分析器**

读取多种来源的 PRD（飞书文档、蓝湖/墨刀/Axure、本地图片/PDF），批量梳理并输出结构化功能点清单。

**支持的来源：**
- 飞书文档：`https://*.feishu.cn/docx/*`
- 蓝湖设计稿：`https://*.lanhu.app/*`
- 墨刀原型：`https://*.modao.cc/*`
- Axure 原型：`http://axure*/*`
- 本地图片：`.png`, `.jpg`, `.jpeg`
- 本地 PDF：`.pdf`

**主要功能：**
- 🔍 多来源内容提取（文本/视觉理解）
- 📝 结构化功能点清单（类型、交互步骤、输入数据、异常场景等）
- 📦 模块分组与关联分析
- 🎯 OpenSpec 变更草稿生成（需手动创建）

**使用方式：** `/prd <source1>,<source2>,...`

**输出位置：** `./prd-output/<timestamp>-prd-analysis.md`

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
