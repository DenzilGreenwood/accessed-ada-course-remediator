import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Columns2, Eye } from 'lucide-react';
import type { CoursePage } from '../types';

interface PreviewPaneProps {
  page: CoursePage;
}

function sanitizeForPreview(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: [
      'style',
      'iframe',
      'video',
      'audio',
      'track',
      'marquee',
      'blink',
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
    ],
  });
}

export function PreviewPane({ page }: PreviewPaneProps) {
  const [viewMode, setViewMode] = useState<'split' | 'after' | 'before'>('split');

  const safeOriginal = useMemo(() => sanitizeForPreview(page.originalHtml), [page.originalHtml]);
  const safeRemediated = useMemo(
    () => sanitizeForPreview(page.remediatedHtml),
    [page.remediatedHtml]
  );

  return (
    <div>
      <div className="preview-toolbar">
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
