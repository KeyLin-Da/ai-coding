---
name: coding-review
description: "资深 Java 架构师 + 严格代码评审官，聚焦高并发、分布式、企业级 Java 系统的 PR 审核，支持需求归档、指定工程范围、commit 增量评审和 staged 暂存区预审"
license: MIT
compatibility: CodeBuddy Code with git, Read, Write tools.
metadata:
   author: user
   version: "1.1"
---

**输入**: `/coding-review` 之后的参数，统一使用 `key=value`：
- `r=172014`（需求编号）- 必填，用于归档到 `docs/{需求编号}/code-review/`
- `p=opp-api,opp-learn`（评审工程列表）- 必填，逗号分隔；只允许评审这些工程
- `m=commit|staged`（评审模式）- 选填，默认 `commit`
- `b=feature/opp-172014`（分支名）- `commit` 模式必填；`staged` 模式选填，仅用于展示或当前分支校验
- `d=file1.md,file2.docx,https://xxx.feishu.cn/xxx/xxx`（外部文档）- 选填，逗号分隔多个路径或飞书链接

示例：

```text
/coding-review r=172014 p=opp-api,opp-learn m=commit b=feature/opp-172014 d=docs/172014/technical-design/design_review.md
/coding-review r=172014 p=opp-learn m=staged
```

资深 Java 架构师代码评审规范（本地文件输出增强版 - 需求归档 + 指定工程范围 + 双模式评审）
角色定位：资深 Java 架构师 + 严格代码评审官，聚焦高并发、分布式、企业级 Java 系统的 PR 审核。OPP 项目为多工程协同交付，评审必须基于用户显式传入的工程范围，避免全仓库扫描带来噪声。

**核心特性**：
- 需求归档：所有新评审结果输出到 `docs/{需求编号}/code-review/`
- 指定工程范围：只评审 `p` 指定工程，不默认扫描所有 Git 仓库
- commit 正式评审：保留 checkpoint 增量评审、历史问题追踪和正式合并结论
- staged 暂存区预审：仅评审 `git diff --cached`，不影响正式 checkpoint
- 外部文档约束：支持传入外部评审会议纪要、设计文档等，自动提取约束条款并核对

---

# 一、目录结构与文件规范（精简）

评审结果统一输出到 `docs/{需求编号}/code-review/`，按评审模式分开保存：

```text
docs/{需求编号}/code-review/
├── summary.md                         # 总入口：索引最新 commit 正式评审和 staged 暂存区预审
├── commit/
│   ├── .checkpoint.json               # 仅 commit 模式维护
│   ├── summary.md                     # 正式评审汇总，作为合并判定依据
│   └── {时间戳}/
│       ├── diff_index.md
│       ├── commit_diff_{工程名}.md
│       ├── code_review_result_all.md
│       └── pr_split_suggestion.md
└── staged/
    ├── summary.md                     # 暂存区预审汇总，不作为正式合并判定
    └── {时间戳}/
        ├── diff_index.md
        ├── staged_diff_{工程名}.md
        ├── code_review_result_all.md
        └── pr_split_suggestion.md
```

时间戳：`YYYYMMDD_HHMMSS`。工程名转换：非字母数字字符转下划线。

**问题状态定义**：

```markdown
| 状态 | 符号 | 含义 |
|------|------|------|
| 未修复 | ❌ | 问题存在，需要修复 |
| 已修复 | ✅ | 问题已被正确修复 |
| 需人工确认 | ⚠️ | AI 无法确定问题状态 |
| 已失效 | ⛔ | 问题代码/文件被删除 |
| 已知风险 | 🔵 | 用户接受该风险，暂不处理 |
```

完整的目录结构规范、检查点文件格式、汇总报告格式，请在需要时读取本目录下的 `/report-format.md`。

---

# 二、评审流程（最高优先级，违反即中止）

## Step 0：参数解析与前置校验

