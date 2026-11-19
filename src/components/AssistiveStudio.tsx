import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Ear,
  EyeOff,
  FileText,
  Play,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import type { CoursePage } from '../types';
import {
  buildStarterVtt,
  extractMediaItems,
  generateScreenReaderPreview,
  parseCaptionsToTranscript,
  srtToVtt,
  type MediaItem,
} from '../engine/captions';

interface AssistiveStudioProps {
  page: CoursePage;
  language: string;
  onAttachMediaAccessibility: (
    mediaTag: 'video' | 'audio' | 'iframe',
    mediaIndex: number,
    payload: {
      vttFileName?: string;
      vttContent?: string;
      transcriptText?: string;
    }
  ) => void;
}

export function AssistiveStudio({
  page,
  language,
  onAttachMediaAccessibility,
}: AssistiveStudioProps) {
  const [subTab, setSubTab] = useState<'blind' | 'deaf'>('blind');
  const [speaking, setSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [vttDrafts, setVttDrafts] = useState<Record<string, string>>({});
  const [transcriptDrafts, setTranscriptDrafts] = useState<Record<string, string>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const srData = useMemo(
    () => generateScreenReaderPreview(page.remediatedHtml),
    [page.remediatedHtml]
  );

  const mediaItems = useMemo(
    () => extractMediaItems(page.remediatedHtml),
    [page.remediatedHtml]
  );

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    return () => {
      if (speechSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSupported, page.id]);

  function handleSpeakToggle() {
    if (!speechSupported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const spokenText = srData.items
      .map((item) => `${item.role}. ${item.text}`)
      .join('. ');

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = language || 'en';
    utterance.rate = speechRate;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function mediaKey(item: MediaItem): string {
    return `${item.tag}-${item.index}`;
  }

  async function handleCaptionFileUpload(item: MediaItem, file: File | undefined) {
    if (!file) return;
    const raw = await file.text();
    const vtt = srtToVtt(raw);
    const extractedTranscript = parseCaptionsToTranscript(vtt);
    const key = mediaKey(item);
    setVttDrafts((prev) => ({ ...prev, [key]: vtt }));
    setTranscriptDrafts((prev) => ({
      ...prev,
      [key]: extractedTranscript || prev[key] || '',
    }));
  }

  function handleApplyMediaFix(item: MediaItem) {
    const key = mediaKey(item);
    const vttContent = vttDrafts[key]?.trim();
    const transcriptText =
      (transcriptDrafts[key] ?? item.transcriptText)?.trim() ||
      (vttContent ? parseCaptionsToTranscript(vttContent) : '');

    const safeSlug = item.src
      .replace(/^.*[\\/]/, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .toLowerCase();
    const vttFileName = vttContent ? `captions/${safeSlug || `media-${item.index + 1}`}.vtt` : undefined;

    onAttachMediaAccessibility(item.tag, item.index, {
      vttFileName,
      vttContent,
      transcriptText,
    });

    setSavedNotice(
      `Saved ${vttFileName ? 'closed captions (.vtt) and ' : ''}accessible transcript for "${item.title}".`
    );
    setTimeout(() => setSavedNotice(null), 4000);
  }

  return (
    <div>
      <div className="filter-bar">
        <div className="filter-pills" role="tablist" aria-label="Assistive technology studio">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'blind'}
            className="filter-pill"
            aria-pressed={subTab === 'blind'}
            onClick={() => setSubTab('blind')}
          >
            <EyeOff size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
            Blind / Screen-Reader Simulator ({srData.items.length} elements)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'deaf'}
            className="filter-pill"
            aria-pressed={subTab === 'deaf'}
            onClick={() => setSubTab('deaf')}
          >
            <Ear size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
            Deaf / Hard-of-Hearing Captions &amp; Transcripts ({mediaItems.length} media)
          </button>
        </div>
      </div>

      {subTab === 'blind' ? (
        <div className="assistive-grid">
          <div className="assistive-card">
            <div className="assistive-card-head">
              <h3>
                <Volume2 size={16} color="#0f766e" aria-hidden="true" />
                Screen-Reader Linearized Readout
              </h3>
              {speechSupported && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label htmlFor="sr-rate" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Speed:
                  </label>
                  <select
                    id="sr-rate"
                    className="lang-select"
                    style={{ width: 'auto', padding: '4px 8px' }}
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  >
                    <option value={0.8}>0.8×</option>
                    <option value={1.0}>1.0×</option>
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                  </select>
                  <button
                    type="button"
                    className={`btn btn-sm ${speaking ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={handleSpeakToggle}
                  >
                    {speaking ? (
                      <>
                        <Square size={13} aria-hidden="true" />
                        Stop Reading
                      </>
                    ) : (
                      <>
                        <Play size={13} aria-hidden="true" />
                        Listen as Screen Reader
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
              This shows the exact reading order and announcements a blind student hears using
              NVDA, JAWS, or VoiceOver. Any remaining barriers are flagged below.
            </p>

            <ol className="sr-readout-list">
              {srData.items.map((item) => (
                <li
                  key={item.id}
                  className={`sr-readout-item ${item.warning ? 'has-warning' : ''}`}
                >
                  <span className="sr-role-pill">{item.role}</span>
                  <span className="sr-text">{item.text}</span>
                  {item.warning && (
                    <span className="badge badge-critical">
                      <AlertTriangle size={11} aria-hidden="true" />
                      {item.warning}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="assistive-side">
            <div className="assistive-card">
              <h3 style={{ margin: '0 0 10px', fontSize: '0.92rem' }}>
                Heading Navigation Outline
              </h3>
              {srData.headings.length === 0 ? (
                <p className="field-hint" style={{ margin: 0 }}>
                  No semantic headings (&lt;h1&gt;–&lt;h6&gt;) found. Blind students rely on
                  headings to skim lessons quickly.
                </p>
              ) : (
                <ul className="outline-list">
                  {srData.headings.map((h, i) => (
                    <li
                      key={i}
                      style={{ paddingLeft: `${Math.max(0, h.level - 1) * 14}px` }}
                    >
                      <span className="badge badge-neutral">H{h.level}</span> {h.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="assistive-card">
              <h3 style={{ margin: '0 0 10px', fontSize: '0.92rem' }}>
                ARIA Landmarks Detected
              </h3>
              {srData.landmarks.length === 0 ? (
                <p className="field-hint" style={{ margin: 0 }}>
                  No landmarks detected yet. Run <strong>Auto-Fix</strong> to add a{' '}
                  <code>&lt;main&gt;</code> landmark and skip link.
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {srData.landmarks.map((lm, i) => (
                    <span key={i} className="badge badge-success">
                      &lt;{lm}&gt;
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Upload <strong>.vtt</strong> or <strong>.srt</strong> caption files (SRT is automatically
            converted to WebVTT), edit closed captions, and inject collapsible{' '}
            <strong>text transcripts</strong> right below videos, audio clips, and YouTube/Vimeo embeds.
            Attached <code>.vtt</code> files are automatically bundled when you export the course package!
          </p>

          {savedNotice && (
            <div
              className="empty-success"
              role="status"
              style={{ padding: '12px 16px', marginBottom: 14, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{savedNotice}</span>
            </div>
          )}

          {mediaItems.length === 0 ? (
            <div className="empty-success">
              <CheckCircle2 size={32} aria-hidden="true" />
              <h3>No audio or video elements on this page</h3>
              <p>
                Switch to another course page (like an assignment or lecture with video/audio) to
                manage closed captions and transcripts.
              </p>
            </div>
          ) : (
            <div className="issue-list">
              {mediaItems.map((item) => {
                const key = mediaKey(item);
                const vttText = vttDrafts[key] ?? '';
                const trText = transcriptDrafts[key] ?? item.transcriptText;

                return (
                  <article key={key} className="issue-card">
                    <div className="issue-card-head">
                      <div>
                        <h3 className="issue-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Captions size={17} color="#0369a1" aria-hidden="true" />
                          {item.title}
                        </h3>
                        <p className="page-item-path" style={{ margin: '2px 0 0' }}>
                          &lt;{item.tag}&gt; • {item.src}
                        </p>
                      </div>
                      <div className="issue-tags">
                        {item.tag === 'video' && (
                          <span className={`badge ${item.hasCaptions ? 'badge-success' : 'badge-critical'}`}>
                            {item.hasCaptions ? 'Captions Attached' : 'Needs .vtt Captions'}
                          </span>
                        )}
                        <span className={`badge ${item.hasTranscript ? 'badge-success' : 'badge-serious'}`}>
                          {item.hasTranscript ? 'Transcript Present' : 'Needs Transcript'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                        <Upload size={14} aria-hidden="true" />
                        Upload .vtt / .srt File
                        <input
                          type="file"
                          accept=".vtt,.srt,text/vtt,text/plain"
                          className="sr-only"
                          onChange={(e) => void handleCaptionFileUpload(item, e.target.files?.[0])}
                        />
                      </label>

                      {item.tag === 'video' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const starter = buildStarterVtt(item.title);
                            setVttDrafts((prev) => ({ ...prev, [key]: starter }));
                            if (!trText) {
                              setTranscriptDrafts((prev) => ({
                                ...prev,
                                [key]: parseCaptionsToTranscript(starter),
                              }));
                            }
                          }}
                        >
                          <FileText size={14} aria-hidden="true" />
                          Insert Starter WebVTT
                        </button>
                      )}
                    </div>

                    {item.tag === 'video' && (
                      <div className="field-group" style={{ marginBottom: 12 }}>
                        <label htmlFor={`vtt-${key}`}>
                          WebVTT Closed Captions (.vtt) — bundled into exported course package
                        </label>
                        <textarea
                          id={`vtt-${key}`}
                          className="paste-area"
                          style={{ minHeight: 110 }}
                          value={vttText}
                          onChange={(e) =>
                            setVttDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="WEBVTT&#10;&#10;00:00:00.000 --> 00:00:05.000&#10;Paste WebVTT or upload an .srt/.vtt file above..."
                        />
                      </div>
                    )}

                    <div className="field-group" style={{ marginBottom: 12 }}>
                      <label htmlFor={`tr-${key}`}>
                        Accessible Text Transcript (embedded as collapsible &lt;details&gt; below the player)
                      </label>
                      <textarea
                        id={`tr-${key}`}
                        className="paste-area"
                        style={{ minHeight: 90, fontFamily: 'var(--font-sans)' }}
                        value={trText}
                        onChange={(e) =>
                          setTranscriptDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="Enter or auto-extract the spoken transcript and important sound cues (e.g., [bell rings], [applause])..."
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      {vttText && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            setTranscriptDrafts((prev) => ({
                              ...prev,
                              [key]: parseCaptionsToTranscript(vttText),
                            }))
                          }
                        >
                          Extract Transcript from Captions
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!vttText.trim() && !trText.trim()}
                        onClick={() => handleApplyMediaFix(item)}
                      >
                        Apply Captions &amp; Transcript to Page
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
