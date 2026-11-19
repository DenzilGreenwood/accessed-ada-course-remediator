import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Info,
  Sigma,
  Sparkles,
  Table2,
  Wrench,
} from 'lucide-react';
import type { AiConfig, AuditIssue, CourseContext, DisabilityGroup, Severity } from '../types';
import {
  describeAsciiDiagramWithAi,
  extractCodeFromScreenshotWithAi,
  extractDataTableFromChartWithAi,
  extractLatexFromEquationWithAi,
  generateAltTextWithAi,
  generateDescriptiveLinkWithAi,
  isVisionAiReady,
} from '../engine/aiEnhancer';
import { ocrImageWithTesseract } from '../engine/pdfRemediator';
import { renderLatexPreviewHtml } from '../engine/mathRemediator';

interface IssueListProps {
  issues: AuditIssue[];
  aiConfig: AiConfig;
  courseContext?: CourseContext;
  onUpdateImageAlt: (imgIndex: number, newAlt: string) => void;
  onUpdateLinkText: (linkIndex: number, newText: string) => void;
  onConvertImageToCodeBlock?: (
    imgIndex: number,
    code: string,
    language: string,
    caption: string
  ) => void;
  onConvertImageToMathMl?: (
    imgIndex: number,
    latex: string,
    plainEnglish: string
  ) => void;
  onAppendCompanionDataTable?: (
    imgIndex: number,
    table: { title: string; headers: string[]; rows: string[][] }
  ) => void;
  onUpdateAsciiDiagramLabel?: (preIndex: number, description: string) => void;
}

type StemToolMode = 'code' | 'math' | 'table';

interface CodeDraft {
  code: string;
  language: string;
  caption: string;
}

interface MathDraft {
  latex: string;
  plainEnglish: string;
}

interface TableDraft {
  title: string;
  headersText: string;
  rowsText: string;
}