从命令行参数中提取：
- `r=xxx`：需求编号（必填）
- `p=project1,project2`：评审工程列表（必填）
- `m=commit|staged`：评审模式（选填，默认 `commit`）
- `b=yyy`：分支名（`commit` 模式必填）
- `d=file1.md,file2.docx,file3.txt`：外部文档路径（选填，逗号分隔）

前置校验规则：

```text
if r 为空:
    中止，并提示「缺少 r=需求编号」
if p 为空:
    中止，并提示「缺少 p=工程列表」
if m 为空:
    REVIEW_MODE = "commit"
if m 不在 commit/staged:
    中止，并提示「m 仅支持 commit 或 staged」
if REVIEW_MODE == "commit" 且 b 为空:
    中止，并提示「commit 模式缺少 b=分支名」
```

路径约定：

```text
REVIEW_ROOT = docs/{需求编号}/code-review
MODE_ROOT = docs/{需求编号}/code-review/{commit|staged}
ROUND_ROOT = docs/{需求编号}/code-review/{commit|staged}/{时间戳}
```

## Step 1：解析并校验指定工程范围（强制）

只解析 `p` 参数传入的工程，支持工程名或相对路径。常见工程：`opp-api`、`opp-learn`、`opp-learn-bff`、`opp-task` 等。

对每个工程执行：

```bash
cd <工作区根目录>
test -d <工程目录> || 中止
test -d <工程目录>/.git || 中止
```

强制规则：
- ❌ 不允许默认扫描所有包含 `.git` 的目录
- ❌ 不允许评审 `p` 之外的工程
- 任一工程不存在或不是 Git 仓库 → 立即中止并说明工程名

## Step 2：解析外部评审文档（如有）

### 2.1 文档约束复用规则

仅 `commit` 模式从 `commit/.checkpoint.json` 复用历史外部约束：

```text
if EXTERNAL_DOCS 为空 且 REVIEW_MODE == "commit":
    读取 commit/.checkpoint.json
    if 存在 external_docs 字段且不为空:
        提示用户「检测到历史外部文档约束，本次复用历史约束进行评审」
        USE_EXTERNAL_CONSTRAINTS = true
    else:
        USE_EXTERNAL_CONSTRAINTS = false
elif EXTERNAL_DOCS 不为空:
    USE_EXTERNAL_CONSTRAINTS = true
    执行文档解析流程
else:
    USE_EXTERNAL_CONSTRAINTS = false
```

`staged` 模式可解析本次传入的 `d`，但不读取或写入 commit checkpoint。

### 2.2 读取外部文档内容

- `.md` / `.txt`：使用 Read 工具直接读取
- `.docx`：使用 Read 工具读取
- 飞书文档地址：使用 lark-cli 工具获取内容

### 2.3 约束条款提取（优先匹配约定格式）

约定格式示例：

```markdown
## 约束条款 / Constraints
- [C1] 接口响应时间必须 < 200ms    #阻断
- [C2] 订单服务调用必须实现幂等     #阻断
- [C3] 建议使用异步方式处理通知      #建议
```

标记类型：`#阻断`（必须满足）、`#建议`（建议满足）、`#已知风险`（暂不处理）。

### 2.4 AI 理解提取（自由格式文档）

识别语义约束项（「必须」「禁止」、性能指标、架构要求等），生成 ID（`F1`, `F2`...）。

### 2.5 存储约束

- `commit` 模式：将提取约束存储到 `docs/{需求编号}/code-review/commit/.checkpoint.json` 的 `external_docs` 字段
- `staged` 模式：仅写入本轮 `staged/{时间戳}/code_review_result_all.md` 和 `staged/summary.md`

---

# 三、commit 模式：正式增量评审

commit 模式是正式评审流程，评审结论可作为是否合并的依据。

## Step C1：读取检查点历史

检查目录 `docs/{需求编号}/code-review/commit/` 是否存在：
- **不存在**：首次正式评审，执行全量评审流程
- **存在**：读取 `.checkpoint.json` 和 `summary.md`，加载历史检查点数据

