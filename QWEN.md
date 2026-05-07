# QWEN.md - AI 助手项目上下文

## 项目概述

**ai-coding** 是一个 AI 辅助开发工具集，核心功能包括：

1. **CodeBuddy 技能系统** - 为 CodeBuddy AI 助手提供自定义技能和命令
2. **OpenSpec 变更管理** - 结构化的软件变更工作流（从需求到实现）
3. **代码评审系统** - 自动化代码评审和增量检查点管理
4. **PRD 分析器** - 产品需求文档的结构化分析

该项目本身不是一个独立的应用程序，而是一套**AI 辅助开发工具链**，用于提升软件开发效率和质量。

## 目录结构

```
ai-coding/
├── .codebuddy/                    # CodeBuddy AI 助手配置
│   ├── commands/                  # 自定义命令
│   │   └── opsx/                  # OpenSpec 工作流命令集
│   └── skills/                    # 自定义技能
│       ├── coding-review/         # 代码评审技能
│       ├── coding-prd-analyzer/   # PRD 分析技能
│       └── openspec-*/            # OpenSpec 相关技能
├── openspec/                      # OpenSpec 变更管理
│   ├── changes/                   # 变更容器（按需求/任务组织）
│   ├── specs/                     # 规格说明（待填充）
│   └── config.yaml                # OpenSpec 配置
├── coding/                        # 开发产出物
│   ├── code_review/               # 代码评审报告
│   └── prd/                       # PRD 分析输出
├── *.py                           # Python 工具脚本
└── *.sh                           # Shell 工具脚本
```

## 核心功能

### 1. CodeBuddy 技能系统

#### 代码评审技能 (`coding-review`)

**功能特性：**
- ✅ 增量评审：自动检测历史检查点，仅评审新增变更
- ✅ 问题追踪：自动检测历史问题是否已修复
- ✅ 分支归集：按分支名归集评审历史
- ✅ 外部文档约束：支持飞书文档等外部约束条款核对
- ✅ 多工程联合评审：支持 Maven 多模块工程的依赖关系分析

**使用方式：**
```bash
# 首次评审
/code-review b=feature_opp_157396

# 增量评审（复用历史检查点）
/code-review b=feature_opp_157396

# 带外部文档约束的评审
/code-review b=bugfix_opp_170025 d=review-notes.md,https://xxx.feishu.cn/docx/xxx
```

**输出位置：** `code_review/code_review_<分支名>/`

**检查点文件：** `.checkpoint.json` - 记录各工程最后评审的 commit hash

---

#### PRD 分析技能 (`coding-prd-analyzer`)

**支持的来源：**
- 飞书文档：`https://*.feishu.cn/docx/*`
- 蓝湖设计稿：`https://*.lanhu.app/*`
- 墨刀原型：`https://*.modao.cc/*`
- Axure 原型：`http://axure*/*`
- 本地图片：`.png`, `.jpg`, `.jpeg`
- 本地 PDF：`.pdf`

**主要功能：**
- 🔍 多来源内容提取（文本/视觉理解）
- 📝 结构化功能点清单
- 📦 模块分组与关联分析
- 🎯 OpenSpec 变更草稿生成

**使用方式：**
```bash
# 分析单个飞书文档
/prd https://example.feishu.cn/docx/AbCdEfGh

# 分析多个设计稿
/prd https://lanhu.app/xyz123,https://modao.cc/abc456

# 混合来源分析
/prd https://example.feishu.cn/docx/abc,./mockups/login.png,./docs/req.pdf
```

**输出位置：** `./coding/prd/<timestamp>-prd-analysis/`

---

### 2. OpenSpec 变更管理工作流

OpenSpec 是一个结构化的软件变更管理框架，支持从需求到实现的全流程管理。

#### 命令集（`.codebuddy/commands/opsx/`）

