function normalizeRelativePath(relativePath: string): string {
  return String(relativePath || '').replace(/\\/g, '/');
}

function normalizeRequirementPathSegment(requirementId: string): string {
  return String(requirementId || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 50);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isReportRunLogPath(relativePath: string, requirementId?: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (requirementId !== undefined) {
    const safeRequirementId = normalizeRequirementPathSegment(requirementId);
    return new RegExp(`^docs/${escapeRegExp(safeRequirementId)}/reports/run-[^/]*\\.log$`, 'i').test(normalized);
  }
  return /^docs\/[^/]+\/reports\/run-[^/]*\.log$/i.test(normalized);
}