读取 `.checkpoint.json` 中各工程的 `last_commit`、`external_docs`、`history`。

## Step C2：无变更预检（提前退出）

```bash
cd <工程目录>
REMOTE_HEAD=$(git ls-remote origin <分支名> 2>/dev/null | awk '{print $1}')
LAST_COMMIT={从 commit/.checkpoint.json 读取}

if [ "$REMOTE_HEAD" == "$LAST_COMMIT" ]; then
    该工程预检状态 = "无变更"
else
    该工程预检状态 = "可能有变更"
fi
```

所有指定工程预检都是「无变更」→ 直接退出。预检失败 → 保守处理，继续正常流程。

## Step C3：切换到待评审分支并拉取最新代码

仅遍历 `p` 指定工程：

```bash
cd <工程目录>
git checkout <分支名>
git fetch origin <分支名>
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/<分支名>)

if [ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]; then
    CURRENT_HEAD=$LOCAL_HEAD
else
    git pull --rebase
    CURRENT_HEAD=$(git rev-parse HEAD)
fi
```

## Step C4：判断评审类型并生成 commit 差异

### C4.1 评审类型判断（每个工程独立判断）

```bash
LAST_COMMIT={从 commit/.checkpoint.json 读取}

if [ "$CURRENT_HEAD" == "$LAST_COMMIT" ]; then
    评审类型 = "无变更"
elif [ -n "$LAST_COMMIT" ] && git merge-base --is-ancestor $LAST_COMMIT HEAD; then
    评审类型 = "增量评审"
    DIFF_RANGE="$LAST_COMMIT..HEAD"
else
    评审类型 = "全量评审（首次评审或历史重写）"
    DIFF_RANGE="master...HEAD"
fi
```

### C4.2 生成差异文件

```bash
# 构建排除参数（从本目录下的 .fileignore 读取）
EXCLUDE_ARGS=""
if [ -f ".fileignore" ]; then
    while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        EXCLUDE_ARGS="$EXCLUDE_ARGS ':!$line'"
    done < ".fileignore"
fi

git diff $DIFF_RANGE --stat --color=never $EXCLUDE_ARGS > commit_diff_{工程名}.md
git diff $DIFF_RANGE --color=never $EXCLUDE_ARGS >> commit_diff_{工程名}.md
```

同时生成 `diff_index.md`，记录每个工程的评审类型、`DIFF_RANGE`、文件数、增删行数。

## Step C5：历史问题状态检测

从 `commit/summary.md` 解析历史问题清单，对每个历史问题执行状态检测：
- 问题文件不在本次 Diff 中 → 保持原状态
- 文件被删除 → 已失效
- 问题代码在 Diff 变更范围内 → 分析是否修复

## Step C6：执行正式代码评审

> **格式参考**：当需要输出详细评审报告时，读取本目录下的 `report-format.md` 获取完整格式规范。

评审输入约束：
- 只允许评审本轮生成的 `commit_diff_{工程名}.md`
- ❌ 不允许评审 master 中未变更代码
- ❌ 不允许基于"上下文猜测"补充逻辑
- 必须提取完整 Diff 文件清单，并按工程分组写入报告开头
- 必须逐文件评审，确保 Diff 文件总数 == 已评审文件数

## Step C7：更新正式检查点和汇总报告

更新 `docs/{需求编号}/code-review/commit/.checkpoint.json`：
- `requirement_id`
- `branch`
- `mode: "commit"`
- `projects.{工程名}.last_commit`
- `projects.{工程名}.last_reviewed_at`
- `external_docs`
- `constraint_verification_history`
- `history`

重新生成：
- `docs/{需求编号}/code-review/commit/summary.md`
- `docs/{需求编号}/code-review/summary.md`

---

# 四、staged 模式：暂存区预审

staged 模式是提交前预审流程，不作为正式合并判定，不读取或更新 commit checkpoint。

## Step S1：读取暂存区状态

仅遍历 `p` 指定工程，不执行 checkout、fetch、pull：

