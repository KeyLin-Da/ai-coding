import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import markdownItMermaid from 'markdown-it-mermaid';

describe('Mermaid 渲染', () => {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
  md.use(markdownItMermaid);

  it('应该将 mermaid 代码块转换为 div 容器', () => {
    const input = `
\`\`\`mermaid
graph TD
    A[开始] --> B[结束]
\`\`\`
`;
    const result = md.render(input);
    expect(result).toContain('<div class="mermaid"');
    expect(result).toContain('graph TD');
    expect(result).toContain('A[开始]');
    expect(result).toContain('B[结束]');
  });

  it('应该保留普通代码块不变', () => {
    const input = `
\`\`\`javascript
console.log('hello');
\`\`\`
`;
    const result = md.render(input);
    expect(result).toContain('<pre><code class="language-javascript">');
    expect(result).not.toContain('class="mermaid"');
  });

  it('应该支持流程图语法', () => {
    const input = `
\`\`\`mermaid
graph LR
    A[用户] --> B[系统]
    B --> C[数据库]
\`\`\`
`;
    const result = md.render(input);
    expect(result).toContain('class="mermaid"');
    expect(result).toContain('graph LR');
  });

  it('应该支持时序图语法', () => {
    const input = `
\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi
\`\`\`
`;
    const result = md.render(input);
    expect(result).toContain('class="mermaid"');
    expect(result).toContain('sequenceDiagram');
  });

  it('应该支持类图语法', () => {
    const input = `
\`\`\`mermaid
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
\`\`\`
`;
    const result = md.render(input);
    expect(result).toContain('class="mermaid"');
    expect(result).toContain('classDiagram');
  });
});
