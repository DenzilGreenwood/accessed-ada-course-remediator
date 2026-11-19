import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Ear,
  Eye,
  EyeOff,
  FileArchive,
  FileCheck2,
  Film,
  Keyboard,
  Lock,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';

interface LandingPageProps {
  onStartCourseStudio: () => void;
  onStartVideoStudio: () => void;
  onTrySampleCourse: () => void;
}

export function LandingPage({
  onStartCourseStudio,
  onStartVideoStudio,
  onTrySampleCourse,
}: LandingPageProps) {
  return (
    <div className="landing-shell">
      {/* Hero */}
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="hero-badge">
          <ShieldCheck size={15} aria-hidden="true" />
          ADA Title II &amp; WCAG 2.1 Level AA for Education
        </div>
        <h2 id="landing-hero-title" className="landing-title">
          Make school &amp; university courses ADA compliant—without rebuilding them
        </h2>
        <p className="landing-lead">
          <strong>AccessEd</strong> is an accessibility remediation studio built for teachers,
          professors, and instructional designers. Upload a Canvas, Blackboard, Moodle, or D2L
          course export—or a recorded lecture video—to automatically find WCAG 2.1 AA barriers,
          fix them in seconds, and export compliant materials ready for every student.
        </p>

        <div className="landing-cta-row">
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '11px 18px', fontSize: '0.95rem' }}
            onClick={onStartCourseStudio}
          >
            <FileArchive size={17} aria-hidden="true" />
            Remediate a Course (.imscc / HTML)
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-accent"
            style={{ padding: '11px 18px', fontSize: '0.95rem' }}
            onClick={onStartVideoStudio}
          >
            <Film size={17} aria-hidden="true" />
            Make a Lecture Video ADA Compliant
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '11px 18px', fontSize: '0.95rem' }}
            onClick={onTrySampleCourse}
          >
            <BookOpen size={17} aria-hidden="true" />
            Try Interactive Sample Course
          </button>
        </div>

        <div className="trust-strip" aria-label="Key guarantees">
          <span>
            <Lock size={14} aria-hidden="true" />
            Runs 100% locally in your browser (no course files uploaded to a server)
          </span>
          <span>
            <CheckCircle2 size={14} aria-hidden="true" />
            Deterministic WCAG 2.1 AA auto-fixes work offline
          </span>
          <span>
            <Sparkles size={14} aria-hidden="true" />
            Optional Gemini / OpenAI AI enhancement
          </span>
        </div>
      </section>

      {/* What is AccessEd & Who Does It Help? */}
      <section className="landing-section" aria-labelledby="who-it-helps-title">
        <div className="section-heading">
          <h2 id="who-it-helps-title">What is this for &amp; who does it help?</h2>
          <p>
            Under <strong>ADA Title II</strong>, public K–12 school districts, colleges, and
            universities must ensure digital courses, syllabi, assignments, and videos meet{' '}
            <strong>WCAG 2.1 Level AA</strong> standards. AccessEd removes the technical
            barriers that lock students with disabilities out of online learning:
          </p>
        </div>

        <div className="audience-grid">
          <article className="audience-card">
            <div className="audience-icon" style={{ background: '#ecfdf5', color: '#0f766e' }} aria-hidden="true">
              <EyeOff size={20} />
            </div>
            <h3>Blind &amp; Screen-Reader Students</h3>
            <p>
              Repairs heading hierarchy, adds semantic data-table headers (<code>&lt;th scope&gt;</code>)
              and captions, labels forms/SVGs/buttons, inserts ARIA landmarks, and provides a
              built-in <strong>Screen-Reader Simulator with audio read-aloud</strong> plus{' '}
              <strong>Video Audio Descriptions</strong> (WCAG 1.2.5).
            </p>
          </article>

          <article className="audience-card">
            <div className="audience-icon" style={{ background: '#f0f9ff', color: '#0369a1' }} aria-hidden="true">
              <Ear size={20} />
            </div>
            <h3>Deaf &amp; Hard-of-Hearing Students</h3>
            <p>
              Upload lecture videos or course pages to create or import synchronized{' '}
              <strong>WebVTT closed captions</strong> (converts <code>.srt</code> automatically),
              auto-generate collapsible <strong>full text transcripts</strong> for audio and video,
              and disable disruptive autoplaying media (WCAG 1.2.1, 1.2.2, 1.4.2).
            </p>
          </article>

          <article className="audience-card">
            <div className="audience-icon" style={{ background: '#fff7ed', color: '#9a3412' }} aria-hidden="true">
              <Eye size={20} />
            </div>
            <h3>Low-Vision &amp; Color-Blind Students</h3>
            <p>
              Calculates exact WCAG 2.1 luminance ratios and automatically adjusts low-contrast
              text colors to meet <strong>4.5:1 contrast</strong> while preserving hue, enlarges
              tiny sub-12px fonts, and re-enables mobile pinch-to-zoom (WCAG 1.4.3, 1.4.4).
            </p>
          </article>

          <article className="audience-card">
            <div className="audience-icon" style={{ background: '#eff6ff', color: '#1d4ed8' }} aria-hidden="true">
              <Keyboard size={20} />
            </div>
            <h3>Keyboard &amp; Cognitive Access</h3>
            <p>
              Inserts &ldquo;Skip to main content&rdquo; links and visible focus rings, replaces
              vague &ldquo;click here&rdquo; links and distracting <code>&lt;marquee&gt;</code>{' '}
              tags, fixes broken <code>tabindex</code> order, and optionally creates{' '}
              <strong>Plain-Language Student Summaries</strong> (WCAG 3.1.5).
            </p>
          </article>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-section" aria-labelledby="how-it-works-title">
        <div className="section-heading">
          <h2 id="how-it-works-title">How AccessEd works in 3 simple steps</h2>
          <p>
            No coding required. Keep your existing course content and layout while upgrading
            the underlying HTML and media tracks to WCAG 2.1 Level AA.
          </p>
        </div>

        <ol className="steps-grid">
          <li className="step-card">
            <span className="step-number">1</span>
            <h3>Import Your Course or Video</h3>
            <p>
              Export your course from Canvas, Blackboard, Moodle, or D2L as an{' '}
              <code>.imscc</code> or <code>.zip</code> file, upload individual{' '}
              <code>.html</code> pages, paste from your LMS editor, or drop in a lecture{' '}
              <code>.mp4</code> / <code>.webm</code> video.
            </p>
          </li>
          <li className="step-card">
            <span className="step-number">2</span>
            <h3>Audit, Auto-Fix &amp; Preview</h3>
            <p>
              Click <strong>Auto-Fix Entire Course</strong> to resolve structural, contrast,
              table, heading, and link issues immediately. Inspect side-by-side Before/After
              previews, test with the Screen-Reader Simulator, and attach captions or alt text.
            </p>
          </li>
          <li className="step-card">
            <span className="step-number">3</span>
            <h3>Export &amp; Document Compliance</h3>
            <p>
              Download your remediated <code>.imscc</code> / <code>.zip</code> package (with
              bundled <code>.vtt</code> captions) to re-import straight back into your LMS, plus
              a formal <strong>ADA Compliance Report</strong> documenting every fix.
            </p>
          </li>
        </ol>
      </section>

      {/* Offline vs Optional AI Comparison */}
      <section className="landing-section" aria-labelledby="offline-vs-ai-title">
        <div className="comparison-grid">
          <div className="panel" style={{ padding: 22 }}>
            <h3 id="offline-vs-ai-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wand2 size={18} color="#0f766e" aria-hidden="true" />
              Included 100% Offline (No API Key Needed)
            </h3>
            <ul className="check-list">
              <li>18+ deterministic WCAG 2.1 AA audit checks across every course page</li>
              <li>Automatic color contrast correction (&ge; 4.5:1) preserving original hue</li>
              <li>Heading hierarchy repair &amp; fake bold-paragraph heading conversion</li>
              <li>Data table <code>&lt;thead&gt;</code>, <code>&lt;th scope&gt;</code>, and <code>&lt;caption&gt;</code> upgrades</li>
              <li>Descriptive link text starters &amp; screen-reader new-tab warnings</li>
              <li>Screen-Reader Simulator with spoken audio read-aloud preview</li>
              <li>Video Studio: manual cue capture, <code>.srt</code> &rarr; <code>.vtt</code> conversion &amp; ZIP export</li>
              <li>Formal Markdown ADA Title II Compliance Report generation</li>
            </ul>
          </div>

          <div className="panel" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#0369a1" aria-hidden="true" />
              Optional AI Enhancement (Bring Your Own Key)
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 0 }}>
              Connect your own <strong>Google Gemini</strong> or <strong>OpenAI-compatible</strong>{' '}
              API key in <em>AI Settings</em> (saved only in your browser) to unlock:
            </p>
            <ul className="check-list">
              <li>Contextual <strong>image alt-text generation</strong> from surrounding lesson text</li>
              <li>Smart <strong>vague link rewriting</strong> (&ldquo;click here&rdquo; &rarr; descriptive label)</li>
              <li><strong>Plain-Language Student Summaries</strong> (WCAG 3.1.5 reading-level support)</li>
              <li><strong>One-click Video Auto-Captioning &amp; Audio Descriptions</strong> via Gemini</li>
            </ul>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onStartCourseStudio}
              >
                <FileCheck2 size={15} aria-hidden="true" />
                Open Course Studio
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onStartVideoStudio}
              >
                <Film size={15} aria-hidden="true" />
                Open Video Studio
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
