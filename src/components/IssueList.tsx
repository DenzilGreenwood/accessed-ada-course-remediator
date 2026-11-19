import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { AiConfig, AuditIssue, CourseContext, DisabilityGroup, Severity } from '../types';
import {
  generateAltTextWithAi,
  generateDescriptiveLinkWithAi,
} from '../engine/aiEnhancer';

interface IssueListProps {
  issues: AuditIssue[];
  aiConfig: AiConfig;
  courseContext?: CourseContext;
  onUpdateImageAlt: (imgIndex: number, newAlt: string) => void;
  onUpdateLinkText: (linkIndex: number, newText: string) => void;
}

export function IssueList({
  issues,
  aiConfig,
  courseContext,
  onUpdateImageAlt,
  onUpdateLinkText,
}: IssueListProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [disabilityFilter, setDisabilityFilter] = useState<'all' | DisabilityGroup>('all');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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

  async function handleAiSuggest(issue: AuditIssue) {
    if (!issue.elementRef) return;
    setAiError(null);
    setAiLoadingId(issue.id);
    try {
      if (issue.elementRef.tag === 'img') {
        const srcMatch = issue.snippet.match(/src=["']([^"']+)["']/i);
        const suggested = await generateAltTextWithAi(
          aiConfig,
          srcMatch ? srcMatch[1] : '',
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
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI suggestion failed.');
    } finally {
      setAiLoadingId(null);
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
        <div className="filter-pills" role="group" aria-label="Filter issues by severity">
          {(['all', 'critical', 'serious', 'moderate'] as const).map((level) => {
            const count =
              level === 'all'
                ? issues.length
                : issues.filter((i) => i.severity === level).length;
            return (
              <button
                key={level}
                type="button"
                className="filter-pill"
                aria-pressed={severityFilter === level}
                onClick={() => setSeverityFilter(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        <div className="filter-pills" role="group" aria-label="Filter issues by student disability need">
          {(
            [
              { id: 'all', label: 'All Needs' },
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
          const canInlineEdit =
            issue.elementRef && (issue.elementRef.tag === 'img' || issue.elementRef.tag === 'a');
          const draft = draftValues[issue.id] ?? issue.elementRef?.currentValue ?? '';

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
                    {issue.elementRef.tag === 'img'
                      ? 'Edit Image Alt Text (leave blank for purely decorative images):'
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
                        issue.elementRef.tag === 'img'
                          ? 'Describe what the image teaches...'
                          : 'e.g., Download Lab 1 Worksheet (PDF)'
                      }
                    />
                    {issue.elementRef.tag === 'img' && (
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
                        if (issue.elementRef!.tag === 'img') {
                          onUpdateImageAlt(issue.elementRef!.index, draft);
                        } else {
                          onUpdateLinkText(issue.elementRef!.index, draft);
                        }
                      }}
                    >
                      Apply Fix
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
