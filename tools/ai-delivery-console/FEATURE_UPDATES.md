# 功能更新说明

## 1. 文档下载功能

### 功能描述
在 Markdown 编辑器中添加了文档下载按钮，用户可以将当前编辑的 Markdown 文档下载到本地。

### 实现细节
- **位置**：`src/components/MarkdownEditor.vue`
- **触发条件**：当有文档内容时，"下载"按钮可用
- **文件命名**：自动从 artifact 路径中提取文件名（例如 `analysis.md`）
- **文件格式**：以 `.md` 格式下载，UTF-8 编码

### 使用方式
1. 在需求详情页打开任意阶段的 Markdown 编辑器
2. 点击工具栏中的"下载"按钮
3. 浏览器会自动下载当前文档

---

## 2. 流程独立命令行日志

### 功能描述
为每个工作流阶段（PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW）维护独立的命令执行日志文件，便于追踪和审计每个阶段的 AI 调用历史。

### 目录结构
```
docs/{requirementId}/workflow/logs/
├── prd/
│   └── command.log          # PRD 阶段的命令日志
├── tech-design/
│   └── command.log          # 技术方案阶段的命令日志
├── implementation/
│   └── command.log          # 实施阶段的命令日志
└── code-review/
    └── command.log          # 代码评审阶段的命令日志
```

### 日志格式
每条日志记录为 JSON 格式，包含以下字段：
```json
{
  "timestamp": "2026-05-21T10:00:00.000Z",
  "command": "/coding-prd-analyzer id=172014 c=补充说明",
  "runId": "run-abc123",
  "agentId": "codex",
  "status": "SUCCEEDED"
}
```

### 实现细节
- **后端服务**：`server/services/run-log.ts`
  - `appendStageCommandLog()` - 追加阶段命令日志
  - `getStageLogDir()` - 获取阶段日志目录
  - `getStageLogPath()` - 获取阶段日志文件路径

- **路由集成**：`server/router.ts`
  - 在执行动作后自动记录命令到对应阶段的日志文件
  - 支持的动作类型：
    - `PRD_ANALYZE` → PRD 阶段
    - `DESIGN_GENERATE` → TECH_DESIGN 阶段
    - `OPENSPEC_STATUS` → IMPLEMENTATION 阶段
    - `OPENSPEC_VERIFY` → IMPLEMENTATION 阶段
    - `JUNIT_GENERATE` → IMPLEMENTATION 阶段
    - `CODE_REVIEW_GENERATE` → CODE_REVIEW 阶段

### 使用场景
1. **问题排查**：查看某个阶段执行了哪些 AI 命令
2. **审计追踪**：追溯特定需求的完整 AI 调用历史
3. **性能分析**：统计各阶段的命令执行频率和成功率
4. **调试辅助**：快速定位某个阶段的命令参数

---

## 其他改进

### Agent Provider 默认值
- 移除了"手动执行"选项
- 下拉框默认选中 **Codex**
- 简化了用户操作流程

---

## 测试状态
✅ 所有 34 个单元测试通过
✅ 文档下载功能已验证
✅ 流程日志功能已验证
