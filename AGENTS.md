# AGENTS.md

本文件为 AI Agent 在此仓库中工作时提供指导。

## 语言要求

所有输出必须使用中文，代码示例和技术术语可保留原文。

## 项目概述

**ai-coding** 是一套 AI 辅助开发工具链，服务于 OPP（展业平台）微服务项目的需求交付全流程。核心组成：

1. **Coding 系列技能** - 为 CodeBuddy/Codex/Qoder/Qwen 四种 AI Agent 提供统一的技能定义
2. **OpenSpec 变更管理** - 结构化的软件变更工作流（proposal → design → tasks）
3. **AI 需求交付控制台** - 可视化需求交付管理工具（Vue 3 + Node.js）
4. **多 Agent 配置同步** - 通过 `skill-sync.ts` 启动时自动同步技能到各 Agent 目录

## 目录结构

```
ai-coding/
├── skills/                        # 技能源文件（SKILL.md + 辅助资源）
│   ├── coding-database-query/     # 数据库只读查询工具
│   ├── coding-design/             # 技术方案设计专家
│   ├── coding-junit/              # 单元测试生成专家
│   ├── coding-prd-analyzer/       # PRD 分析器
│   └── coding-review/             # 代码评审官
├── tools/
│   └── ai-delivery-console/       # AI 需求交付控制台
├── openspec/
│   ├── config.yaml                # 项目上下文 + 工件生成规则
│   ├── changes/                   # 变更容器（按需求/功能组织）
│   └── specs/                     # 规格说明
├── docs/                          # 需求产物（按需求号聚合）
├── logs/                          # 运行日志
├── .codebuddy/                    # CodeBuddy 配置（技能 + opsx 命令 .md）
├── .codex/                        # Codex 配置（技能）
├── .qoder/                        # Qoder 配置（技能 + opsx 命令 .md + 权限白名单）
└── .qwen/                         # Qwen 配置（技能 + opsx 命令 .toml）
```

## 技能系统

### 源文件与自动同步

技能源文件在 `skills/` 目录。控制台服务启动时（`server/services/skill-sync.ts`）自动将 coding-\* 技能同步到 `.codebuddy/skills/`、`.codex/skills/`、`.qoder/skills/`、`.qwen/skills/`。

**修改技能时**：只编辑 `skills/` 下的源文件，重启控制台或手动触发同步即可。

### Coding 技能

| 技能 | 用途 | 输入参数 | 输出位置 |
|------|------|----------|----------|
| `coding-prd-analyzer` | 多来源 PRD 结构化分析（飞书/蓝湖/墨刀/Axure/图片/PDF） | `id=需求ID`（必填）, `source列表`（可选）, `c=澄清描述`（可选） | `docs/{需求号}/prd/analysis.md` |
| `coding-design` | 技术方案设计（基于 OpenSpec） | `d=需求描述`（必填）, `r=需求编号`（必填）, `p=工程模块`（可选）, `c=评审意见`（可选） | `docs/{需求号}/technical-design/design_review.md` |
| `coding-junit` | Java 单元测试生成（新增/修改/性能对比三种策略） | `模块名`（必填）, `描述说明`（可选） | `docs/{需求号}/junit/index.html` |
| `coding-review` | 增量代码评审 + 多工程联合评审 | `b=分支名`（必填）, `d=外部文档`（可选） | `docs/code_review/code_review_{分支名}/` |
| `coding-database-query` | 数据库只读查询（MySQL/PG/SQLite/Oracle/SQLServer） | YAML 配置或命令行 | 查询结果直接输出 |
| `coding-prd-clarify` | 交互式需求澄清（仅 CodeBuddy） | 与 coding-prd-analyzer 集成 | - |

### OpenSpec 技能（全部 Agent 目录均有）

| 技能 | 说明 |
|------|------|
| `openspec-new-change` | 创建新变更提案 |
| `openspec-continue-change` | 继续变更工作流 |
| `openspec-explore` | 探索模式（实施前分析） |
| `openspec-apply-change` | 应用变更（执行任务） |
| `openspec-verify-change` | 验证变更完成情况 |
| `openspec-archive-change` | 归档已完成变更 |
| `openspec-bulk-archive-change` | 批量归档 |
| `openspec-ff-change` | 快速推进变更 |
| `openspec-sync-specs` | 同步规格说明 |
| `openspec-onboard` | 新手引导 |

