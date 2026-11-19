import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Columns2, Eye, Sparkles } from 'lucide-react';
import type { CoursePage } from '../types';

interface PreviewPaneProps {
  page: CoursePage;
}

const PREVIEW_BASE_CSS = `
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #0f172a; padding: 14px 18px; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  figure.accessed-code-figure { margin: 14px 0; padding: 12px; background: #0f172a; color: #f8fafc; border-radius: 8px; }
  figure.accessed-code-figure pre { margin: 0; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  figure.accessed-code-figure figcaption { margin-top: 8px; font-size: 0.85em; color: #cbd5e1; }
  .accessed-math { display: inline-block; padding: 2px 6px; border-radius: 4px; background: #f8fafc; }
  div.accessed-math { display: block; margin: 12px 0; padding: 10px; text-align: center; }
  .accessed-data-table { margin: 10px 0 16px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; }
  .accessed-data-table summary { font-weight: 600; cursor: pointer; color: #0f172a; }
`;

const HIGHLIGHT_ADA_CSS = `
  img[alt]:not([alt=""]) { outline: 2px solid #16a34a; outline-offset: 2px; }
  img[alt=""] { outline: 2px dashed #64748b; outline-offset: 2px; opacity: 0.85; }
  figure[role="img"][aria-label], .accessed-math[role="math"][aria-label] {
    border: 1.5px solid #0284c7; border-radius: 6px; padding: 8px 10px; position: relative;
  }
  figure[role="img"][aria-label]::before, .accessed-math[role="math"][aria-label]::after {
    content: "ADA: " attr(aria-label);
    display: inline-block; margin-left: 8px; padding: 2px 7px; border-radius: 999px;
    background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; vertical-align: middle;
  }
  figure[role="img"][aria-label]::before { margin-left: 0; margin-bottom: 6px; }
  th[scope] { background: #dcfce7 !important; color: #14532d !important; }
  table caption { background: #f0fdf4; color: #166534; padding: 4px 8px; border-radius: 4px; font-weight: 700; }
  .accessed-data-table, .accessed-transcript { border-color: #16a34a; background: #f0fdf4; }
`;

export function sanitizeForPreview(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORCE_BODY: false,
    ADD_TAGS: [
      'style',
      'iframe',
      'video',
      'audio',
      'track',
      'marquee',
      'blink',
      'details',
      'summary',
      'figure',
      'figcaption',
      'math',
      'semantics',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'mfrac',
      'msqrt',
      'mtext',
      'annotation',
    ],
    ADD_ATTR: [
      'target',
      'rel',
      'scope',
      'lang',
      'tabindex',
      'controls',
      'autoplay',
      'muted',
      'srclang',
      'kind',
      'label',
      'allowfullscreen',
      'role',
      'aria-label',
      'aria-hidden',
      'xmlns',
      'display',
      'open',
    ],
  });
}

export function buildRemediatedPreviewHtml(
  sanitizedHtml: string,
  highlightFixes: boolean
): string {
  let out = sanitizedHtml;

  // Auto-open injected companion tables & transcripts in the preview so educators see them immediately
  out = out
    .replace(/<details\b([^>]*class="[^"]*accessed-(?:data-table|transcript)[^"]*"[^>]*)>/gi, (m, attrs: string) =>
      /\bopen\b/i.test(attrs) ? m : `<details${attrs} open>`
    );

  const previewStyle = `<style id="accessed-preview-helper-css">${PREVIEW_BASE_CSS}${
    highlightFixes ? HIGHLIGHT_ADA_CSS : ''
  }</style>`;

  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `${previewStyle}</head>`);
  }
  if (/<body[^>]*>/i.test(out)) {
    return out.replace(/<body([^>]*)>/i, `<head>${previewStyle}</head><body$1>`);
  }
  return `<!doctype html><html lang="en"><head>${previewStyle}</head><body>${out}</body></html>`;
}

export function PreviewPane({ page }: PreviewPaneProps) {
  const [viewMode, setViewMode] = useState<'split' | 'after' | 'before'>('split');
  const [highlightFixes, setHighlightFixes] = useState(true);

  const safeOriginal = useMemo(
    () => sanitizeForPreview(page.originalHtml),
    [page.originalHtml]
  );
  const safeRemediated = useMemo(() => {
    const clean = sanitizeForPreview(page.remediatedHtml);
    return buildRemediatedPreviewHtml(clean, highlightFixes);
  }, [page.remediatedHtml, highlightFixes]);

  return (
    <div>
      <div className="preview-toolbar">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div className="filter-pills" role="group" aria-label="Preview mode">
            <button
              type="button"
              className="filter-pill"
              aria-pressed={viewMode === 'split'}
              onClick={() => setViewMode('split')}
            >
              <Columns2 size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
              Side-by-Side
            </button>
            <button
              type="button"
              className="filter-pill"
              aria-pressed={viewMode === 'after'}
              onClick={() => setViewMode('after')}
            >
              <Eye size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
              Remediated Only
            </button>
            <button
              type="button"
              className="filter-pill"
              aria-pressed={viewMode === 'before'}
              onClick={() => setViewMode('before')}
            >
              Original Only
            </button>
          </div>
          <button
            type="button"
            className="filter-pill"
            aria-pressed={highlightFixes}
            onClick={() => setHighlightFixes((v) => !v)}
          >
            <Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
            Highlight ADA Improvements
          </button>
        </div>
        <span className="field-hint">
          Sandboxed preview (scripts disabled). Press Tab inside the Remediated frame to test keyboard focus!
        </span>
      </div>

      <div className={`preview-grid ${viewMode === 'split' ? 'split' : ''}`}>
        {(viewMode === 'split' || viewMode === 'before') && (
          <div className="preview-frame-wrap">
            <div className="preview-frame-label">
              <span>Original Course Page</span>
              <span className="badge badge-neutral">
                Score: {page.originalAudit.score}% ({page.originalAudit.counts.total} issues)
              </span>
            </div>
            <iframe
              key={`orig-${page.id}`}
              title={`Original preview of ${page.title}`}
              className="preview-iframe"
              sandbox=""
              srcDoc={safeOriginal}
            />
          </div>
        )}

        {(viewMode === 'split' || viewMode === 'after') && (
          <div className="preview-frame-wrap">
            <div className="preview-frame-label">
              <span>ADA Remediated Course Page</span>
              <span className="badge badge-success">
                Score: {page.remediatedAudit.score}% ({page.remediatedAudit.counts.total} remaining)
              </span>
            </div>
            <iframe
              key={`rem-${page.id}-${page.remediatedHtml.length}-${highlightFixes ? 'hi' : 'plain'}`}
              title={`Remediated preview of ${page.title}`}
              className="preview-iframe"
              sandbox=""
              srcDoc={safeRemediated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
