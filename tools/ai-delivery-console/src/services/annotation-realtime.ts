export const TECH_DESIGN_ANNOTATION_CHANGED_EVENT = 'ai-delivery:tech-design-annotation-changed';

export interface TechDesignAnnotationChangedDetail {
  requirementPk?: string | number;
  requirementId?: string | number;
  shareId?: string | number;
  annotationId?: string;
  replyId?: string;
  operation?: string;
  eventId?: number;
  eventType?: string;
}

export function dispatchTechDesignAnnotationChanged(detail: TechDesignAnnotationChangedDetail) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(TECH_DESIGN_ANNOTATION_CHANGED_EVENT, { detail }));
}
