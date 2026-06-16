import type { TechDesignAnnotation, TechDesignAnnotationAnchor } from '@shared/workflow';

const highlightClass = 'tech-design-annotation-highlight';

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function plainOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } finally {
    range.detach();
  }
}

function headingPath(root: HTMLElement, startNode: Node): string[] {
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const path: string[] = [];
  for (const heading of headings) {
    const position = heading.compareDocumentPosition(startNode);
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      continue;
    }
    const level = Number(heading.tagName.slice(1));
    path.splice(level - 1);
    const text = heading.textContent?.replace(/\s+/g, ' ').trim();
    if (text) {
      path[level - 1] = text;
    }
  }
  return path.filter(Boolean);
}

export function createAnnotationAnchor(root: HTMLElement, selection: Selection | null = window.getSelection()): { anchor: TechDesignAnnotationAnchor; selectedText: string } | undefined {
  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) {
    return undefined;
  }
  const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
  if (!selectedText) {
    return undefined;
  }
  const content = root.textContent || '';
  const start = plainOffset(root, range.startContainer, range.startOffset);
  const end = plainOffset(root, range.endContainer, range.endOffset);
  return {
    selectedText,
    anchor: {
      plainStart: start,
      plainEnd: end,
      prefixText: content.slice(Math.max(0, start - 80), start).replace(/\s+/g, ' ').trim(),
      suffixText: content.slice(end, end + 80).replace(/\s+/g, ' ').trim(),
      headingPath: headingPath(root, range.startContainer),
      occurrence: occurrenceBefore(content, selectedText, start)
    }
  };
}

function occurrenceBefore(content: string, selectedText: string, start: number): number {
  if (!selectedText) {
    return 1;
  }
  const before = content.slice(0, start + selectedText.length);
  let count = 0;
  let index = before.indexOf(selectedText);
  while (index >= 0) {
    count += 1;
    index = before.indexOf(selectedText, index + selectedText.length);
  }
  return Math.max(1, count);
}

function locateByOffset(content: string, annotation: TechDesignAnnotation): { start: number; end: number } | undefined {
  const start = annotation.anchor.plainStart;
  const end = annotation.anchor.plainEnd;
  if (start >= 0 && end > start && content.slice(start, end).replace(/\s+/g, ' ').trim() === annotation.selectedText) {
    return { start, end };
  }
  return undefined;
}

function locateByText(content: string, annotation: TechDesignAnnotation): { start: number; end: number } | undefined {
  const selected = annotation.selectedText;
  if (!selected) {
    return undefined;
  }
  let occurrence = 0;
  let index = content.indexOf(selected);
  while (index >= 0) {
    occurrence += 1;
    const prefix = content.slice(Math.max(0, index - annotation.anchor.prefixText.length - 20), index).replace(/\s+/g, ' ');
    const suffix = content.slice(index + selected.length, index + selected.length + annotation.anchor.suffixText.length + 20).replace(/\s+/g, ' ');
    const prefixMatches = !annotation.anchor.prefixText || prefix.includes(annotation.anchor.prefixText);
    const suffixMatches = !annotation.anchor.suffixText || suffix.includes(annotation.anchor.suffixText);
    if ((prefixMatches && suffixMatches) || occurrence === annotation.anchor.occurrence) {
      return { start: index, end: index + selected.length };
    }
    index = content.indexOf(selected, index + selected.length);
  }
  return undefined;
}

export function locateAnnotation(root: HTMLElement, annotation: TechDesignAnnotation, currentContentHash?: string): { start: number; end: number } | undefined {
  const content = root.textContent || '';
  if (currentContentHash && currentContentHash === annotation.contentHash) {
    return locateByOffset(content, annotation) || locateByText(content, annotation);
  }
  return locateByText(content, annotation);
}

export function clearAnnotationHighlights(root: HTMLElement): void {
  const highlights = Array.from(root.querySelectorAll(`span.${highlightClass}`));
  for (const highlight of highlights) {
    const parent = highlight.parentNode;
    if (!parent) {
      continue;
    }
    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight);
    }
    parent.removeChild(highlight);
    parent.normalize();
  }
}

function wrapTextRange(node: Text, start: number, end: number, annotation: TechDesignAnnotation): void {
  const text = node.textContent || '';
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const fragment = document.createDocumentFragment();
  if (before) {
    fragment.appendChild(document.createTextNode(before));
  }
  const span = document.createElement('span');
  span.className = highlightClass;
  span.dataset.annotationId = annotation.id;
  span.textContent = selected;
  fragment.appendChild(span);
  if (after) {
    fragment.appendChild(document.createTextNode(after));
  }
  node.parentNode?.replaceChild(fragment, node);
}

function applyHighlight(root: HTMLElement, annotation: TechDesignAnnotation, range: { start: number; end: number }): void {
  const nodes = textNodes(root);
  let cursor = 0;
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  for (const node of nodes) {
    const length = node.textContent?.length || 0;
    const nodeStart = cursor;
    const nodeEnd = cursor + length;
    const start = Math.max(range.start, nodeStart);
    const end = Math.min(range.end, nodeEnd);
    if (end > start) {
      segments.push({ node, start: start - nodeStart, end: end - nodeStart });
    }
    cursor = nodeEnd;
  }
  for (const segment of segments.reverse()) {
    wrapTextRange(segment.node, segment.start, segment.end, annotation);
  }
}

export function applyAnnotationHighlights(
  root: HTMLElement,
  annotations: TechDesignAnnotation[],
  currentContentHash?: string
): Record<string, 'LOCATED' | 'STALE'> {
  clearAnnotationHighlights(root);
  const result: Record<string, 'LOCATED' | 'STALE'> = {};
  for (const annotation of annotations) {
    if (annotation.status === 'RESOLVED') {
      continue;
    }
    const range = locateAnnotation(root, annotation, currentContentHash);
    if (!range) {
      result[annotation.id] = 'STALE';
      continue;
    }
    applyHighlight(root, annotation, range);
    result[annotation.id] = 'LOCATED';
  }
  return result;
}

export const annotationHighlightClass = highlightClass;
