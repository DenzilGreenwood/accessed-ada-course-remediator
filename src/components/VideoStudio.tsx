import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  CheckCircle2,
  CircleAlert,
  Download,
  Ear,
  EyeOff,
  FileText,
  Film,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { AiConfig } from '../types';
import { parseCaptionsToTranscript } from '../engine/captions';
import {
  auditVideoAccessibility,
  buildAccessibleVideoPageHtml,
  exportAccessibleVideoBundle,
  formatVttTime,
  parseVttCues,
  parseVttTime,
  serializeCuesToVtt,
  type CaptionCue,
} from '../engine/videoAda';
import { transcribeVideoWithGemini } from '../engine/aiEnhancer';

interface VideoStudioProps {
  aiConfig: AiConfig;
  language: string;
  onOpenAiSettings: () => void;
  onStatus?: (msg: string) => void;
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

export function VideoStudio({
  aiConfig,
  language,
  onOpenAiSettings,
  onStatus,
}: VideoStudioProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [descriptionCues, setDescriptionCues] = useState<CaptionCue[]>([]);
  const [transcriptText, setTranscriptText] = useState('');
  const [editorTab, setEditorTab] = useState<'captions' | 'descriptions' | 'transcript' | 'html'>('captions');
  const [speakDescriptions, setSpeakDescriptions] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSpokenCueRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoFile) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const captionsVtt = useMemo(() => serializeCuesToVtt(captionCues), [captionCues]);
  const descriptionsVtt = useMemo(() => serializeCuesToVtt(descriptionCues), [descriptionCues]);

