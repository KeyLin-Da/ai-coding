import fs from 'node:fs/promises';
import type { ReviewIssue } from '../../shared/workflow';

function parseIssueRow(line: string, severity: ReviewIssue['severity'], sourcePath: string): ReviewIssue | null {
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length < 4 || cells[0] === 'ID' || cells[0].includes('---')) {
    return null;
  }
  const id = cells[0];
  const file = cells[2] || '';
  const title = cells[3] || line;
  const statusText = cells[cells.length - 1] || '';
  const status: ReviewIssue['status'] = statusText.includes('已修复')
    ? 'FIXED'
    : statusText.includes('已知') || statusText.includes('接受')
      ? 'ACCEPTED'
      : statusText.includes('失效')
        ? 'INVALID'
        : 'OPEN';
  return {
    id,
    stage: 'CODE_REVIEW',
    severity,
    title: file ? `${file}: ${title}` : title,
    sourcePath,
    status,
    recommendation: severity === 'BLOCKER' ? '修复阻断问题后重新执行 OpenSpec 验证、单元测试和代码评审' : '评估是否纳入本轮优化'
  };
}

export async function parseCodeReviewSummary(summaryPath: string): Promise<ReviewIssue[]> {
  const content = await fs.readFile(summaryPath, 'utf8');
  const lines = content.split('\n');
  const issues: ReviewIssue[] = [];
  let severity: ReviewIssue['severity'] | null = null;

  for (const line of lines) {
    if (line.startsWith('### ❌') || line.includes('严重问题')) {
      severity = 'BLOCKER';
      continue;
    }
    if (line.startsWith('### ⚠️') || line.includes('建议优化')) {
      severity = 'WARNING';
      continue;
    }
    if (line.startsWith('### ') && !line.includes('严重问题') && !line.includes('建议优化')) {
      severity = null;
    }
    if (severity && line.trim().startsWith('|')) {
      const issue = parseIssueRow(line, severity, summaryPath);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  return issues;
}