export function IssueList({
  issues,
  aiConfig,
  courseContext,
  onUpdateImageAlt,
  onUpdateLinkText,
  onConvertImageToCodeBlock,
  onConvertImageToMathMl,
  onAppendCompanionDataTable,
  onUpdateAsciiDiagramLabel,
}: IssueListProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [disabilityFilter, setDisabilityFilter] = useState<'all' | DisabilityGroup>('all');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [stemToolOpen, setStemToolOpen] = useState<Record<string, StemToolMode | null>>({});
  const [codeDrafts, setCodeDrafts] = useState<Record<string, CodeDraft>>({});
  const [mathDrafts, setMathDrafts] = useState<Record<string, MathDraft>>({});
  const [tableDrafts, setTableDrafts] = useState<Record<string, TableDraft>>({});
  const [stemLoadingId, setStemLoadingId] = useState<string | null>(null);

  const filtered = issues.filter((i) => {
    const matchesSeverity = severityFilter === 'all' || i.severity === severityFilter;
    const matchesDisability =
      disabilityFilter === 'all' || i.disabilities.includes(disabilityFilter);
    return matchesSeverity && matchesDisability;
  });

  if (issues.length === 0) {
    return (
      <div className="empty-success" role="status">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h3>All automated WCAG 2.1 AA checks passed!</h3>
        <p>
          This page has no remaining automated ADA barriers. Do a quick visual check in
          the Preview tab and verify any video caption files before publishing.
        </p>
      </div>
    );
  }

  function extractImgSrc(snippet: string): string {
    const srcMatch = snippet.match(/src=["']([^"']+)["']/i);
    return srcMatch ? srcMatch[1] : '';
  }

  async function handleAiSuggest(issue: AuditIssue) {
    if (!issue.elementRef) return;
    setAiError(null);
    setAiLoadingId(issue.id);
    try {
      if (issue.elementRef.tag === 'img') {
        const src = extractImgSrc(issue.snippet);
        const suggested = await generateAltTextWithAi(
          aiConfig,
          src,
          issue.elementRef.context || '',
          courseContext
        );
        setDraftValues((prev) => ({ ...prev, [issue.id]: suggested }));
      } else if (issue.elementRef.tag === 'a') {
        const hrefMatch = issue.snippet.match(/href=["']([^"']+)["']/i);
        const suggested = await generateDescriptiveLinkWithAi(
          aiConfig,
          hrefMatch ? hrefMatch[1] : '',
          issue.elementRef.currentValue || '',
          issue.elementRef.context || '',
          courseContext
        );
        setDraftValues((prev) => ({ ...prev, [issue.id]: suggested }));
      } else if (issue.elementRef.tag === 'pre') {
        const suggested = await describeAsciiDiagramWithAi(
          aiConfig,
          issue.elementRef.currentValue || issue.snippet,
          courseContext
        );
        setDraftValues((prev) => ({ ...prev, [issue.id]: suggested }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI suggestion failed.');
    } finally {
      setAiLoadingId(null);
    }
  }

  async function handleOpenCodeTool(issue: AuditIssue) {
    const isSame = stemToolOpen[issue.id] === 'code';
    if (isSame) {
      setStemToolOpen((prev) => ({ ...prev, [issue.id]: null }));
      return;
    }
    setStemToolOpen((prev) => ({ ...prev, [issue.id]: 'code' }));
    if (codeDrafts[issue.id]) return;

    const src = extractImgSrc(issue.snippet);
    setCodeDrafts((prev) => ({
      ...prev,
      [issue.id]: { code: '', language: 'python', caption: '' },
    }));

    if (!src) return;
    setAiError(null);
    setStemLoadingId(issue.id);
    try {
      if (isVisionAiReady(aiConfig)) {
        const res = await extractCodeFromScreenshotWithAi(aiConfig, src, courseContext);
        setCodeDrafts((prev) => ({ ...prev, [issue.id]: res }));
      } else if (src.startsWith('data:image/')) {
        const text = await ocrImageWithTesseract(src);
        setCodeDrafts((prev) => ({
          ...prev,
          [issue.id]: {
            code: text,
            language: 'text',
            caption: 'Code transcribed via offline OCR',
          },
        }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Code extraction failed.');
    } finally {
      setStemLoadingId(null);
    }
  }

  async function handleOpenMathTool(issue: AuditIssue) {
    const isSame = stemToolOpen[issue.id] === 'math';
    if (isSame) {
      setStemToolOpen((prev) => ({ ...prev, [issue.id]: null }));
      return;
    }
    setStemToolOpen((prev) => ({ ...prev, [issue.id]: 'math' }));
    if (mathDrafts[issue.id]) return;

    const src = extractImgSrc(issue.snippet);
    setMathDrafts((prev) => ({
      ...prev,
      [issue.id]: { latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', plainEnglish: '' },
    }));

    if (src && isVisionAiReady(aiConfig)) {
      setAiError(null);
      setStemLoadingId(issue.id);
      try {
        const res = await extractLatexFromEquationWithAi(aiConfig, src, courseContext);
        setMathDrafts((prev) => ({ ...prev, [issue.id]: res }));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Equation extraction failed.');
      } finally {
        setStemLoadingId(null);
      }
    }
  }

  async function handleOpenTableTool(issue: AuditIssue) {
    const isSame = stemToolOpen[issue.id] === 'table';
    if (isSame) {
      setStemToolOpen((prev) => ({ ...prev, [issue.id]: null }));
      return;
    }
    setStemToolOpen((prev) => ({ ...prev, [issue.id]: 'table' }));
    if (tableDrafts[issue.id]) return;

    const src = extractImgSrc(issue.snippet);
    setTableDrafts((prev) => ({
      ...prev,
      [issue.id]: {
        title: 'Chart Data Summary',
        headersText: 'Category, Value',
        rowsText: 'Item A, 10\nItem B, 25',
      },
    }));

    if (src && isVisionAiReady(aiConfig)) {
      setAiError(null);
      setStemLoadingId(issue.id);
      try {
        const res = await extractDataTableFromChartWithAi(aiConfig, src, courseContext);
        setTableDrafts((prev) => ({
          ...prev,
          [issue.id]: {
            title: res.title,
            headersText: res.headers.join(', '),
            rowsText: res.rows.map((r) => r.join(', ')).join('\n'),
          },
        }));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Chart data extraction failed.');
      } finally {
        setStemLoadingId(null);
      }
    }
  }

  function renderSeverityIcon(severity: Severity) {
    if (severity === 'critical') return <AlertCircle size={13} aria-hidden="true" />;
    if (severity === 'serious') return <AlertTriangle size={13} aria-hidden="true" />;
    return <Info size={13} aria-hidden="true" />;
  }

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-pills" role="group" aria-label="Filter fixes by severity" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 2 }}>
            Severity:
          </span>
          {(['all', 'critical', 'serious', 'moderate'] as const).map((level) => {
            const count =
              level === 'all'
                ? issues.length
                : issues.filter((i) => i.severity === level).length;
            const label =
              level === 'all'
                ? 'All Fixes Needed'
                : level.charAt(0).toUpperCase() + level.slice(1);
            return (
              <button
                key={level}
                type="button"
                className="filter-pill"
                aria-pressed={severityFilter === level}
                onClick={() => setSeverityFilter(level)}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        <div className="filter-pills" role="group" aria-label="Filter fixes by impacted learner group" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 2 }}>
            Impacted Learners:
          </span>
          {(
            [
              { id: 'all', label: 'All Learner Groups' },
              { id: 'blind', label: 'Blind / Screen Reader' },
              { id: 'deaf-hoh', label: 'Deaf / Hard of Hearing' },
              { id: 'low-vision', label: 'Low Vision' },
            ] as const
          ).map((grp) => {
            const count =
              grp.id === 'all'
                ? issues.length
                : issues.filter((i) => i.disabilities.includes(grp.id)).length;
            return (
              <button
                key={grp.id}
                type="button"
                className="filter-pill"
                aria-pressed={disabilityFilter === grp.id}
                onClick={() => setDisabilityFilter(grp.id)}
              >
                {grp.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {aiError && (
        <div className="alert-error" role="alert" style={{ marginBottom: 14 }}>
          {aiError}
        </div>
      )}

      <div className="issue-list">
        {filtered.map((issue) => {
          const tag = issue.elementRef?.tag;
          const canInlineEdit =
            issue.elementRef && (tag === 'img' || tag === 'a' || tag === 'pre');
          const draft = draftValues[issue.id] ?? issue.elementRef?.currentValue ?? '';
          const activeStemMode = stemToolOpen[issue.id] || null;
          const isStemLoading = stemLoadingId === issue.id;

          return (
            <article key={issue.id} className="issue-card">
              <div className="issue-card-head">
                <h3 className="issue-title">{issue.title}</h3>
                <div className="issue-tags">
                  <span className={`badge badge-${issue.severity}`}>
                    {renderSeverityIcon(issue.severity)}
                    {issue.severity}
                  </span>
                  <span className="badge badge-neutral">
                    WCAG {issue.wcagCriterion} ({issue.wcagLevel})
                  </span>
                  {issue.autoFixable && (
                    <span className="badge badge-success">
                      <Wrench size={11} aria-hidden="true" />
                      Auto-fixable
                    </span>
                  )}
                </div>
              </div>

              <p className="issue-desc">{issue.description}</p>
              <p className="issue-impact">
                <strong>Student impact:</strong> {issue.studentImpact}
              </p>

              <code className="code-snippet">{issue.snippet}</code>

              {canInlineEdit && issue.elementRef && (
                <div className="inline-editor">
                  <label htmlFor={`edit-${issue.id}`} style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {tag === 'img'
                      ? 'Edit Image Alt Text (leave blank for purely decorative images):'
                      : tag === 'pre'
                        ? 'Edit Accessible Diagram Description (aria-label):'
                        : 'Edit Descriptive Link Text:'}
                  </label>
                  <div className="inline-editor-row">
                    <input
                      id={`edit-${issue.id}`}
                      type="text"
                      className="text-input"
                      value={draft}
                      onChange={(e) =>
                        setDraftValues((prev) => ({ ...prev, [issue.id]: e.target.value }))
                      }
                      placeholder={
                        tag === 'img'
                          ? 'Describe what the image teaches...'
                          : tag === 'pre'
                            ? 'Describe the diagram flow or relationships...'
                            : 'e.g., Download Lab 1 Worksheet (PDF)'
                      }
                    />
                    {tag === 'img' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title="Marks purely decorative icons/dividers with empty alt so screen readers skip them"
                        onClick={() => onUpdateImageAlt(issue.elementRef!.index, '')}
                      >
                        Mark Decorative (alt=&quot;&quot;)
                      </button>
                    )}
                    {aiConfig.enabled && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={aiLoadingId === issue.id}
                        onClick={() => void handleAiSuggest(issue)}
                      >
                        <Sparkles size={14} aria-hidden="true" />
                        {aiLoadingId === issue.id ? 'Generating...' : 'AI Suggest'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        if (tag === 'img') {
                          onUpdateImageAlt(issue.elementRef!.index, draft);
                        } else if (tag === 'pre') {
                          onUpdateAsciiDiagramLabel?.(issue.elementRef!.index, draft);
                        } else {
                          onUpdateLinkText(issue.elementRef!.index, draft);
                        }
                      }}
                    >
                      Apply Fix
                    </button>
                  </div>

                  {tag === 'img' && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px dashed var(--border)',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleOpenCodeTool(issue)}
                      >
                        <Code2 size={14} aria-hidden="true" />
                        Convert Screenshot to Code Block
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleOpenMathTool(issue)}
                      >
                        <Sigma size={14} aria-hidden="true" />
                        Convert Equation Image to MathML
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleOpenTableTool(issue)}
                      >
                        <Table2 size={14} aria-hidden="true" />
                        Generate Companion Data Table
                      </button>
                    </div>
                  )}

                  {tag === 'img' && activeStemMode === 'code' && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
                        Code / Terminal Screenshot → Semantic &lt;pre&gt;&lt;code&gt;
                        {isStemLoading && ' (Extracting...)'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          className="text-input"
                          placeholder="Language (e.g. python, bash)"
                          value={codeDrafts[issue.id]?.language ?? 'python'}
                          onChange={(e) =>
                            setCodeDrafts((prev) => ({
                              ...prev,
                              [issue.id]: {
                                ...(prev[issue.id] || { code: '', caption: '' }),
                                language: e.target.value,
                              },
                            }))
                          }
                          style={{ maxWidth: 160 }}
                        />
                        <input
                          type="text"
                          className="text-input"
                          placeholder="Optional figcaption..."
                          value={codeDrafts[issue.id]?.caption ?? ''}
                          onChange={(e) =>
                            setCodeDrafts((prev) => ({
                              ...prev,
                              [issue.id]: {
                                ...(prev[issue.id] || { code: '', language: 'text' }),
                                caption: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <textarea
                        className="text-input"
                        rows={5}
                        placeholder="Paste or edit extracted code/terminal output..."
                        value={codeDrafts[issue.id]?.code ?? ''}
                        onChange={(e) =>
                          setCodeDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { language: 'text', caption: '' }),
                              code: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', fontFamily: 'monospace', marginBottom: 8 }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!codeDrafts[issue.id]?.code.trim()}
                        onClick={() => {
                          const d = codeDrafts[issue.id];
                          if (!d?.code.trim()) return;
                          onConvertImageToCodeBlock?.(
                            issue.elementRef!.index,
                            d.code,
                            d.language,
                            d.caption
                          );
                        }}
                      >
                        Replace Image with Code Block
                      </button>
                    </div>
                  )}

                  {tag === 'img' && activeStemMode === 'math' && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
                        Equation Image → Semantic MathML
                        {isStemLoading && ' (Extracting LaTeX...)'}
                      </div>
                      <input
                        type="text"
                        className="text-input"
                        placeholder="LaTeX expression (without $$)"
                        value={mathDrafts[issue.id]?.latex ?? ''}
                        onChange={(e) =>
                          setMathDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { plainEnglish: '' }),
                              latex: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', fontFamily: 'monospace', marginBottom: 8 }}
                      />
                      <input
                        type="text"
                        className="text-input"
                        placeholder="Optional plain-English aria-label (auto-generated if blank)"
                        value={mathDrafts[issue.id]?.plainEnglish ?? ''}
                        onChange={(e) =>
                          setMathDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { latex: '' }),
                              plainEnglish: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <div
                        style={{
                          padding: '8px 12px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          marginBottom: 8,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: renderLatexPreviewHtml(
                            mathDrafts[issue.id]?.latex || 'x = 0',
                            false
                          ),
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!mathDrafts[issue.id]?.latex.trim()}
                        onClick={() => {
                          const d = mathDrafts[issue.id];
                          if (!d?.latex.trim()) return;
                          onConvertImageToMathMl?.(
                            issue.elementRef!.index,
                            d.latex,
                            d.plainEnglish
                          );
                        }}
                      >
                        Replace Image with MathML
                      </button>
                    </div>
                  )}

                  {tag === 'img' && activeStemMode === 'table' && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
                        Chart / Graph → Companion Data Table (&lt;details&gt;)
                        {isStemLoading && ' (Extracting chart data...)'}
                      </div>
                      <input
                        type="text"
                        className="text-input"
                        placeholder="Chart Title"
                        value={tableDrafts[issue.id]?.title ?? ''}
                        onChange={(e) =>
                          setTableDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { headersText: '', rowsText: '' }),
                              title: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <input
                        type="text"
                        className="text-input"
                        placeholder="Comma-separated column headers (e.g. Year, Enrollment)"
                        value={tableDrafts[issue.id]?.headersText ?? ''}
                        onChange={(e) =>
                          setTableDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { title: '', rowsText: '' }),
                              headersText: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <textarea
                        className="text-input"
                        rows={4}
                        placeholder="One row per line, comma-separated (e.g. 2024, 120)"
                        value={tableDrafts[issue.id]?.rowsText ?? ''}
                        onChange={(e) =>
                          setTableDrafts((prev) => ({
                            ...prev,
                            [issue.id]: {
                              ...(prev[issue.id] || { title: '', headersText: '' }),
                              rowsText: e.target.value,
                            },
                          }))
                        }
                        style={{ width: '100%', fontFamily: 'monospace', marginBottom: 8 }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          const d = tableDrafts[issue.id];
                          if (!d) return;
                          const headers = d.headersText
                            .split(',')
                            .map((h) => h.trim())
                            .filter(Boolean);
                          const rows = d.rowsText
                            .split('\n')
                            .map((line) => line.split(',').map((c) => c.trim()))
                            .filter((r) => r.some(Boolean));
                          if (headers.length === 0 || rows.length === 0) return;
                          onAppendCompanionDataTable?.(issue.elementRef!.index, {
                            title: d.title || 'Chart Data Table',
                            headers,
                            rows,
                          });
                        }}
                      >
                        Inject Companion Data Table
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
