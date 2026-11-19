import JSZip from 'jszip';
import { parseCaptionsToTranscript, srtToVtt } from './captions';

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface VideoCheckItem {
  id: string;
  label: string;
  wcag: string;
  audience: 'Deaf / Hard of Hearing' | 'Blind / Low Vision' | 'All Students';
  passed: boolean;
  hint: string;
}

export interface VideoAuditSummary {
  score: number;
  checks: VideoCheckItem[];
}

export function formatVttTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function parseVttTime(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(clean) || 0;
}

export function parseVttCues(raw: string): CaptionCue[] {
  const vtt = srtToVtt(raw);
  const blocks = vtt.split(/\n\s*\n/);
  const cues: CaptionCue[] = [];
  let idx = 1;

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (/^WEBVTT/i.test(lines[0]) || /^NOTE\b/i.test(lines[0])) continue;

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const [startStr, endPart] = lines[timeLineIdx].split('-->');
    const endStr = (endPart || '').trim().split(/\s+/)[0];
    const text = lines.slice(timeLineIdx + 1).join('\n').trim();
    if (!text) continue;

    cues.push({
      id: `cue-${idx++}`,
      start: parseVttTime(startStr),
      end: Math.max(parseVttTime(endStr), parseVttTime(startStr) + 0.5),
      text,
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function serializeCuesToVtt(cues: CaptionCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const lines = ['WEBVTT', ''];
  for (const cue of sorted) {
    if (!cue.text.trim()) continue;
    lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
    lines.push(cue.text.trim());
    lines.push('');
  }
  return lines.join('\n');
}

export function auditVideoAccessibility(params: {
  title: string;
  captionCues: CaptionCue[];
  descriptionCues: CaptionCue[];
  transcriptText: string;
}): VideoAuditSummary {
  const hasTitle = params.title.trim().length >= 3;
  const hasCaptions = params.captionCues.some((c) => c.text.trim().length > 0);
  const hasTranscript =
    params.transcriptText.trim().length >= 15 ||
    parseCaptionsToTranscript(serializeCuesToVtt(params.captionCues)).length >= 15;
  const hasDescriptions = params.descriptionCues.some((c) => c.text.trim().length > 0);

  const checks: VideoCheckItem[] = [
    {
      id: 'title',
      label: 'Descriptive video title & heading',
      wcag: 'WCAG 2.4.2 (A)',
      audience: 'All Students',
      passed: hasTitle,
      hint: 'Provide a clear lesson title so students know what the video covers.',
    },
    {
      id: 'captions',
      label: 'Synchronized closed captions (.vtt)',
      wcag: 'WCAG 1.2.2 (A)',
      audience: 'Deaf / Hard of Hearing',
      passed: hasCaptions,
      hint: 'Add timed captions (upload .vtt/.srt, capture cues, or auto-generate with AI).',
    },
    {
      id: 'transcript',
      label: 'Full searchable text transcript',
      wcag: 'WCAG 1.2.1 (A)',
      audience: 'Deaf / Hard of Hearing',
      passed: hasTranscript,
      hint: 'Provide a complete readable transcript below the video player.',
    },
    {
      id: 'descriptions',
      label: 'Audio / visual scene descriptions',
      wcag: 'WCAG 1.2.5 (AA)',
      audience: 'Blind / Low Vision',
      passed: hasDescriptions,
      hint: 'Describe key visual content (slides, diagrams, whiteboard equations) not spoken aloud.',
    },
    {
      id: 'controls',
      label: 'Keyboard controls & no unmuted autoplay',
      wcag: 'WCAG 1.4.2 / 2.1.1 (A)',
      audience: 'All Students',
      passed: true,
      hint: 'Automatically enforced in the exported ADA-compliant HTML player.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  return { score, checks };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAccessibleVideoPageHtml(params: {
  title: string;
  videoFileName: string;
  language: string;
  captionsFileName?: string;
  descriptionsFileName?: string;
  transcriptText: string;
  descriptionCues: CaptionCue[];
}): string {
  const safeTitle = escapeHtml(params.title || 'Accessible Course Video');
  const safeVideo = escapeHtml(params.videoFileName);
  const safeLang = escapeHtml(params.language || 'en');
  const captionsTrack = params.captionsFileName
    ? `\n        <track kind="captions" src="${escapeHtml(params.captionsFileName)}" srclang="${safeLang}" label="Closed Captions" default />`
    : '';
  const descTrack =
    params.descriptionsFileName && params.descriptionCues.length > 0
      ? `\n        <track kind="descriptions" src="${escapeHtml(params.descriptionsFileName)}" srclang="${safeLang}" label="Audio Descriptions" />`
      : '';

  const descListHtml =
    params.descriptionCues.length > 0
      ? `<ul>\n${params.descriptionCues
          .map(
            (c) =>
              `          <li><strong>[${formatVttTime(c.start).slice(0, 8)}]</strong> ${escapeHtml(c.text)}</li>`
          )
          .join('\n')}\n        </ul>`
      : '<p>No visual-only scene descriptions added.</p>';

  return `<!doctype html>
<html lang="${safeLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 860px; margin: 0 auto; padding: 24px 16px; color: #0f172a; background: #ffffff; }
    .skip-link { position: absolute; top: -48px; left: 12px; background: #0f172a; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .skip-link:focus { top: 12px; outline: 3px solid #0284c7; }
    video { width: 100%; max-height: 520px; background: #000000; border-radius: 8px; }
    details { margin-top: 16px; padding: 12px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; }
    summary { font-weight: 700; cursor: pointer; color: #0f172a; }
    summary:focus-visible, video:focus-visible { outline: 3px solid #0284c7; outline-offset: 2px; }
    .transcript-text { margin-top: 10px; white-space: pre-wrap; color: #1e293b; }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to video lesson</a>
  <main id="main-content">
    <h1>${safeTitle}</h1>
    <figure style="margin: 16px 0;">
      <video controls preload="metadata" aria-label="${safeTitle}">
        <source src="${safeVideo}" />${captionsTrack}${descTrack}
        Your browser does not support HTML5 video. Please read the full transcript below.
      </video>
      <figcaption style="font-size: 0.9rem; color: #475569; margin-top: 6px;">
        Closed captions are enabled by default. Use the CC button in the player to toggle captions.
      </figcaption>
    </figure>

    <details open>
      <summary>Full Text Transcript (Deaf &amp; Hard-of-Hearing Access)</summary>
      <div class="transcript-text">${escapeHtml(params.transcriptText || 'Transcript not provided.')}</div>
    </details>

    <details>
      <summary>Visual &amp; Audio Descriptions (Blind &amp; Low-Vision Access)</summary>
      <div class="transcript-text">
        ${descListHtml}
      </div>
    </details>
  </main>
</body>
</html>
`;
}

export async function exportAccessibleVideoBundle(params: {
  title: string;
  language: string;
  videoFile: File;
  captionCues: CaptionCue[];
  descriptionCues: CaptionCue[];
  transcriptText: string;
}): Promise<Blob> {
  const zip = new JSZip();
  const safeVideoName = params.videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const captionsVtt = serializeCuesToVtt(params.captionCues);
  const descriptionsVtt = serializeCuesToVtt(params.descriptionCues);
  const resolvedTranscript =
    params.transcriptText.trim() || parseCaptionsToTranscript(captionsVtt);

  const html = buildAccessibleVideoPageHtml({
    title: params.title,
    videoFileName: safeVideoName,
    language: params.language,
    captionsFileName: params.captionCues.length > 0 ? 'captions.vtt' : undefined,
    descriptionsFileName: params.descriptionCues.length > 0 ? 'descriptions.vtt' : undefined,
    transcriptText: resolvedTranscript,
    descriptionCues: params.descriptionCues,
  });

  zip.file('index.html', html);
  zip.file('captions.vtt', captionsVtt);
  if (params.descriptionCues.length > 0) {
    zip.file('descriptions.vtt', descriptionsVtt);
  }
  zip.file('transcript.txt', resolvedTranscript);
  zip.file(safeVideoName, params.videoFile);

  return zip.generateAsync({ type: 'blob' });
}
