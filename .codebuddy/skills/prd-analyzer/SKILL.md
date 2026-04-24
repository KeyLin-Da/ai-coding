---
name: prd-analyzer
description: 读取产品低保真 PRD（飞书文档、蓝湖/墨刀/Axure 公开链接、本地图片/PDF），批量梳理并输出结构化功能点清单，支持生成 OpenSpec 变更草稿供用户手动创建变更。
license: MIT
compatibility: CodeBuddy Code with lark-doc, Browser Automation, pdf skills.
metadata:
   author: user
   version: "1.0"
---

从多种来源读取产品需求文档（PRD），并生成结构化的功能点清单。

**重要：本 skill 不会自动创建 OpenSpec 变更。** 生成功能点清单后，用户必须检查并确认输出内容，然后手动运行 `/opsx:new <change-name>` 创建 OpenSpec 变更。

---

## 输入格式

`/prd <source1>,<source2>,...`

每个 source 可以是：
- **飞书文档**: `https://*.feishu.cn/docx/*` 或 `https://*.larksuite.com/docx/*`
- **蓝湖公开页面**: `https://*.lanhu.app/*`
- **墨刀公开页面**: `https://*.modao.cc/*`
- **Axure公开页面**: `http://axure*/*`
- **本地图片**: `/path/to/mockup.png`, `.jpg`, `.jpeg`
- **本地 PDF**: `/path/to/prd.pdf`

多个来源用逗号（`,`）分隔。skill 会处理所有来源并将结果合并为一份功能点清单。

---

## 来源路由

根据 URL/路径模式自动识别来源类型：

| 匹配模式 | 来源类型 | 处理策略 |
|---------|---------|---------|
| `*.feishu.cn/docx/*`, `*.larksuite.com/docx/*`, `*.feishu.cn/wiki/*` | 飞书文档 | `lark-doc` skill |
| `*.lanhu.app/*` | 蓝湖设计稿 | Browser Automation 截图 + 视觉理解 |
| `*.modao.cc/*` | 墨刀设计稿 | Browser Automation 截图 + 视觉理解 |
| `*.png`, `*.jpg`, `*.jpeg` | 本地图片 | `Read` + 视觉理解 |
| `*.pdf` | 本地 PDF | `pdf` skill + 视觉理解 |
| 无法识别 | 未知来源 | 报错并列出支持的格式 |

---

## 内容提取策略

### 飞书文档

1. 使用 `lark-doc` skill 读取文档内容。
2. 如果访问被拒绝，报告错误并提示检查文档分享权限。
3. 提取所有文本内容用于功能点分析。

### 蓝湖 / 墨刀公开页面 / Axure公开页面

1. 使用 `Browser Automation` 或 `playwright-cli` 或者 `curl` 打开公开链接。
2. 等待页面完全加载。
3. 截取页面截图。
4. 使用视觉理解能力分析截图，识别 UI 元素、表单、按钮、表格、卡片和功能描述。
5. 如果页面加载失败，报告错误并提示检查链接或保存为本地图片后重试。

### Axure公开页面

1. 使用 `curl` 获取公开链接。
2. 等待页面完全加载。
3. 截取页面截图。
4. 使用视觉理解能力分析截图，识别 UI 元素、表单、按钮、表格、卡片和功能描述。
5. 如果页面加载失败，报告错误并提示检查链接或保存为本地图片后重试。

### 本地图片

1. 使用 `Read` 工具读取图片文件。
2. 使用视觉理解能力分析图片，识别 UI 元素和功能描述。
3. 如果文件不存在，报告错误。

### 本地 PDF

1. 使用 `pdf` skill 提取文本和/或截取页面截图。
2. 使用视觉理解能力（针对截图）或文本分析（针对提取的文本）分析内容。
3. 如果文件不存在或无法读取，报告错误。

---

## 错误处理

对每个来源，处理以下错误场景：

- **权限不足（飞书）**: "无法读取飞书文档，请检查文档分享权限。"
- **页面加载失败（蓝湖/墨刀）**: "无法加载设计稿页面，请检查链接是否有效，或保存为本地图片后重试。"
- **文件不存在（本地）**: "文件不存在: `<path>`"
- **无法识别的来源类型**: "无法识别的 PRD 来源: `<source>`。支持的格式: 飞书文档链接、蓝湖/墨刀公开链接、本地图片(.png/.jpg/.jpeg)、本地PDF(.pdf)"

---

## 功能点结构化

### 提取维度

对每个识别出的功能点，提取以下维度：

