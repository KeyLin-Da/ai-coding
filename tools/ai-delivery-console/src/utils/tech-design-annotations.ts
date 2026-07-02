import type { TechDesignAnnotation, TechDesignAnnotationAnchor } from '@shared/workflow';

const highlightClass = 'tech-design-annotation-highlight';
const dashVariants = /[\u2010-\u2015\u2212]/g;
const zeroWidthChars = /[\u200B-\u200D\uFEFF]/g;

interface NormalizedContent {
  text: string;
  starts: number[];
  ends: number[];
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(dashVariants, '-')
    .replace(zeroWidthChars, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeContentWithOffsets(content: string): NormalizedContent {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace: { start: number; end: number } | undefined;
  for (let index = 0; index < content.length; ) {
    const codePoint = content.codePointAt(index);
    const raw = codePoint == null ? content[index] : String.fromCodePoint(codePoint);
    const start = index;
    index += raw.length;
    if (zeroWidthChars.test(raw)) {
      zeroWidthChars.lastIndex = 0;
      continue;
    }
    zeroWidthChars.lastIndex = 0;
    if (/\s/.test(raw)) {
      pendingSpace = pendingSpace || { start, end: index };
      pendingSpace.end = index;
      continue;
    }
    const normalized = raw.normalize('NFKC').replace(dashVariants, '-').replace(zeroWidthChars, '');
    if (!normalized) {
      continue;
    }
    if (pendingSpace && text) {
      text += ' ';
      starts.push(pendingSpace.start);
      ends.push(pendingSpace.end);
    }
    pendingSpace = undefined;
    for (let offset = 0; offset < normalized.length; offset += 1) {
      text += normalized[offset];
      starts.push(start);
      ends.push(index);
    }
  }
  return { text, starts, ends };
}

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
  const selectedText = normalizeSearchText(selection.toString());
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
      prefixText: normalizeSearchText(content.slice(Math.max(0, start - 80), start)),
      suffixText: normalizeSearchText(content.slice(end, end + 80)),
      headingPath: headingPath(root, range.startContainer),
      occurrence: occurrenceBefore(content, selectedText, start)
    }
  };
}

function occurrenceBefore(content: string, selectedText: string, start: number): number {
  const selected = normalizeSearchText(selectedText);
  if (!selected) {
    return 1;
  }
  const before = normalizeContentWithOffsets(content.slice(0, start + selectedText.length)).text;
  let count = 0;
  let index = before.indexOf(selected);
  while (index >= 0) {
    count += 1;
    index = before.indexOf(selected, index + selected.length);
  }
  return Math.max(1, count);
}

function locateByOffset(content: string, annotation: TechDesignAnnotation): { start: number; end: number } | undefined {
  const start = annotation.anchor.plainStart;
  const end = annotation.anchor.plainEnd;
  if (start >= 0 && end > start && normalizeSearchText(content.slice(start, end)) === normalizeSearchText(annotation.selectedText)) {
    return { start, end };
  }
  return undefined;
}

function locateByText(content: string, annotation: TechDesignAnnotation): { start: number; end: number } | undefined {
  const selected = normalizeSearchText(annotation.selectedText);
  if (!selected) {
    return undefined;
  }
  const normalizedContent = normalizeContentWithOffsets(content);
  const prefixText = normalizeSearchText(annotation.anchor.prefixText);
  const suffixText = normalizeSearchText(annotation.anchor.suffixText);
  let occurrence = 0;
  let index = normalizedContent.text.indexOf(selected);
  while (index >= 0) {
    occurrence += 1;
    const prefix = normalizedContent.text.slice(Math.max(0, index - prefixText.length - 20), index);
    const suffix = normalizedContent.text.slice(index + selected.length, index + selected.length + suffixText.length + 20);
    const prefixMatches = !prefixText || prefix.includes(prefixText);
    const suffixMatches = !suffixText || suffix.includes(suffixText);
    if ((prefixMatches && suffixMatches) || occurrence === annotation.anchor.occurrence) {
      const start = normalizedContent.starts[index];
      const end = normalizedContent.ends[index + selected.length - 1];
      if (start != null && end != null && end > start) {
        return { start, end };
      }
    }
    index = normalizedContent.text.indexOf(selected, index + selected.length);
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

function containsVisibleText(value: string): boolean {
  return /\S/.test(value.replace(zeroWidthChars, ''));
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
    const selected = node.textContent?.slice(start - nodeStart, end - nodeStart) || '';
    if (end > start && containsVisibleText(selected)) {
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