| 命令 | 说明 |
|------|------|
| `/opsx:onboard` | 新手引导 - 通过实际任务演示完整的 OpenSpec 工作流程 |
| `/opsx:new <变更名>` | 创建新的变更容器 |
| `/opsx:explore <变更名>` | 探索模式 - 在实施前分析问题 |
| `/opsx:continue <变更名>` | 继续未完成的变更工作 |
| `/opsx:apply <变更名>` | 应用变更 - 执行任务清单 |
| `/opsx:verify <变更名>` | 验证变更完成情况 |
| `/opsx:archive <变更名>` | 归档已完成的变更 |
| `/opsx:ff <变更名>` | 快速前进（Fast-forward）变更 |
| `/opsx:sync` | 同步规格说明 |
| `/opsx:bulk-archive` | 批量归档多个变更 |

#### 变更结构

每个变更容器包含以下工件（artifacts）：

```
openspec/changes/<变更名>/
├── proposal.md      # 变更提案（Why/What/Impact）
├── specs/           # 规格说明
├── design/          # 设计方案
├── tasks.md         # 任务清单
└── archive/         # 归档记录
```

#### 完整工作流示例

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

---

### 3. 工具脚本

#### Python 脚本

| 脚本 | 功能 |
|------|------|
| `generate_diffs.py` | 生成 Git 分支差异报告 |
| `parse_diffs.py` | 解析差异文件，提取文件列表 |
| `update_checkpoint.py` | 更新代码评审检查点 |
| `update_checkpoint_final.py` | 完成检查点更新并记录历史 |

#### Shell 脚本

| 脚本 | 功能 |
|------|------|
| `process_projects.sh` | 批量处理多个 Git 项目（拉取、同步分支） |

---

## 相关项目上下文

本工具链主要服务于 **OPP（展业平台）** 微服务项目群，该项目技术栈如下：

### OPP 项目技术栈

**后端：**
- Spring Boot 2.x + Macula Boot 5.0.17
- Spring Cloud Alibaba（Nacos）
- MyBatis-Plus + 动态数据源
- Redis + RocketMQ
- Spring Security + JWT

**前端：**
- 管理后台：Vue 3 + Vite + Element Plus + Pinia
- 旧模块：Vue 2 + Webpack + Element UI
- 小程序：Uni-app（微信小程序）
- 问卷前端：React + Umi Max + Ant Design 5

**项目模块：**
- `opp-gateway` - 网关服务
- `opp-learn` - 学习服务
- `opp-user` - 用户服务
- `opp-order` - 订单服务
- `opp-clock-in` - 打卡服务
- `opp-material` - 素材服务
- `opp-meeting` - 会议服务
- `opp-test` - 考试服务
- `opp-diy` - DIY 服务
- `opp-admin-vue` - Vue 3 管理后台
- `opp-admin-learn-vue` - Vue 2 学习管理后台（逐步迁移中）

详见各模块的 `AGENTS.md` 和 `CODEBUDDY.md` 文件。

---

## 最佳实践

### 代码评审

1. 定期执行增量评审，避免累积过多变更
2. 重要评审建议附带外部文档约束（会议纪要、设计文档）
3. 关注 `summary.md` 中的总体评审结论和问题状态
4. 使用检查点机制追踪评审历史

### PRD 分析

1. 确保飞书文档有正确的分享权限
2. 设计稿链接建议使用公开访问链接
3. 生成的功能点清单需人工审查后再创建 OpenSpec 变更

### OpenSpec 工作流

1. 变更命名使用 kebab-case 格式（如 `add-user-authentication`）
2. 保持变更范围小而聚焦
3. 及时归档已完成的变更
4. 使用 `/opsx:verify` 验证实现与规格一致性

---

## 版本信息

- **code-review skill:** v1.0
- **prd-analyzer skill:** v1.0
- **OpenSpec schema:** spec-driven

---

## 相关链接

- [CodeBuddy 官方文档](https://codebuddy.com/docs)
- [OpenSpec 项目](https://github.com/openspec-project/openspec)
- [阿里巴巴 Java 开发手册](https://github.com/alibaba/p3c)