  const [captionTrackUrl, setCaptionTrackUrl] = useState<string | null>(null);
  useEffect(() => {
    if (captionCues.length === 0) {
      setCaptionTrackUrl(null);
      return;
    }
    const blob = new Blob([captionsVtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    setCaptionTrackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captionsVtt, captionCues.length]);

  // Speak Audio Descriptions aloud synced to video playback when toggled on
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !speakDescriptions || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const onTimeUpdate = () => {
      const t = video.currentTime;
      const active = descriptionCues.find((c) => t >= c.start && t <= c.end);
      if (active && lastSpokenCueRef.current !== active.id) {
        lastSpokenCueRef.current = active.id;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(active.text);
        u.lang = language || 'en';
        window.speechSynthesis.speak(u);
      } else if (!active) {
        lastSpokenCueRef.current = null;
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      window.speechSynthesis.cancel();
    };
  }, [speakDescriptions, descriptionCues, language]);

  const resolvedTranscript =
    transcriptText.trim() || parseCaptionsToTranscript(captionsVtt);

  const audit = useMemo(
    () =>
      auditVideoAccessibility({
        title,
        captionCues,
        descriptionCues,
        transcriptText: resolvedTranscript,
      }),
    [title, captionCues, descriptionCues, resolvedTranscript]
  );

  const previewHtml = useMemo(() => {
    if (!videoFile) return '';
    return buildAccessibleVideoPageHtml({
      title: title || videoFile.name,
      videoFileName: videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
      language,
      captionsFileName: captionCues.length > 0 ? 'captions.vtt' : undefined,
      descriptionsFileName: descriptionCues.length > 0 ? 'descriptions.vtt' : undefined,
      transcriptText: resolvedTranscript,
      descriptionCues,
    });
  }, [videoFile, title, language, captionCues.length, descriptionCues, resolvedTranscript]);

  function handleSelectVideo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|ogg|m4v)$/i.test(file.name)) {
      setError('Please choose a video file (.mp4, .webm, .mov, or .ogg).');
      return;
    }
    setError(null);
    setVideoFile(file);
    const cleanTitle = file.name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    setTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    setCaptionCues([]);
    setDescriptionCues([]);
    setTranscriptText('');
    onStatus?.(`Loaded video "${file.name}" into Video ADA Studio.`);
  }

  async function handleUploadTrack(file: File | undefined, target: 'captions' | 'descriptions') {
    if (!file) return;
    const raw = await file.text();
    const parsed = parseVttCues(raw);
    if (target === 'captions') {
      setCaptionCues(parsed);
      setTranscriptText(parseCaptionsToTranscript(raw));
      onStatus?.(`Imported ${parsed.length} closed caption cues from ${file.name}.`);
    } else {
      setDescriptionCues(parsed);
      onStatus?.(`Imported ${parsed.length} audio description cues from ${file.name}.`);
    }
  }

  function addCueAtCurrentTime(target: 'captions' | 'descriptions') {
    const current = videoRef.current?.currentTime ?? 0;
    const nextCue: CaptionCue = {
      id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      start: current,
      end: current + 4,
      text:
        target === 'captions'
          ? ''
          : '[Visual description: e.g., Instructor writes equation on whiteboard]',
    };
    if (target === 'captions') {
      setCaptionCues((prev) => [...prev, nextCue].sort((a, b) => a.start - b.start));
    } else {
      setDescriptionCues((prev) => [...prev, nextCue].sort((a, b) => a.start - b.start));
    }
  }

  function updateCue(
    target: 'captions' | 'descriptions',
    id: string,
    patch: Partial<CaptionCue>
  ) {
    const setter = target === 'captions' ? setCaptionCues : setDescriptionCues;
    setter((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCue(target: 'captions' | 'descriptions', id: string) {
    const setter = target === 'captions' ? setCaptionCues : setDescriptionCues;
    setter((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleAiTranscribe() {
    if (!videoFile) return;
    if (!aiConfig.enabled || !aiConfig.apiKey || aiConfig.provider !== 'gemini') {
      onOpenAiSettings();
      return;
    }
    setError(null);
    setAiLoading(true);
    try {
      const result = await transcribeVideoWithGemini(aiConfig, videoFile);
      const capCues = parseVttCues(result.captionsVtt);
      const descCues = parseVttCues(result.descriptionsVtt);
      setCaptionCues(capCues);
      setDescriptionCues(descCues);
      setTranscriptText(parseCaptionsToTranscript(result.captionsVtt));
      onStatus?.(
        `AI generated ${capCues.length} caption cues and ${descCues.length} visual descriptions!`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI video transcription failed.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleExportZip() {
    if (!videoFile) return;
    setExporting(true);
    try {
      const blob = await exportAccessibleVideoBundle({
        title: title || videoFile.name,
        language,
        videoFile,
        captionCues,
        descriptionCues,
        transcriptText: resolvedTranscript,
      });
      const base = videoFile.name.replace(/\.[a-z0-9]+$/i, '');
      downloadBlob(blob, `${base}-ada-compliant-video.zip`);
      onStatus?.(`Exported ADA-compliant video bundle (${base}-ada-compliant-video.zip).`);
    } finally {
      setExporting(false);
    }
  }

  if (!videoFile) {
    return (
      <div className="import-shell">
        <section className="hero-card" aria-labelledby="video-studio-heading">
          <div className="hero-badge">
            <Film size={15} aria-hidden="true" />
            WCAG 1.2.1 • 1.2.2 • 1.2.5 Video Compliance
          </div>
          <h2 id="video-studio-heading" className="hero-title">
            Make any course video ADA compliant
          </h2>
          <p className="hero-desc">
            Upload a recorded lecture or lab video (<code>.mp4</code>, <code>.webm</code>,{' '}
            <code>.mov</code>). Add or AI-generate synchronized <strong>WebVTT closed captions</strong>{' '}
            for Deaf/Hard-of-Hearing students, <strong>audio descriptions</strong> for Blind students,
            and a <strong>full searchable transcript</strong>—then export a ready-to-publish ADA video bundle.
          </p>

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
              handleSelectVideo(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="dropzone-icon" aria-hidden="true">
              <Upload size={24} />
            </div>
            <h3>Drop your lecture video here</h3>
            <p>
              Supports <strong>.mp4</strong>, <strong>.webm</strong>, <strong>.mov</strong>, and{' '}
              <strong>.ogg</strong>. Playback &amp; caption editing run locally in your browser.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov,.ogg"
              className="sr-only"
              aria-label="Choose video file to make ADA compliant"
              onChange={(e) => handleSelectVideo(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
              Choose Video File
            </button>
          </div>

          {error && (
            <div className="alert-error" role="alert">
              {error}
            </div>
          )}

          <aside className="info-callout" aria-label="What makes an educational video ADA compliant">
            <h3>What makes a school video ADA Title II / WCAG 2.1 AA compliant?</h3>
            <ul>
              <li>
                <strong>Closed Captions (WCAG 1.2.2 — Deaf &amp; Hard-of-Hearing):</strong> Timed
                WebVTT captions covering all spoken dialogue plus important sound cues (e.g.,{' '}
                <code>[bell rings]</code>).
              </li>
              <li>
                <strong>Full Text Transcript (WCAG 1.2.1 — Everyone):</strong> A searchable,
                collapsible text transcript placed right below the video player.
              </li>
              <li>
                <strong>Audio / Visual Descriptions (WCAG 1.2.5 — Blind &amp; Low-Vision):</strong>{' '}
                Descriptions of visual-only content (slides, whiteboard equations, lab steps) not
                spoken aloud.
              </li>
            </ul>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace">
      {/* Left Sidebar: Video Compliance Checklist & Exports */}
      <aside className="sidebar-stack" aria-label="Video ADA compliance status">
        <section className="panel">
          <div className="panel-header">
            <h2>Video ADA Score</h2>
            <span className="badge badge-neutral">WCAG 2.1 AA</span>
          </div>
          <div className="score-summary">
            <div className="score-row">
              <span
                className="score-big"
                style={{
                  color: audit.score >= 80 ? '#15803d' : audit.score >= 60 ? '#b45309' : '#b91c1c',
                }}
              >
                {audit.score}%
              </span>
              <span className="badge badge-neutral">
                {audit.checks.filter((c) => c.passed).length}/{audit.checks.length} passed
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={audit.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Video ADA compliance score"
            >
              <div
                className="progress-fill"
                style={{
                  width: `${audit.score}%`,
                  background: audit.score >= 80 ? '#15803d' : audit.score >= 60 ? '#b45309' : '#b91c1c',
                }}
              />
            </div>

            <ul className="outline-list" style={{ marginTop: 12 }}>
              {audit.checks.map((chk) => (
                <li
                  key={chk.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
                >
                  {chk.passed ? (
                    <CheckCircle2 size={16} color="#15803d" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  ) : (
                    <CircleAlert size={16} color="#b91c1c" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{chk.label}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {chk.wcag} • {chk.audience}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Export ADA Video</h2>
          </div>
          <div className="rule-list">
            <button
              type="button"
              className="btn btn-primary"
              disabled={exporting}
              onClick={() => void handleExportZip()}
            >
              <Download size={15} aria-hidden="true" />
              {exporting ? 'Packaging...' : 'Download ADA Bundle (.zip)'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={captionCues.length === 0}
              onClick={() =>
                downloadBlob(new Blob([captionsVtt], { type: 'text/vtt' }), 'captions.vtt')
              }
            >
              <Captions size={14} aria-hidden="true" />
              Download captions.vtt
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={descriptionCues.length === 0}
              onClick={() =>
                downloadBlob(new Blob([descriptionsVtt], { type: 'text/vtt' }), 'descriptions.vtt')
              }
            >
              <EyeOff size={14} aria-hidden="true" />
              Download descriptions.vtt
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                downloadBlob(
                  new Blob([previewHtml], { type: 'text/html;charset=utf-8' }),
                  'accessible-video-page.html'
                )
              }
            >
              <FileText size={14} aria-hidden="true" />
              Download HTML Lesson Page
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setVideoFile(null)}
            >
              Upload Different Video
            </button>
          </div>
        </section>
      </aside>

      {/* Main Studio Panel */}
      <section className="panel" aria-label="Video ADA editor">
        <div className="page-header-bar">
          <div className="page-header-meta" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="video-lesson-title" className="sr-only">
              Video Lesson Title
            </label>
            <input
              id="video-lesson-title"
              type="text"
              className="text-input"
              style={{ fontWeight: 700, fontSize: '1rem', width: '100%', maxWidth: 460 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter descriptive video lesson title..."
            />
            <p style={{ marginTop: 4 }}>
              {videoFile.name} • {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-accent btn-sm"
              disabled={aiLoading}
              onClick={() => void handleAiTranscribe()}
            >
              <Sparkles size={15} aria-hidden="true" />
              {aiLoading
                ? 'AI Transcribing Video...'
                : 'AI Auto-Caption & Describe (Gemini)'}
            </button>
          </div>
        </div>

        <div className="workspace-body">
          {error && (
            <div className="alert-error" role="alert" style={{ marginTop: 0, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* Live Video Player with real WebVTT captions & Audio Description preview */}
          <div style={{ marginBottom: 18 }}>
            {videoUrl && (
              <video
                ref={videoRef}
                controls
                src={videoUrl}
                style={{
                  width: '100%',
                  maxHeight: 360,
                  background: '#000',
                  borderRadius: 10,
                  display: 'block',
                }}
              >
                {captionTrackUrl && (
                  <track
                    kind="captions"
                    src={captionTrackUrl}
                    srcLang={language || 'en'}
                    label="Closed Captions"
                    default
                  />
                )}
              </video>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              <label className="rule-toggle" style={{ fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={speakDescriptions}
                  onChange={(e) => setSpeakDescriptions(e.target.checked)}
                />
                <Volume2 size={15} aria-hidden="true" />
                Speak Audio Descriptions aloud during playback (Blind preview)
              </label>

              <span className="field-hint">
                Live captions appear on the video automatically as you add or edit cues below.
              </span>
            </div>
          </div>

          {/* Sub-tabs for Captions, Descriptions, Transcript, HTML */}
          <div className="import-tabs" role="tablist" aria-label="Video accessibility tracks">
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'captions'}
              className="tab-btn"
              onClick={() => setEditorTab('captions')}
            >
              <Ear size={15} aria-hidden="true" />
              Closed Captions ({captionCues.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'descriptions'}
              className="tab-btn"
              onClick={() => setEditorTab('descriptions')}
            >
              <EyeOff size={15} aria-hidden="true" />
              Audio Descriptions ({descriptionCues.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'transcript'}
              className="tab-btn"
              onClick={() => setEditorTab('transcript')}
            >
              <FileText size={15} aria-hidden="true" />
              Full Transcript
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === 'html'}
              className="tab-btn"
              onClick={() => setEditorTab('html')}
            >
              Accessible HTML Embed
            </button>
          </div>

          {(editorTab === 'captions' || editorTab === 'descriptions') && (
            <div>
              <div className="preview-toolbar">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => addCueAtCurrentTime(editorTab)}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Cue at Current Video Time
                  </button>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={14} aria-hidden="true" />
                    Import .vtt / .srt
                    <input
                      type="file"
                      accept=".vtt,.srt,text/vtt,text/plain"
                      className="sr-only"
                      onChange={(e) => void handleUploadTrack(e.target.files?.[0], editorTab)}
                    />
                  </label>
                </div>
                <span className="field-hint">
                  {editorTab === 'captions'
                    ? 'Include spoken dialogue + sound cues like [music] or [bell rings].'
                    : 'Describe visual-only slides, equations, or actions for blind students.'}
                </span>
              </div>

              {(editorTab === 'captions' ? captionCues : descriptionCues).length === 0 ? (
                <div
                  className="issue-card"
                  style={{ textAlign: 'center', color: 'var(--text-muted)' }}
                >
                  No {editorTab === 'captions' ? 'closed caption' : 'audio description'} cues yet.
                  Play the video and click <strong>Add Cue at Current Video Time</strong>, import a{' '}
                  <code>.vtt</code>/<code>.srt</code> file, or click{' '}
                  <strong>AI Auto-Caption &amp; Describe</strong> above.
                </div>
              ) : (
                <div className="issue-list">
                  {(editorTab === 'captions' ? captionCues : descriptionCues).map((cue) => (
                    <div key={cue.id} className="issue-card" style={{ padding: 12 }}>
                      <div className="inline-editor-row" style={{ alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Jump video to this timestamp"
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.currentTime = cue.start;
                            }
                          }}
                        >
                          {formatVttTime(cue.start).slice(0, 8)}
                        </button>
                        <input
                          type="text"
                          aria-label="Start timestamp"
                          className="text-input"
                          style={{ maxWidth: 115, minWidth: 100, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                          defaultValue={formatVttTime(cue.start)}
                          onBlur={(e) =>
                            updateCue(editorTab, cue.id, { start: parseVttTime(e.target.value) })
                          }
                        />
                        <span aria-hidden="true">→</span>
                        <input
                          type="text"
                          aria-label="End timestamp"
                          className="text-input"
                          style={{ maxWidth: 115, minWidth: 100, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                          defaultValue={formatVttTime(cue.end)}
                          onBlur={(e) =>
                            updateCue(editorTab, cue.id, { end: parseVttTime(e.target.value) })
                          }
                        />
                        <input
                          type="text"
                          aria-label={editorTab === 'captions' ? 'Caption text' : 'Visual description text'}
                          className="text-input"
                          value={cue.text}
                          onChange={(e) => updateCue(editorTab, cue.id, { text: e.target.value })}
                          placeholder={
                            editorTab === 'captions'
                              ? 'Type spoken dialogue or [sound cue]...'
                              : 'Describe what is shown visually on screen...'
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label="Delete cue"
                          onClick={() => removeCue(editorTab, cue.id)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {editorTab === 'transcript' && (
            <div className="field-group">
              <div className="preview-toolbar">
                <label htmlFor="video-transcript-area" style={{ fontWeight: 600 }}>
                  Full Searchable Text Transcript (WCAG 1.2.1)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={captionCues.length === 0}
                  onClick={() => setTranscriptText(parseCaptionsToTranscript(captionsVtt))}
                >
                  Sync Transcript from Captions
                </button>
              </div>
              <textarea
                id="video-transcript-area"
                className="paste-area"
                style={{ fontFamily: 'var(--font-sans)', minHeight: 200 }}
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Type, paste, or sync the full spoken transcript from your captions..."
              />
            </div>
          )}

          {editorTab === 'html' && (
            <div>
              <p className="field-hint" style={{ marginTop: 0 }}>
                This self-contained WCAG 2.1 AA HTML page is automatically included as{' '}
                <code>index.html</code> inside your exported <strong>ADA Video Bundle (.zip)</strong>.
              </p>
              <pre className="source-pre">{previewHtml}</pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
