import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  Download,
  Ear,
  Eye,
  FileText,
  Film,
  FolderOpen,
  History,
  Home,
  ListChecks,
  Paperclip,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  DEFAULT_REMEDIATION_OPTIONS,
  type AiConfig,
  type CoursePackage,
  type CoursePage,
  type RemediationOptions,
} from './types';
import { auditHtml } from './engine/auditor';
import {
  generateLmsSafeHtml,
  remediateHtml,
  updateImageAltInHtml,
  updateLinkTextInHtml,
} from './engine/remediator';
import { exportRemediatedPackage } from './engine/imscc';
import { generatePlainLanguageSummaryWithAi } from './engine/aiEnhancer';
import { attachCaptionsAndTranscriptToHtml } from './engine/captions';
import {
  clearWorkspaceFromDb,
  exportWorkspaceFile,
  loadWorkspaceFromDb,
  saveWorkspaceToDb,
} from './engine/storage';
import { LandingPage } from './components/LandingPage';
import { ImportView } from './components/ImportView';
import { IssueList } from './components/IssueList';
import { PreviewPane } from './components/PreviewPane';
import { AssistiveStudio } from './components/AssistiveStudio';
import { VideoStudio } from './components/VideoStudio';
import { AiSettingsModal } from './components/AiSettingsModal';
import { ReportExportModal } from './components/ReportExportModal';
import { buildSampleCourse } from './data/sampleCourse';

const AI_STORAGE_KEY = 'accessed_ai_config_v1';