### OpenSpec 命令格式差异

| Agent | 命令文件格式 | 目录 |
|-------|-------------|------|
| CodeBuddy | `.md` | `.codebuddy/commands/opsx/` |
| Qoder | `.md` | `.qoder/commands/opsx/` |
| Qwen | `.toml` | `.qwen/commands/` |

## AI 需求交付控制台

位于 `tools/ai-delivery-console/`，按需求号聚合所有 AI 产物的可视化工具。

### 技术栈

- **前端**: Vue 3.2 + Vite 4 + TypeScript 4.9 + Element Plus 2.7 + Pinia 2.0 + Mermaid + markdown-it
- **后端**: Node.js + tsx（原生 HTTP 服务）
- **测试**: Vitest + @vue/test-utils + jsdom

### 构建与运行

```bash
cd tools/ai-delivery-console
npm install

# 启动后端（http://127.0.0.1:8718），启动时自动同步技能到各 Agent 目录
npm run server:dev

# 启动前端（http://127.0.0.1:5178）
npm run dev

# 构建
npm run build

# 单元测试
npm run test:unit

# 测试报告
npm run test:report

# 代码检查
npm run lint
```

### 架构

```
tools/ai-delivery-console/
├── server/                          # Node.js 后端
│   ├── index.ts                     # 入口（技能同步 → 监听 8718）
│   ├── config.ts                    # 配置（端口、Agent 命令模板）
│   ├── router.ts                    # API 路由（核心路由逻辑）
│   └── services/                    # ~16 个服务模块
│       ├── skill-sync.ts            # 技能同步（启动时执行）
│       ├── workflow-repository.ts   # 工作流仓储
│       ├── workspace-scanner.ts     # 工作区扫描（按需求号索引产物）
│       ├── workflow-lock.ts         # 需求级并发锁
│       ├── action-adapters.ts       # Agent 动作适配
│       ├── agent-providers.ts       # Agent 提供者管理
│       ├── run-log.ts               # 运行日志（SSE 实时推送）
│       ├── markdown-service.ts      # Markdown 读写
│       ├── review-service.ts        # 评审服务
│       ├── openspec-summary.ts      # OpenSpec 摘要
│       ├── git-changes.ts           # Git 变更读取
│       ├── prd-source-files.ts      # PRD 源文件快照管理
│       ├── project-history.ts       # 项目历史
│       └── project-settings.ts      # 项目设置
├── shared/                          # 前后端共享
│   ├── workflow.ts                  # 工作流类型与 4 阶段定义
│   └── stage-rules.ts               # 阶段流转规则
├── src/                             # Vue 3 前端
│   ├── views/
│   │   ├── RequirementList.vue      # 需求列表
│   │   ├── RequirementDetail.vue    # 需求详情（核心页面）
│   │   └── Settings.vue             # 设置
│   ├── components/                  # 8 个组件
│   │   ├── ArtifactPreviewDialog.vue
│   │   ├── ArtifactSidebar.vue
│   │   ├── GitChangeInspector.vue
│   │   ├── MarkdownEditor.vue
│   │   ├── OpenSpecDocuments.vue
│   │   ├── ReviewDialog.vue
│   │   ├── RunLogDrawer.vue         # SSE 实时日志
│   │   └── StageTimeline.vue
│   ├── api/client.ts                # API 客户端
│   └── stores/                      # Pinia 状态
└── tests/                           # 测试（组件 + 服务端 + 共享）
```

### 工作流阶段

交付控制台定义 **4 个线性阶段**，前序阶段 APPROVED 后才能进入下一阶段：

| 阶段 | 对应技能 | 产物路径 |
|------|----------|----------|
| PRD | `coding-prd-analyzer` | `docs/{需求号}/prd/analysis.md` |
| TECH_DESIGN | `coding-design` | `docs/{需求号}/technical-design/design_review.md` |
| IMPLEMENTATION | OpenSpec | `openspec/changes/req-{需求号}/` |
| CODE_REVIEW | `coding-review` | `docs/code_review/code_review_{分支名}/` |

### 关键设计

- **需求级并发锁** (`WorkflowLock`): 防止同一需求被并发修改
- **Agent Provider 适配** (`action-adapters.ts`): 支持 Codex CLI 等 Agent 执行
- **SSE 实时日志** (`RunLogDrawer`): Agent 执行日志实时推送前端
- **产物 Hash 校验**: 防止外部修改导致数据覆盖
- **安全边界**: 只允许读写工作区内的文件路径
- **自动产物索引** (`workspace-scanner.ts`): 按需求号扫描 `docs/` 和 `openspec/` 聚合产物

