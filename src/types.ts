export type Severity = 'critical' | 'serious' | 'moderate';

export type WcagPrinciple =
  | 'Perceivable'
  | 'Operable'
  | 'Understandable'
  | 'Robust';

export type DisabilityGroup =
  | 'blind'
  | 'deaf-hoh'
  | 'low-vision'
  | 'motor-cognitive';

export type RuleId =
  | 'html-lang'
  | 'document-title'
  | 'bypass-blocks'
  | 'img-alt'
  | 'img-alt-suspicious'
  | 'svg-accessible-name'
  | 'button-accessible-name'
  | 'iframe-title'
  | 'heading-hierarchy'
  | 'fake-heading'
  | 'table-headers'
  | 'table-caption'
  | 'color-contrast'
  | 'tiny-text'
  | 'link-generic'
  | 'link-new-tab'
  | 'form-label'
  | 'media-accessibility'
  | 'audio-transcript'
  | 'deprecated-distracting'
  | 'positive-tabindex'
  | 'viewport-zoom'
  | 'ascii-diagram'
  | 'raw-latex';

export interface AuditIssue {
  id: string;
  ruleId: RuleId;
  wcagCriterion: string;
  wcagLevel: 'A' | 'AA';
  principle: WcagPrinciple;
  disabilities: DisabilityGroup[];
  severity: Severity;
  title: string;
  description: string;
  studentImpact: string;
  snippet: string;
  autoFixable: boolean;
  needsReview?: boolean;
  /** Index of matching element for inline manual editing (e.g. img index or link index) */
  elementRef?: {
    tag: string;
    index: number;
    currentValue?: string;
    context?: string;
  };
}

export interface AuditResult {
  score: number;
  issues: AuditIssue[];
  counts: {
    critical: number;
    serious: number;
    moderate: number;
    total: number;
    autoFixable: number;
  };
}

export interface RemediationChange {
  ruleId: RuleId;
  wcagCriterion: string;
  summary: string;
  count: number;
  automated: boolean;
}

export interface RemediationOptions {
  language: string;
  fixDocumentStructure: boolean;
  fixHeadings: boolean;
  fixContrast: boolean;
  fixTables: boolean;
  fixLinks: boolean;
  fixImages: boolean;
  fixMediaAndFrames: boolean;
  fixTypographyAndFocus: boolean;
  injectAccessibleStyles: boolean;
}

export const DEFAULT_REMEDIATION_OPTIONS: RemediationOptions = {
  language: 'en',
  fixDocumentStructure: true,
  fixHeadings: true,
  fixContrast: true,
  fixTables: true,
  fixLinks: true,
  fixImages: true,
  fixMediaAndFrames: true,
  fixTypographyAndFocus: true,
  injectAccessibleStyles: true,
};

export interface AttachmentAudit {
  id: string;
  path: string;
  fileName: string;
  kind: 'pdf' | 'pptx' | 'docx' | 'media' | 'other';
  sizeBytes: number;
  status: 'critical' | 'review' | 'ok';
  summary: string;
  details: string[];
  wcagCriterion: string;
  remediated?: boolean;
  remediatedNote?: string;
  companionPagePath?: string;
}

export interface CourseContext {
  subject: string;
  level: string;
}

export interface CoursePage {
  id: string;
  path: string;
  title: string;
  originalHtml: string;
  remediatedHtml: string;
  isFullDocument: boolean;
  isRemediated: boolean;
  originalAudit: AuditResult;
  remediatedAudit: AuditResult;
  changes: RemediationChange[];
  aiSummary?: string;
}

export interface CoursePackage {
  name: string;
  sourceType: 'imscc' | 'zip' | 'html' | 'paste' | 'sample';
  originalFileName: string;
  /** Raw zip buffer kept so we can repackage exact IMSCC/ZIP with updated HTML */
  zipArrayBuffer?: ArrayBuffer;
  /** Extra generated/uploaded assets (e.g. .vtt caption files) bundled on export */
  extraFiles?: Record<string, string>;
  /** Patched binary assets (e.g. repaired .pptx/.docx files) bundled on export */
  extraBinaryFiles?: Record<string, Uint8Array>;
  /** Audited non-HTML attachments inside the .imscc/.zip (PDFs, PowerPoints, Word docs) */
  attachments?: AttachmentAudit[];
  /** Subject & academic level used to tailor AI alt-text and plain-language prompts */
  courseContext?: CourseContext;
  pages: CoursePage[];
}

export type AiProvider = 'gemini' | 'openai' | 'chrome-nano';

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}