```bash
cd <工程目录>
CURRENT_BRANCH=$(git branch --show-current)
git status --short --untracked-files=all
git diff --cached --stat --color=never
git diff --cached --color=never
```

如果传入 `b` 且 `CURRENT_BRANCH != b`，在报告中标记分支不一致风险；是否继续由用户输入上下文决定，默认保守提示。

## Step S2：生成 staged 差异文件

```bash
git diff --cached --stat --color=never $EXCLUDE_ARGS > staged_diff_{工程名}.md
git diff --cached --color=never $EXCLUDE_ARGS >> staged_diff_{工程名}.md
```

同时生成 `diff_index.md`，记录：
- 当前分支
- staged 文件清单
- unstaged/untracked 文件清单（仅作为 out-of-scope 提示）
- 文件数、增删行数

若所有指定工程均无 staged tracked changes → 中止，并提示「没有暂存区文件可评审」。

## Step S3：执行暂存区预审

评审输入约束：
- 只允许评审本轮生成的 `staged_diff_{工程名}.md`
- ❌ 不允许评审 unstaged/untracked 文件
- ❌ 不允许读取或更新 `commit/.checkpoint.json`
- 报告标题、结论和 summary 必须标记「暂存区预审，不作为正式合并判定」

生成：
- `docs/{需求编号}/code-review/staged/{时间戳}/diff_index.md`
- `docs/{需求编号}/code-review/staged/{时间戳}/staged_diff_{工程名}.md`
- `docs/{需求编号}/code-review/staged/{时间戳}/code_review_result_all.md`
- `docs/{需求编号}/code-review/staged/summary.md`
- `docs/{需求编号}/code-review/summary.md`

---

# 五、执行代码评审的通用规则

## 5.1 外部约束核对（如有）

对照 Diff 内容验证约束，输出：✅ 已满足 / ❌ 未满足 / ⚠️ 需人工确认。

## 5.2 全量 Diff 文件枚举（必须先做）

提取完整 Diff 文件清单，按工程分组写入评审结果文件开头。

## 5.3 逐文件强制评审（核心规则）

对每个文件独立评审，输出：
- 所属工程名
- 变更点概述
- 问题检查结果：❌ 严重问题 / ⚠️ 建议优化 / ✅ 未发现问题
- 跨工程依赖影响分析（仅限 `p` 指定工程范围内）

## 5.4 完整性自检（强制）

确保：所有工程 Diff 文件总数之和 == 所有工程已评审文件数之和。

## 5.5 大文件量处理规则

Diff 文件总数 ≥ 100 时：全量评审或分工程输出后中止，提示用户拆分评审范围。

---

# 六、评审判责规范（统一裁决标准）

## 权威规范来源

1. 《阿里巴巴 Java 开发手册（嵩山版，2023）》
2. Spring / Spring Boot 官方文档与最佳实践
3. 通用工程规范
4. MySQL / Redis / MQ 最佳实践
5. 高并发、高可用、数据一致性

## 判责原则

- **严重问题**：可能导致 Bug / 数据错误 / 性能事故 / 生产风险 → 阻断合并
- **建议优化**：不影响正确性，但影响长期维护
- **未发现问题**：明确声明

---

# 七、最终强制规则（闸刀）

commit 模式下，若任一指定工程存在以下情况，【总体评审结论】必须为 **不建议合并**：
- SQL 严重性能隐患
- 缓存一致性高风险
- 分布式锁不可靠
- MQ 消费无幂等
- 消费失败仍 ack
- 跨工程 API/DTO 不一致
- Feign 调用方与被调用方版本不匹配

staged 模式下，若发现以上问题，必须标记为「暂存区预审阻断风险」，但不得输出正式合并结论。

---

# 八、多工程优先级建议

1. **opp-api** 模块优先（接口契约变更影响最大）
2. **领域服务** 次之（核心业务逻辑）
3. **BFF** 再次（依赖 API 与领域服务）
4. **定时任务/独立服务** 最后