## OpenSpec 变更管理

### 配置 (`openspec/config.yaml`)

- **context**: OPP 项目技术栈、模块结构、开发规范（设计规则中包含 Mermaid 图、API 契约、Redis 缓存策略、RocketMQ 消息、分布式锁、MapStruct 等详细约束）
- **rules**: proposal（800 字内、必须含非目标）、specs（SHALL/SHOULD、可测试）、design（架构决策、时序图、ER 图、API 契约、缓存策略等）、tasks（中文、2-4h 工作块、单元测试报告）

### 变更结构

```
openspec/changes/<变更名>/
├── .openspec.yaml           # 元数据
├── proposal.md              # 变更提案
├── design.md                # 设计方案
├── tasks.md                 # 任务清单
├── implementation-notes.md # 实现备注（可选）
└── verification-report.md   # 验证报告（可选）
```

### 变更命名规范

- 需求类：`req-{需求号}`（如 `req-171635`）
- 功能类：kebab-case（如 `delivery-console-enhancements`）

## 产物约定

所有需求产物按需求号组织在 `docs/{需求号}/`：

```
docs/{需求号}/
├── prd/
│   ├── analysis.md           # PRD 分析结果
│   └── files/                # PRD 源文件快照（图片/OCR 文本）
├── technical-design/
│   └── design_review.md      # 技术方案
├── junit/
│   └── index.html            # 单元测试报告
├── workflow/
│   ├── state.json            # 工作流状态（含各阶段完成时间和 Agent）
│   └── runs/{runId}.jsonl    # 运行日志
└── reports/                  # 实施报告、验证报告等
```

代码评审产物独立存放：`docs/code_review/code_review_{分支名}/summary.md`

## 编码风格

### 前端（交付控制台）

- Vue 3 Composition API + `<script setup>`
- TypeScript 严格模式
- ESLint + Prettier
- 组件/文件命名 PascalCase

### 技能定义（SKILL.md）

- YAML frontmatter 定义元数据（name, description, license, metadata）
- Markdown 正文定义技能逻辑
- 输入参数格式：`key=value`，逗号分隔多值

## OPP 项目上下文

本工具链服务的 OPP（展业平台）核心信息：

### 技术栈

- **后端**: Spring Boot 2.x + Macula Boot 5.0.17 + Spring Cloud Alibaba（Nacos）+ MyBatis-Plus + Redis + RocketMQ
- **前端**: Vue 3/Vite + Element Plus（新）、Vue 2/Webpack + Element UI（旧）、React/Umi Max + Ant Design 5（问卷，**必须 pnpm**）、Uni-app（小程序）
- **Java 版本**: 11+（opp-survey 除外，为 1.8）

### 关键注意事项

- **opp-clock-in**: 混合数据访问（JPA + MyBatis-Plus + JDBC + Fenix），实体同时带 `@Entity` 和 `@TableName`
- **opp-learn**: Nacos 配置用 `group: KEY_GROUP`，其他服务用默认组
- **opp-survey**: 基于 SurveyKing 框架，Java 1.8，包名 `cn.surveyking.boot`
- **opp-admin-vue**: 有 ME2AI/AI2AI 双层 SPEC 系统，禁止擅自修改权限码、路由名、store key、加密/登录/租户/动态路由逻辑
- **Java 单元测试**: JUnit 4 风格：`@RunWith(SpringRunner.class)` + `@SpringBootTest`

## 提交规范

约定式提交（中文）：`feat(scope): ...`、`fix(scope): ...`、`docs(scope): ...`、`refactor(scope): ...`

## 最佳实践

1. **修改技能**：只编辑 `skills/` 源文件，重启控制台自动同步到各 Agent 目录
2. **代码评审**：定期增量评审，重要评审附带外部文档约束，关注 `summary.md` 问题状态
3. **OpenSpec 工作流**：保持变更范围小而聚焦，及时归档已完成变更
4. **需求交付**：按 4 阶段线性推进，确保前一阶段 APPROVED 后再进入下一阶段
5. **产物管理**：所有输出遵循统一目录约定，便于控制台自动索引
