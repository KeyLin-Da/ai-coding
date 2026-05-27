import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const resultPath = path.join(root, 'coverage', 'vitest-results.json');
const reportDir = path.resolve(root, process.env.AI_DELIVERY_TEST_REPORT_DIR || path.join('..', '..', 'docs', 'ai-skill-delivery-console', 'junit'));
const reportPath = path.join(reportDir, 'index.html');

const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : {};
const tests = result.testResults || result.testResultsData || [];
const numPassed = result.numPassedTests ?? 0;
const numFailed = result.numFailedTests ?? 0;
const numTotal = result.numTotalTests ?? numPassed + numFailed;

fs.mkdirSync(reportDir, { recursive: true });

const rows = tests
  .map((suite) => {
    const name = suite.name || suite.assertionResults?.[0]?.ancestorTitles?.join(' / ') || 'unknown';
    const status = suite.status || (suite.assertionResults?.every((item) => item.status === 'passed') ? 'passed' : 'failed');
    return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(status)}</td></tr>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>AI 需求交付控制台单元测试报告</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 32px; color: #172033; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #dfe6f1; padding: 10px; text-align: left; }
    th { background: #f5f7fb; }
    .ok { color: #16875a; }
    .fail { color: #b42318; }
  </style>
</head>
<body>
  <h1>AI 需求交付控制台单元测试报告</h1>
  <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
  <p>总数：${numTotal}，通过：<span class="ok">${numPassed}</span>，失败：<span class="fail">${numFailed}</span></p>
  <table>
    <thead><tr><th>测试套件</th><th>状态</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="2">暂无详细结果</td></tr>'}</tbody>
  </table>
</body>
</html>`;

fs.writeFileSync(reportPath, html, 'utf8');
console.log(`Wrote ${reportPath}`);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[char];
  });
}
