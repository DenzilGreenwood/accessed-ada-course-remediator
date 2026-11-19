import { useRef, useState } from 'react';
import {
  BookOpen,
  Code2,
  FileArchive,
  FileCheck2,
  Film,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { CoursePackage } from '../types';
import {
  createCoursePage,
  parseCourseArchive,
  parseHtmlFiles,
} from '../engine/imscc';
import { importWorkspaceFile } from '../engine/storage';
import { buildSampleCourse } from '../data/sampleCourse';

interface ImportViewProps {
  onCourseLoaded: (pkg: CoursePackage) => void;
  onOpenVideoStudio: () => void;
}

export function ImportView({ onCourseLoaded, onOpenVideoStudio }: ImportViewProps) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedTitle, setPastedTitle] = useState('Week 1 Course Page');
  const [pastedHtml, setPastedHtml] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setLoading(true);

    try {
      const files = Array.from(fileList);
      const first = files[0];
      if (/\.(accessed|json)$/i.test(first.name)) {
        const pkg = await importWorkspaceFile(first);
        onCourseLoaded(pkg);
      } else if (/\.(imscc|zip)$/i.test(first.name)) {
        const pkg = await parseCourseArchive(first);
        if (pkg.pages.length === 0) {
          setError('No HTML course pages were found inside this archive.');
          return;
        }
        onCourseLoaded(pkg);
      } else {
        const htmlFiles = files.filter((f) => /\.(html?|xhtml)$/i.test(f.name));
        if (htmlFiles.length === 0) {
          setError('Please upload a Canvas/Blackboard .imscc package, .zip archive, .html course files, or a saved .accessed workspace.');
          return;
        }
        const pkg = await parseHtmlFiles(htmlFiles);
        onCourseLoaded(pkg);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not read course file: ${err.message}`
          : 'Could not read course file.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handlePasteSubmit() {
    const trimmed = pastedHtml.trim();
    if (!trimmed) {
      setError('Paste some HTML from your LMS editor (Canvas, Blackboard, Moodle) first.');
      return;
    }
    setError(null);
    const title = pastedTitle.trim() || 'Pasted Course Page';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'course-page';
    onCourseLoaded({
      name: title,
      sourceType: 'paste',
      originalFileName: `${slug}.html`,
      pages: [createCoursePage(`${slug}.html`, trimmed, title)],
    });
  }

  return (
    <div className="import-shell">
      <section className="hero-card" aria-labelledby="hero-heading">
        <div className="hero-badge">
          <ShieldCheck size={15} aria-hidden="true" />
          ADA Title II &amp; WCAG 2.1 Level AA
        </div>
        <h2 id="hero-heading" className="hero-title">
          Make school courses ADA compliant in minutes
        </h2>
        <p className="hero-desc">
          Upload a Canvas, Blackboard, or Moodle course export (<code>.imscc</code> / <code>.zip</code>),
          individual HTML lessons, or paste directly from your LMS editor. AccessEd audits WCAG 2.1 AA
          barriers, applies deterministic fixes offline, and repackages your course ready for re-import.
        </p>

        <div className="import-tabs" role="tablist" aria-label="Import method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            className="tab-btn"
            onClick={() => {
              setMode('upload');
              setError(null);
            }}
          >
            <FileArchive size={16} aria-hidden="true" />
            Upload LMS Package / HTML
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            className="tab-btn"
            onClick={() => {
              setMode('paste');
              setError(null);
            }}
          >
            <Code2 size={16} aria-hidden="true" />
            Paste LMS HTML
          </button>
        </div>

        {mode === 'upload' ? (
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
          >
            <div className="dropzone-icon" aria-hidden="true">
              <Upload size={24} />
            </div>
            <h3>Drop your course export or HTML pages here</h3>
            <p>
              Supports Canvas / Blackboard / D2L <strong>.imscc</strong>, <strong>.zip</strong> packages,{' '}
              <strong>.html / .htm</strong> files, or saved <strong>.accessed</strong> workspaces.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".imscc,.zip,.html,.htm,.xhtml,.accessed,.json"
              multiple
              className="sr-only"
              aria-label="Choose course files to upload"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <div className="dropzone-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} aria-hidden="true" />
                {loading ? 'Reading course...' : 'Choose Course Files'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => onCourseLoaded(buildSampleCourse())}
              >
                <BookOpen size={16} aria-hidden="true" />
                Load Sample BIO 101 Course
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={loading}
                onClick={onOpenVideoStudio}
              >
                <Film size={16} aria-hidden="true" />
                Upload Video (ADA Video Studio)
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label htmlFor="paste-title">Page / Lesson Title</label>
              <input
                id="paste-title"
                type="text"
                className="text-input"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                placeholder="e.g., Week 2 Syllabus & Reading List"
              />
            </div>
            <div className="field-group">
              <label htmlFor="paste-html">Course HTML Source</label>
              <textarea
                id="paste-html"
                className="paste-area"
                value={pastedHtml}
                onChange={(e) => setPastedHtml(e.target.value)}
                placeholder="Paste HTML from Canvas Rich Content Editor (</>), Blackboard Ultra, or an HTML file..."
              />
            </div>
            <div className="paste-footer">
              <span className="field-hint">
                Works with full HTML documents or LMS body snippets.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onCourseLoaded(buildSampleCourse())}
                >
                  <BookOpen size={16} aria-hidden="true" />
                  Try Sample Course
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handlePasteSubmit}
                >
                  Audit Pasted HTML
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert-error" role="alert">
            {error}
          </div>
        )}

        <aside className="info-callout" aria-label="How to export a course from your LMS">
          <h3>Need to export your course from an LMS first?</h3>
          <ul>
            <li>
              <strong>Canvas:</strong> Open your course &rarr; <em>Settings</em> &rarr;{' '}
              <em>Export Course Content</em> &rarr; choose <em>Course</em> &rarr; download the{' '}
              <code>.imscc</code> file and drop it above.
            </li>
            <li>
              <strong>Blackboard / Moodle / D2L:</strong> Export your course as a Common Cartridge (
              <code>.imscc</code>) or ZIP package, or copy HTML directly from any lesson editor into
              the <strong>Paste LMS HTML</strong> tab.
            </li>
            <li>
              <strong>Privacy:</strong> All scanning and deterministic fixes run locally in your
              browser—your course files are never uploaded to an external server.
            </li>
          </ul>
        </aside>
      </section>

      <div className="feature-grid" aria-label="Key capabilities">
        <article className="feature-card">
          <ShieldCheck size={20} color="#0f766e" aria-hidden="true" />
          <h3>15+ WCAG 2.1 AA Rules</h3>
          <p>
            Audits color contrast, heading hierarchy, fake headings, data table headers,
            alt text, vague links, forms, media captions, and landmarks.
          </p>
        </article>
        <article className="feature-card">
          <FileArchive size={20} color="#0369a1" aria-hidden="true" />
          <h3>Native LMS Package Export</h3>
          <p>
            Reads <code>imsmanifest.xml</code> inside <code>.imscc</code> archives and
            repackages fixed pages without breaking images or quiz links.
          </p>
        </article>
        <article className="feature-card">
          <Sparkles size={20} color="#0f766e" aria-hidden="true" />
          <h3>Offline + Optional AI</h3>
          <p>
            All deterministic fixes run 100% locally in your browser. Optionally connect
            Gemini or OpenAI for contextual alt-text &amp; plain-language summaries.
          </p>
        </article>
        <article className="feature-card">
          <FileCheck2 size={20} color="#0369a1" aria-hidden="true" />
          <h3>ADA Compliance Reports</h3>
          <p>
            Export a structured Before/After remediation log documenting every WCAG 2.1 AA
            fix for school or district accessibility records.
          </p>
        </article>
      </div>
    </div>
  );
}