function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AiConfig;
  } catch {
    // ignore storage errors
  }
  return {
    enabled: false,
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function scoreColor(score: number): string {
  if (score >= 90) return '#15803d';
  if (score >= 70) return '#b45309';
  return '#b91c1c';
}

export default function App() {
  const [appMode, setAppMode] = useState<'home' | 'course' | 'video'>('home');
  const [course, setCourse] = useState<CoursePackage | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'issues' | 'assistive' | 'attachments' | 'preview' | 'log' | 'source'
  >('issues');
  const [options, setOptions] = useState<RemediationOptions>(DEFAULT_REMEDIATION_OPTIONS);
  const [aiConfig, setAiConfig] = useState<AiConfig>(loadAiConfig);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [copiedLmsHtml, setCopiedLmsHtml] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Restore crash-proof IndexedDB workspace on startup
  useEffect(() => {
    let mounted = true;
    void loadWorkspaceFromDb().then((saved) => {
      if (!mounted || !saved?.course) return;
      setCourse(saved.course);
      setActivePageId(saved.course.pages[0]?.id || null);
      setLastSavedAt(new Date(saved.savedAt).toLocaleTimeString());
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-save active course workspace to IndexedDB on every edit
  useEffect(() => {
    if (!course) return;
    const timer = setTimeout(() => {
      void saveWorkspaceToDb(course).then(() => {
        setLastSavedAt(new Date().toLocaleTimeString());
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [course]);

  const activePage: CoursePage | null = useMemo(() => {
    if (!course || course.pages.length === 0) return null;
    return course.pages.find((p) => p.id === activePageId) || course.pages[0];
  }, [course, activePageId]);

  const courseStats = useMemo(() => {
    if (!course || course.pages.length === 0) {
      return {
        beforeScore: 100,
        afterScore: 100,
        critical: 0,
        serious: 0,
        moderate: 0,
        totalBefore: 0,
        totalAfter: 0,
      };
    }
    const n = course.pages.length;
    const beforeScore = Math.round(
      course.pages.reduce((s, p) => s + p.originalAudit.score, 0) / n
    );
    const afterScore = Math.round(
      course.pages.reduce((s, p) => s + p.remediatedAudit.score, 0) / n
    );
    const critical = course.pages.reduce((s, p) => s + p.remediatedAudit.counts.critical, 0);
    const serious = course.pages.reduce((s, p) => s + p.remediatedAudit.counts.serious, 0);
    const moderate = course.pages.reduce((s, p) => s + p.remediatedAudit.counts.moderate, 0);
    const totalBefore = course.pages.reduce((s, p) => s + p.originalAudit.counts.total, 0);
    const totalAfter = course.pages.reduce((s, p) => s + p.remediatedAudit.counts.total, 0);
    return { beforeScore, afterScore, critical, serious, moderate, totalBefore, totalAfter };
  }, [course]);

  function handleSaveAiConfig(next: AiConfig) {
    setAiConfig(next);
    try {
      localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setStatusMessage(next.enabled ? 'AI enhancement enabled.' : 'AI enhancement disabled.');
  }

  function handleCourseLoaded(pkg: CoursePackage) {
    setCourse(pkg);
    setActivePageId(pkg.pages[0]?.id || null);
    setActiveTab('issues');
    setSummaryError(null);
    const totalIssues = pkg.pages.reduce((s, p) => s + p.originalAudit.counts.total, 0);
    setStatusMessage(
      `Loaded "${pkg.name}" (${pkg.pages.length} page${pkg.pages.length === 1 ? '' : 's'}) with ${totalIssues} WCAG 2.1 AA issues found.`
    );
  }

  function applyRemediationToPage(page: CoursePage, opts: RemediationOptions): CoursePage {
    const result = remediateHtml(page.originalHtml, opts, page.title);
    const nextAudit = auditHtml(result.html);
    return {
      ...page,
      remediatedHtml: result.html,
      remediatedAudit: nextAudit,
      changes: result.changes,
      isRemediated: true,
    };
  }

  function handleFixEntireCourse() {
    if (!course) return;
    const updatedPages = course.pages.map((p) => applyRemediationToPage(p, options));
    setCourse({ ...course, pages: updatedPages });
    const remaining = updatedPages.reduce((s, p) => s + p.remediatedAudit.counts.total, 0);
    const resolved = Math.max(0, courseStats.totalBefore - remaining);
    setStatusMessage(
      `Auto-fixed entire course: ${resolved} issues resolved, ${remaining} remaining for review.`
    );
  }

  function handleFixActivePage() {
    if (!course || !activePage) return;
    const updated = applyRemediationToPage(activePage, options);
    setCourse({
      ...course,
      pages: course.pages.map((p) => (p.id === activePage.id ? updated : p)),
    });
    setStatusMessage(
      `Auto-fixed "${activePage.title}": score improved from ${activePage.originalAudit.score}% to ${updated.remediatedAudit.score}%.`
    );
  }

  function handleResetActivePage() {
    if (!course || !activePage) return;
    const resetPage: CoursePage = {
      ...activePage,
      remediatedHtml: activePage.originalHtml,
      remediatedAudit: activePage.originalAudit,
      changes: [],
      isRemediated: false,
    };
    setCourse({
      ...course,
      pages: course.pages.map((p) => (p.id === activePage.id ? resetPage : p)),
    });
    setStatusMessage(`Reset "${activePage.title}" to original course HTML.`);
  }

  function handleInlineImageAlt(imgIndex: number, newAlt: string) {
    if (!course || !activePage) return;
    const nextHtml = updateImageAltInHtml(activePage.remediatedHtml, imgIndex, newAlt);
    const nextAudit = auditHtml(nextHtml);
    setCourse({
      ...course,
      pages: course.pages.map((p) =>
        p.id === activePage.id
          ? { ...p, remediatedHtml: nextHtml, remediatedAudit: nextAudit, isRemediated: true }
          : p
      ),
    });
    setStatusMessage('Updated image alt text and re-audited page.');
  }

  function handleInlineLinkText(linkIndex: number, newText: string) {
    if (!course || !activePage) return;
    const nextHtml = updateLinkTextInHtml(activePage.remediatedHtml, linkIndex, newText);
    const nextAudit = auditHtml(nextHtml);
    setCourse({
      ...course,
      pages: course.pages.map((p) =>
        p.id === activePage.id
          ? { ...p, remediatedHtml: nextHtml, remediatedAudit: nextAudit, isRemediated: true }
          : p
      ),
    });
    setStatusMessage('Updated link text and re-audited page.');
  }

  function handleAttachMediaAccessibility(
    mediaTag: 'video' | 'audio' | 'iframe',
    mediaIndex: number,
    payload: {
      vttFileName?: string;
      vttContent?: string;
      transcriptText?: string;
    }
  ) {
    if (!course || !activePage) return;
    const nextHtml = attachCaptionsAndTranscriptToHtml(
      activePage.remediatedHtml,
      mediaTag,
      mediaIndex,
      {
        vttPath: payload.vttFileName,
        language: options.language,
        transcriptText: payload.transcriptText,
      }
    );
    const nextAudit = auditHtml(nextHtml);
    const nextExtraFiles = { ...(course.extraFiles || {}) };
    if (payload.vttFileName && payload.vttContent) {
      nextExtraFiles[payload.vttFileName] = payload.vttContent;
    }
    setCourse({
      ...course,
      extraFiles: nextExtraFiles,
      pages: course.pages.map((p) =>
        p.id === activePage.id
          ? { ...p, remediatedHtml: nextHtml, remediatedAudit: nextAudit, isRemediated: true }
          : p
      ),
    });
    setStatusMessage('Attached closed captions / transcript and re-audited page.');
  }

  async function handleExportCourse() {
    if (!course) return;
    if (course.pages.length === 1 && !course.zipArrayBuffer) {
      const page = course.pages[0];
      const blob = new Blob([page.remediatedHtml], { type: 'text/html;charset=utf-8' });
      const base = course.originalFileName.replace(/\.(html?|xhtml)$/i, '');
      downloadBlob(blob, `${base}-ada-compliant.html`);
      setStatusMessage('Downloaded ADA-remediated HTML page.');
      return;
    }

    const blob = await exportRemediatedPackage(course);
    const ext = course.sourceType === 'imscc' ? '.imscc' : '.zip';
    const base = course.originalFileName.replace(/\.(imscc|zip|html?)$/i, '');
    downloadBlob(blob, `${base}-ada-compliant${ext}`);
    setStatusMessage(`Exported remediated course package (${base}-ada-compliant${ext}).`);
  }

  function handleExportReport() {
    if (!course) return;
    setShowReportModal(true);
  }

  async function handleCopyHtml() {
    if (!activePage) return;
    await navigator.clipboard.writeText(activePage.remediatedHtml);
    setCopiedHtml(true);
    setStatusMessage('Copied full remediated HTML to clipboard.');
    setTimeout(() => setCopiedHtml(false), 2000);
  }

  async function handleCopyLmsSafeHtml() {
    if (!activePage) return;
    const safeHtml = generateLmsSafeHtml(activePage.remediatedHtml);
    await navigator.clipboard.writeText(safeHtml);
    setCopiedLmsHtml(true);
    setStatusMessage('Copied LMS-safe HTML (ready for Canvas/Blackboard editor) to clipboard.');
    setTimeout(() => setCopiedLmsHtml(false), 2000);
  }

  function handleSaveWorkspaceFile() {
    if (!course) return;
    const blob = exportWorkspaceFile(course);
    const base = course.originalFileName.replace(/\.(imscc|zip|html?|accessed|json)$/i, '');
    downloadBlob(blob, `${base}.accessed`);
    setStatusMessage(`Saved portable workspace file (${base}.accessed).`);
  }

  async function handleGenerateAiSummary() {
    if (!course || !activePage) return;
    if (!aiConfig.enabled || (aiConfig.provider !== 'chrome-nano' && !aiConfig.apiKey)) {
      setShowAiModal(true);
      return;
    }
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const summary = await generatePlainLanguageSummaryWithAi(
        aiConfig,
        activePage.remediatedHtml,
        course.courseContext
      );
      setCourse({
        ...course,
        pages: course.pages.map((p) =>
          p.id === activePage.id ? { ...p, aiSummary: summary } : p
        ),
      });
      setStatusMessage('Generated plain-language student summary.');
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not generate summary.');
    } finally {
      setSummaryLoading(false);
    }
  }

  function toggleOption(key: keyof Omit<RemediationOptions, 'language'>) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div>
      <a href="#main-workspace" className="app-skip-link">
        Skip to main content
      </a>

      <div className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </div>

      <header className="topbar">
        <div className="topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="brand-group"
              onClick={() => setAppMode('home')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              aria-label="AccessEd Home"
            >
              <div className="brand-mark" aria-hidden="true">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h1 className="brand-title">AccessEd</h1>
                <p className="brand-subtitle">
                  ADA Title II &amp; WCAG 2.1 AA Course Remediation Studio
                </p>
              </div>
            </button>

            <nav className="primary-nav" aria-label="Main navigation">
              <button
                type="button"
                className="nav-pill"
                aria-current={appMode === 'home' ? 'page' : undefined}
                onClick={() => setAppMode('home')}
              >
                <Home size={14} aria-hidden="true" />
                Overview
              </button>
              <button
                type="button"
                className="nav-pill"
                aria-current={appMode === 'course' ? 'page' : undefined}
                onClick={() => setAppMode('course')}
              >
                <FileText size={14} aria-hidden="true" />
                Course Studio
              </button>
              <button
                type="button"
                className="nav-pill"
                aria-current={appMode === 'video' ? 'page' : undefined}
                onClick={() => setAppMode('video')}
              >
                <Film size={14} aria-hidden="true" />
                Video Studio
              </button>
            </nav>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAiModal(true)}
            >
              <Sparkles size={15} aria-hidden="true" />
              {aiConfig.enabled ? 'AI: Connected' : 'AI Settings (Optional)'}
            </button>

            {appMode === 'course' && course && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSaveWorkspaceFile}
                  title="Download portable .accessed workspace file to pause or share with a TA"
                >
                  <Save size={15} aria-hidden="true" />
                  Save Workspace
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportReport}
                >
                  <FileText size={15} aria-hidden="true" />
                  ADA Report
                </button>
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  onClick={() => void handleExportCourse()}
                >
                  <Download size={15} aria-hidden="true" />
                  Export {course.pages.length > 1 ? 'Course Package' : 'HTML'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleFixEntireCourse}
                >
                  <Wand2 size={15} aria-hidden="true" />
                  Auto-Fix Entire Course
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setCourse(null);
                    setActivePageId(null);
                    setLastSavedAt(null);
                    void clearWorkspaceFromDb();
                  }}
                >
                  <FolderOpen size={15} aria-hidden="true" />
                  New Course
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-workspace">
        {appMode === 'home' ? (
          <LandingPage
            onStartCourseStudio={() => setAppMode('course')}
            onStartVideoStudio={() => setAppMode('video')}
            onTrySampleCourse={() => {
              handleCourseLoaded(buildSampleCourse());
              setAppMode('course');
            }}
          />
        ) : appMode === 'video' ? (
          <VideoStudio
            aiConfig={aiConfig}
            language={options.language}
            onOpenAiSettings={() => setShowAiModal(true)}
            onStatus={setStatusMessage}
          />
        ) : !course || !activePage ? (
          <ImportView
            onCourseLoaded={handleCourseLoaded}
            onOpenVideoStudio={() => setAppMode('video')}
          />
        ) : (
          <div className="workspace">
            {/* Left Sidebar */}
            <aside className="sidebar-stack" aria-label="Course navigation and remediation rules">
              <section className="panel" aria-labelledby="score-heading">
                <div className="panel-header">
                  <h2 id="score-heading">Course Compliance</h2>
                  <span className="badge badge-neutral">WCAG 2.1 AA</span>
                </div>
                <div className="score-summary">
                  <div className="score-row">
                    <span
                      className="score-big"
                      style={{ color: scoreColor(courseStats.afterScore) }}
                    >
                      {courseStats.afterScore}%
                    </span>
                    {courseStats.afterScore > courseStats.beforeScore && (
                      <span className="score-delta">
                        +{courseStats.afterScore - courseStats.beforeScore}% improved
                      </span>
                    )}
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuenow={courseStats.afterScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Overall course compliance score"
                  >
                    <div
                      className="progress-fill"
                      style={{
                        width: `${courseStats.afterScore}%`,
                        background: scoreColor(courseStats.afterScore),
                      }}
                    />
                  </div>
                  <div className="stat-pills">
                    <div className="stat-pill">
                      <span className="stat-pill-num" style={{ color: 'var(--critical)' }}>
                        {courseStats.critical}
                      </span>
                      <span className="stat-pill-label">Critical</span>
                    </div>
                    <div className="stat-pill">
                      <span className="stat-pill-num" style={{ color: 'var(--serious)' }}>
                        {courseStats.serious}
                      </span>
                      <span className="stat-pill-label">Serious</span>
                    </div>
                    <div className="stat-pill">
                      <span className="stat-pill-num" style={{ color: 'var(--moderate)' }}>
                        {courseStats.moderate}
                      </span>
                      <span className="stat-pill-label">Moderate</span>
                    </div>
                  </div>
                  {lastSavedAt && (
                    <p
                      className="field-hint"
                      style={{ margin: '10px 0 0', textAlign: 'center' }}
                    >
                      Auto-saved locally ({lastSavedAt})
                    </p>
                  )}
                </div>
              </section>

              <section className="panel" aria-labelledby="context-heading">
                <div className="panel-header">
                  <h2 id="context-heading">Course Context (AI Prompts)</h2>
                </div>
                <div className="rule-list">
                  <div className="field-group">
                    <label htmlFor="ctx-subject" style={{ fontSize: '0.78rem' }}>
                      Subject Area
                    </label>
                    <input
                      id="ctx-subject"
                      type="text"
                      className="text-input"
                      style={{ minWidth: 0, padding: '6px 8px', fontSize: '0.82rem' }}
                      value={course.courseContext?.subject || ''}
                      onChange={(e) =>
                        setCourse({
                          ...course,
                          courseContext: {
                            subject: e.target.value,
                            level: course.courseContext?.level || '',
                          },
                        })
                      }
                      placeholder="e.g., Cellular Biology, World History"
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="ctx-level" style={{ fontSize: '0.78rem' }}>
                      Academic Level
                    </label>
                    <select
                      id="ctx-level"
                      className="lang-select"
                      value={course.courseContext?.level || ''}
                      onChange={(e) =>
                        setCourse({
                          ...course,
                          courseContext: {
                            subject: course.courseContext?.subject || '',
                            level: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">General Education</option>
                      <option value="Elementary (K-5)">Elementary (K–5)</option>
                      <option value="Middle School (6-8)">Middle School (6–8)</option>
                      <option value="High School (9-12)">High School (9–12)</option>
                      <option value="Undergraduate College">Undergraduate College</option>
                      <option value="Graduate / Professional">Graduate / Professional</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="panel" aria-labelledby="pages-heading">
                <div className="panel-header">
                  <h2 id="pages-heading">Course Pages ({course.pages.length})</h2>
                </div>
                <ul className="page-list">
                  {course.pages.map((p) => {
                    const isActive = p.id === activePage.id;
                    const remCount = p.remediatedAudit.counts.total;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`page-item-btn ${isActive ? 'active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            setActivePageId(p.id);
                            setSummaryError(null);
                          }}
                        >
                          <div className="page-item-top">
                            <span className="page-item-title">{p.title}</span>
                            <span
                              className={`badge ${
                                remCount === 0
                                  ? 'badge-success'
                                  : p.remediatedAudit.counts.critical > 0
                                    ? 'badge-critical'
                                    : 'badge-serious'
                              }`}
                            >
                              {remCount === 0 ? 'Pass' : `${remCount}`}
                            </span>
                          </div>
                          <span className="page-item-path">{p.path}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="panel" aria-labelledby="rules-heading">
                <div className="panel-header">
                  <h2 id="rules-heading" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SlidersHorizontal size={15} aria-hidden="true" />
                    Auto-Fix Rules
                  </h2>
                </div>
                <div className="rule-list">
                  <div className="field-group">
                    <label htmlFor="course-lang" style={{ fontSize: '0.78rem' }}>
                      Primary Course Language
                    </label>
                    <select
                      id="course-lang"
                      className="lang-select"
                      value={options.language}
                      onChange={(e) => setOptions((o) => ({ ...o, language: e.target.value }))}
                    >
                      <option value="en">English (en)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="fr">French (fr)</option>
                      <option value="de">German (de)</option>
                      <option value="zh">Chinese (zh)</option>
                    </select>
                  </div>

                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixDocumentStructure}
                      onChange={() => toggleOption('fixDocumentStructure')}
                    />
                    Lang, Title, Skip Link &amp; Landmarks
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixHeadings}
                      onChange={() => toggleOption('fixHeadings')}
                    />
                    Heading Hierarchy &amp; Fake Headings
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixContrast}
                      onChange={() => toggleOption('fixContrast')}
                    />
                    WCAG AA Color Contrast (4.5:1)
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixTables}
                      onChange={() => toggleOption('fixTables')}
                    />
                    Table Headers (&lt;th scope&gt;) &amp; Captions
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixLinks}
                      onChange={() => toggleOption('fixLinks')}
                    />
                    Descriptive Links &amp; New-Tab Notices
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixImages}
                      onChange={() => toggleOption('fixImages')}
                    />
                    Image Alt Text Starters
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixMediaAndFrames}
                      onChange={() => toggleOption('fixMediaAndFrames')}
                    />
                    Videos, Iframes &amp; Form Labels
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.fixTypographyAndFocus}
                      onChange={() => toggleOption('fixTypographyAndFocus')}
                    />
                    Min Text Size, Tabindex &amp; Marquee
                  </label>
                  <label className="rule-toggle">
                    <input
                      type="checkbox"
                      checked={options.injectAccessibleStyles}
                      onChange={() => toggleOption('injectAccessibleStyles')}
                    />
                    Inject Focus-Ring &amp; Skip-Link CSS
                  </label>
                </div>
              </section>
            </aside>

            {/* Main Page Workspace */}
            <section className="panel" aria-label="Active course page inspector">
              <div className="page-header-bar">
                <div className="page-header-meta">
                  <h2>{activePage.title}</h2>
                  <p>
                    {activePage.path} • Score: {activePage.originalAudit.score}% →{' '}
                    <strong>{activePage.remediatedAudit.score}%</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleCopyLmsSafeHtml()}
                    title="Copies clean HTML without <style> blocks for Canvas/Blackboard/Moodle editors"
                  >
                    {copiedLmsHtml ? (
                      <>
                        <Check size={15} aria-hidden="true" />
                        Copied LMS HTML!
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={15} aria-hidden="true" />
                        Copy LMS-Safe HTML
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={summaryLoading}
                    onClick={() => void handleGenerateAiSummary()}
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    {summaryLoading ? 'Summarizing...' : 'Plain-Language Summary'}
                  </button>
                  {activePage.isRemediated && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleResetActivePage}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      Reset Page
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleFixActivePage}
                  >
                    <Wand2 size={15} aria-hidden="true" />
                    Auto-Fix This Page
                  </button>
                </div>
              </div>

              <div className="workspace-tabs" role="tablist" aria-label="Page inspection views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'issues'}
                  className="tab-btn"
                  onClick={() => setActiveTab('issues')}
                >
                  <ListChecks size={15} aria-hidden="true" />
                  Issues &amp; Fixes ({activePage.remediatedAudit.counts.total})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'assistive'}
                  className="tab-btn"
                  onClick={() => setActiveTab('assistive')}
                >
                  <Ear size={15} aria-hidden="true" />
                  Blind &amp; Deaf/HoH Studio
                </button>
                {(course.attachments?.length || 0) > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'attachments'}
                    className="tab-btn"
                    onClick={() => setActiveTab('attachments')}
                  >
                    <Paperclip size={15} aria-hidden="true" />
                    PDFs &amp; Attachments ({course.attachments?.length || 0})
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'preview'}
                  className="tab-btn"
                  onClick={() => setActiveTab('preview')}
                >
                  <Eye size={15} aria-hidden="true" />
                  Before / After Preview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'log'}
                  className="tab-btn"
                  onClick={() => setActiveTab('log')}
                >
                  <History size={15} aria-hidden="true" />
                  Remediation Log ({activePage.changes.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'source'}
                  className="tab-btn"
                  onClick={() => setActiveTab('source')}
                >
                  <Code2 size={15} aria-hidden="true" />
                  HTML Source
                </button>
              </div>

              <div className="workspace-body">
                {summaryError && (
                  <div className="alert-error" role="alert" style={{ marginBottom: 14 }}>
                    {summaryError}
                  </div>
                )}

                {activePage.aiSummary && (
                  <div className="ai-summary-box">
                    <h3>
                      <Sparkles size={15} aria-hidden="true" />
                      Plain-Language Student Summary (WCAG 3.1.5)
                    </h3>
                    <pre>{activePage.aiSummary}</pre>
                  </div>
                )}

                {activeTab === 'issues' && (
                  <IssueList
                    issues={activePage.remediatedAudit.issues}
                    aiConfig={aiConfig}
                    courseContext={course.courseContext}
                    onUpdateImageAlt={handleInlineImageAlt}
                    onUpdateLinkText={handleInlineLinkText}
                  />
                )}

                {activeTab === 'assistive' && (
                  <AssistiveStudio
                    page={activePage}
                    language={options.language}
                    onAttachMediaAccessibility={handleAttachMediaAccessibility}
                  />
                )}

                {activeTab === 'attachments' && (
                  <div>
                    <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
                      Non-HTML attachments (PDFs, PowerPoint slides, Word documents, and media files)
                      found inside your course package are audited below and included in your
                      downloadable <strong>ADA Compliance Report</strong> as a Manual Action Checklist.
                    </p>
                    <div className="issue-list">
                      {(course.attachments || []).map((att) => (
                        <article key={att.id} className="issue-card">
                          <div className="issue-card-head">
                            <div>
                              <h3 className="issue-title">{att.fileName}</h3>
                              <p className="page-item-path" style={{ margin: '2px 0 0' }}>
                                {att.path} • {(att.sizeBytes / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <div className="issue-tags">
                              <span
                                className={`badge ${
                                  att.status === 'critical'
                                    ? 'badge-critical'
                                    : att.status === 'review'
                                      ? 'badge-serious'
                                      : 'badge-success'
                                }`}
                              >
                                {att.status === 'critical' ? (
                                  <AlertCircle size={12} aria-hidden="true" />
                                ) : att.status === 'review' ? (
                                  <AlertTriangle size={12} aria-hidden="true" />
                                ) : (
                                  <CheckCircle2 size={12} aria-hidden="true" />
                                )}
                                {att.status === 'critical'
                                  ? 'Critical Barrier'
                                  : att.status === 'review'
                                    ? 'Manual Review'
                                    : 'Tagged / OK'}
                              </span>
                              <span className="badge badge-neutral">
                                WCAG {att.wcagCriterion}
                              </span>
                            </div>
                          </div>
                          <p className="issue-desc" style={{ fontWeight: 600 }}>
                            {att.summary}
                          </p>
                          <ul className="check-list">
                            {att.details.map((d, idx) => (
                              <li key={idx}>{d}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'preview' && <PreviewPane page={activePage} />}

                {activeTab === 'log' && (
                  <div>
                    {activePage.changes.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                        No automated fixes have been applied to this page yet. Click{' '}
                        <strong>Auto-Fix This Page</strong> or{' '}
                        <strong>Auto-Fix Entire Course</strong> above to remediate automatically.
                      </p>
                    ) : (
                      <div className="issue-list">
                        {activePage.changes.map((ch) => (
                          <div key={ch.ruleId} className="issue-card">
                            <div className="issue-card-head" style={{ marginBottom: 4 }}>
                              <h3 className="issue-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle2 size={16} color="#15803d" aria-hidden="true" />
                                {ch.summary}
                              </h3>
                              <div className="issue-tags">
                                <span className="badge badge-success">{ch.count}× fixed</span>
                                <span className="badge badge-neutral">WCAG {ch.wcagCriterion}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'source' && (
                  <div>
                    <div className="preview-toolbar">
                      <span className="field-hint">
                        Ready to paste back into Canvas Rich Content Editor (<code>&lt;/&gt;</code>) or Blackboard Ultra.
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          onClick={() => void handleCopyLmsSafeHtml()}
                        >
                          {copiedLmsHtml ? (
                            <>
                              <Check size={14} aria-hidden="true" />
                              Copied LMS-Safe HTML!
                            </>
                          ) : (
                            <>
                              <ClipboardCopy size={14} aria-hidden="true" />
                              Copy LMS-Safe HTML (Canvas/Blackboard)
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void handleCopyHtml()}
                        >
                          {copiedHtml ? (
                            <>
                              <Check size={14} aria-hidden="true" />
                              Copied Full HTML!
                            </>
                          ) : (
                            <>
                              <ClipboardCopy size={14} aria-hidden="true" />
                              Copy Full HTML
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const blob = new Blob([activePage.remediatedHtml], {
                              type: 'text/html;charset=utf-8',
                            });
                            const name = activePage.path.replace(/^.*[\\/]/, '') || 'page.html';
                            downloadBlob(blob, name);
                          }}
                        >
                          <Download size={14} aria-hidden="true" />
                          Download Page HTML
                        </button>
                      </div>
                    </div>
                    <pre className="source-pre">{activePage.remediatedHtml}</pre>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {showAiModal && (
        <AiSettingsModal
          config={aiConfig}
          onSave={handleSaveAiConfig}
          onClose={() => setShowAiModal(false)}
        />
      )}

      {showReportModal && course && (
        <ReportExportModal
          course={course}
          onClose={() => setShowReportModal(false)}
          onDownloaded={(msg) => setStatusMessage(msg)}
        />
      )}
    </div>
  );
}