- **类型**: `页面` | `弹窗` | `组件` | `接口` | `流程`
- **描述**: 该功能的作用
- **交互步骤**: 用户操作的有序列表
- **输入数据**: 所需数据字段及格式
- **状态变化**: 状态机转换
- **异常场景**: 错误情况和边界情况
- **关联功能**: 与其他功能点的交叉引用

### 功能点识别规则

- 每个**独立可操作的页面或屏幕**作为一个单独的功能点
- **列表页**和**详情页**分开为不同功能点
- **表单提交**和**结果展示**分开为不同功能点
- 识别交互元素：按钮、输入框、表格、卡片、下拉框、标签页
- 推断页面间的跳转关系

### 模块分组

按模块/页面分组功能点。一个模块通常对应 PRD 中的一个业务领域或主要导航区域。

---

## 输出格式

### 文件位置

`./prd-output/<timestamp>-prd-analysis.md`

其中 `<timestamp>` 格式为 `YYYYMMDD-HHMMSS`。

### 文件结构

```markdown
---
prd_sources:
  - url: "https://lanhu.app/xxx"
    type: lanhu
  - url: "https://example.feishu.cn/docx/yyy"
    type: feishu
    title: "登录需求文档"
generated_at: "2026-04-23T14:30:52"
---

# PRD 功能点清单

## 模块：用户登录

### 功能点 1：手机号登录

- **类型**: 页面
- **描述**: 用户输入手机号获取验证码并登录
- **交互步骤**:
   1. 输入手机号
   2. 点击获取验证码
   3. 输入验证码
   4. 点击登录
- **输入数据**: 手机号（11位）、验证码（6位数字）
- **状态变化**: 未登录 → 登录中 → 已登录 / 登录失败
- **异常场景**:
   - 手机号格式错误
   - 验证码过期（60秒后）
   - 频繁请求限制
- **关联功能**: 功能点 3（用户注册）

### 功能点 2：密码登录
...
```

### 格式规则

- 使用 YAML frontmatter 存储元数据（`prd_sources`、`generated_at`）
- 使用 `##` 作为模块标题
- 使用 `###` 作为带序号的功能点标题
- 使用列表（而非表格）展示维度 — 更便于人工编辑
- 保持合理的行长度以提高可读性

---

## OpenSpec 对接（手动创建）

**本 skill 不会自动创建 OpenSpec 变更。** 工作流程如下：

1. 运行 `/prd <sources>` 生成功能点清单
2. 检查并编辑生成的 `./prd-output/<timestamp>-prd-analysis.md`
3. 可选择生成 OpenSpec 变更草稿作为参考：
   `./prd-output/<timestamp>-prd-analysis-openspec-draft.md`
4. 确认无误后，手动创建 OpenSpec 变更：
   ```
   /opsx:new <change-name>
   ```
   建议命名：`prd-<YYYYMMDD>[-<主模块名>]`

### OpenSpec 草稿内容

草稿文件按模块组织建议内容：

- **建议变更名**: `prd-<日期>[-<模块>]`
- **建议能力**: 每个检测到的模块一个
- **建议需求**: 从功能点映射
- **建议任务**: 从功能点推导

此草稿仅供参考 — 用户应在创建实际 OpenSpec 变更前审查和调整。

---

## 输出完成提示

处理完所有来源并写入输出文件后，显示：

```
PRD 分析完成 ✓

功能点清单: ./prd-output/<timestamp>-prd-analysis.md
共识别 <N> 个模块，<M> 个功能点。

请检查并确认功能点清单。
确认无误后，运行 `/opsx:new <change-name>` 创建 OpenSpec 变更。
建议变更名: prd-<YYYYMMDD>[-<主模块名>]
```

如果生成了 OpenSpec 草稿，同时显示：
```
变更草稿参考: ./prd-output/<timestamp>-prd-analysis-openspec-draft.md
```

---

## 使用示例

### 示例 1：单个飞书文档
```
/prd https://example.feishu.cn/docx/AbCdEfGh
```

### 示例 2：多个设计稿页面
```
/prd https://lanhu.app/xyz123,https://lanhu.app/abc456
```

### 示例 3：混合来源
```
/prd https://example.feishu.cn/docx/abc,https://modao.cc/xyz,./mockups/login.png
```

### 示例 4：本地 PDF
```
/prd ./docs/requirements-v1.2.pdf
```

---

## 实现说明

- 尽可能并行处理多个来源
- 输出文件设计为可人工编辑 — 使用列表格式而非表格
- 视觉理解准确率取决于 PRD 清晰度；始终将输出标记为"需审查"
- 绝不自动写入 `openspec/changes/` 下的文件
- skill 本身是 `.codebuddy/skills/prd-analyzer/` 下的单个 `SKILL.md` 文件
