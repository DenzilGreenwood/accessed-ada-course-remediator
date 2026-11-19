import { isFullHtmlDocument, parseHtmlDocument } from './auditor';

export interface ScreenReaderItem {
  id: string;
  role: string;
  text: string;
  warning?: string;
}

export interface MediaItem {
  tag: 'video' | 'audio' | 'iframe';
  index: number;
  src: string;
  title: string;
  hasCaptions: boolean;
  captionSrc: string;
  hasTranscript: boolean;
  transcriptText: string;
}

/** Converts SubRip (.srt) subtitle content to valid WebVTT (.vtt) */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (/^WEBVTT/i.test(normalized)) {
    return normalized;
  }
  const converted = normalized
    // Remove numeric sequence lines before timestamps
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2},\d{3})/gm, '')
    // Convert SRT comma milliseconds to VTT dot milliseconds
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}\n`;
}

/** Extracts clean readable transcript paragraphs from WebVTT or SRT text */
export function parseCaptionsToTranscript(raw: string): string {
  const vtt = srtToVtt(raw);
  const lines = vtt.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^WEBVTT/i.test(trimmed)) continue;
    if (/^NOTE\b/i.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/-->/.test(trimmed)) continue;
    // Strip WebVTT voice/formatting tags like <v Speaker> or <i>
    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();
    if (cleaned) textLines.push(cleaned);
  }

  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Creates a valid starter WebVTT template for educators */
export function buildStarterVtt(label: string): string {
  return [
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:04.500',
    `Welcome to ${label}.`,
    '',
    '00:00:04.500 --> 00:00:10.000',
    '[Replace with spoken lecture dialogue and important sound cues, e.g. [chime] or [applause].]',
    '',
  ].join('\n');
}

/** Extracts all video, audio, and embedded video iframes from a course page */
export function extractMediaItems(html: string): MediaItem[] {
  const doc = parseHtmlDocument(html, isFullHtmlDocument(html));
  const items: MediaItem[] = [];

  const checkTranscriptAfter = (el: Element): { has: boolean; text: string } => {
    const next = el.nextElementSibling;
    if (next && next.classList.contains('accessed-transcript')) {
      const p = next.querySelector('.accessed-transcript-body');
      return { has: true, text: (p?.textContent || next.textContent || '').trim() };
    }
    return { has: false, text: '' };
  };

  Array.from(doc.querySelectorAll('video')).forEach((video, index) => {
    const track = video.querySelector('track[kind="captions"], track[kind="subtitles"]');
    const captionSrc = track?.getAttribute('src') || '';
    const src =
      video.getAttribute('src') ||
      video.querySelector('source')?.getAttribute('src') ||
      `video-${index + 1}.mp4`;
    const tr = checkTranscriptAfter(video);
    items.push({
      tag: 'video',
      index,
      src,
      title: video.getAttribute('title') || `Video ${index + 1} (${src.split('/').pop()})`,
      hasCaptions: Boolean(track && captionSrc && captionSrc !== 'captions.vtt'),
      captionSrc,
      hasTranscript: tr.has,
      transcriptText: tr.text,
    });
  });

  Array.from(doc.querySelectorAll('audio')).forEach((audio, index) => {
    const src =
      audio.getAttribute('src') ||
      audio.querySelector('source')?.getAttribute('src') ||
      `audio-${index + 1}.mp3`;
    const tr = checkTranscriptAfter(audio);
    items.push({
      tag: 'audio',
      index,
      src,
      title: audio.getAttribute('title') || `Audio ${index + 1} (${src.split('/').pop()})`,
      hasCaptions: false,
      captionSrc: '',
      hasTranscript: tr.has,
      transcriptText: tr.text,
    });
  });

  Array.from(doc.querySelectorAll('iframe')).forEach((iframe, index) => {
    const src = iframe.getAttribute('src') || '';
    if (!/(youtube\.com|youtu\.be|vimeo\.com|panopto|kaltura|loom\.com)/i.test(src)) {
      return;
    }
    const tr = checkTranscriptAfter(iframe);
    items.push({
      tag: 'iframe',
      index,
      src,
      title: iframe.getAttribute('title') || `Embedded Video ${index + 1}`,
      hasCaptions: false,
      captionSrc: '',
      hasTranscript: tr.has,
      transcriptText: tr.text,
    });
  });

  return items;
}

/**
 * Attaches a .vtt caption track (for <video>) and/or inserts/updates a collapsible
 * accessible transcript (<details class="accessed-transcript">) right after the media element.
 */
export function attachCaptionsAndTranscriptToHtml(
  html: string,
  mediaTag: 'video' | 'audio' | 'iframe',
  mediaIndex: number,
  options: {
    vttPath?: string;
    language?: string;
    transcriptText?: string;
  }
): string {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const elements = Array.from(doc.querySelectorAll(mediaTag));
  const target = elements[mediaIndex];
  if (!target) return html;

  if (mediaTag === 'video' && options.vttPath) {
    let track = target.querySelector('track[kind="captions"], track[kind="subtitles"]');
    if (!track) {
      track = doc.createElement('track');
      track.setAttribute('kind', 'captions');
      target.appendChild(track);
    }
    track.setAttribute('src', options.vttPath);
    track.setAttribute('srclang', options.language || 'en');
    track.setAttribute('label', 'Closed Captions');
    track.setAttribute('default', '');
    if (!target.hasAttribute('controls')) {
      target.setAttribute('controls', '');
    }
    target.removeAttribute('autoplay');
  }

  if (options.transcriptText && options.transcriptText.trim()) {
    let details =
      target.nextElementSibling?.classList.contains('accessed-transcript')
        ? target.nextElementSibling
        : null;

    if (!details) {
      details = doc.createElement('details');
      details.setAttribute('class', 'accessed-transcript');
      const summary = doc.createElement('summary');
      summary.textContent =
        mediaTag === 'audio' ? 'Read Audio Transcript' : 'Read Video Transcript';
      details.appendChild(summary);

      const body = doc.createElement('div');
      body.setAttribute('class', 'accessed-transcript-body');
      details.appendChild(body);
      target.insertAdjacentElement('afterend', details);
    }

    let body = details.querySelector('.accessed-transcript-body');
    if (!body) {
      body = doc.createElement('div');
      body.setAttribute('class', 'accessed-transcript-body');
      details.appendChild(body);
    }
    body.textContent = options.transcriptText.trim();
  }

  return isFullDoc
    ? `<!doctype html>\n${doc.documentElement.outerHTML}`
    : doc.body.innerHTML;
}

/** Generates a linearized screen-reader transcript, heading outline, and landmark summary */
export function generateScreenReaderPreview(html: string): {
  items: ScreenReaderItem[];
  headings: { level: number; text: string }[];
  landmarks: string[];
} {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const items: ScreenReaderItem[] = [];
  const headings: { level: number; text: string }[] = [];
  const landmarks: string[] = [];
  let seq = 1;

  const push = (role: string, text: string, warning?: string) => {
    items.push({ id: `sr-${seq++}`, role, text, warning });
  };

  if (isFullDoc) {
    const title = doc.querySelector('title')?.textContent?.trim();
    const lang = doc.documentElement.getAttribute('lang')?.trim();
    push(
      'Document',
      `Page title: "${title || '(untitled)'}" • Language: ${lang || 'not declared'}`,
      !lang || !title ? 'Missing lang or title attribute' : undefined
    );
  }

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'head'].includes(tag)) return;
    if (el.getAttribute('aria-hidden') === 'true') return;

    const roleAttr = el.getAttribute('role')?.toLowerCase();
    if (roleAttr === 'math') {
      const label = el.getAttribute('aria-label')?.trim() || (el.textContent || '').trim();
      push('Math', label || 'Mathematical equation');
      return;
    }
    if (roleAttr === 'img') {
      const label = el.getAttribute('aria-label')?.trim() || el.querySelector('figcaption')?.textContent?.trim();
      push('Diagram / Image', label || 'Labeled figure', !label ? 'Missing aria-label on role="img"' : undefined);
      return;
    }

    if (['header', 'nav', 'main', 'aside', 'footer'].includes(tag)) {
      landmarks.push(tag);
      push('Landmark', `Entered ${tag} region`);
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag.slice(1), 10);
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      headings.push({ level, text: text || '(empty heading)' });
      push(`Heading ${level}`, text || '(empty heading)', !text ? 'Empty heading' : undefined);
      return;
    }

    if (tag === 'img') {
      const alt = el.getAttribute('alt');
      if (alt === null) {
        push('Image', `Unlabeled graphic (${el.getAttribute('src') || 'image'})`, 'Missing alt text!');
      } else if (alt === '') {
        // Decorative image intentionally skipped by screen readers
        return;
      } else {
        push('Image', alt);
      }
      return;
    }

    if (tag === 'svg') {
      const label =
        el.getAttribute('aria-label') ||
        el.querySelector('title')?.textContent?.trim();
      push(
        'Graphic',
        label || 'Unlabeled SVG graphic',
        !label ? 'Missing SVG <title> or aria-label' : undefined
      );
      return;
    }

    if (tag === 'a' && el.hasAttribute('href')) {
      const label = (el.getAttribute('aria-label') || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      push('Link', label || '(empty link)', !label ? 'Empty link text' : undefined);
      return;
    }

    if (tag === 'table') {
      const caption = el.querySelector('caption')?.textContent?.trim();
      const rows = el.querySelectorAll('tr').length;
      const thCount = el.querySelectorAll('th').length;
      push(
        'Table',
        `${caption || 'Untitled table'} (${rows} rows, ${thCount} header cells)`,
        thCount === 0 ? 'No <th> headers — blind users cannot map cells to columns' : undefined
      );
      return;
    }

    if (tag === 'iframe') {
      const title = el.getAttribute('title')?.trim();
      push('Frame', title || 'Unlabeled embedded frame', !title ? 'Missing iframe title' : undefined);
      return;
    }

    if (tag === 'video' || tag === 'audio') {
      const hasTrack = Boolean(el.querySelector('track[kind="captions"], track[kind="subtitles"]'));
      push(
        tag === 'video' ? 'Video' : 'Audio',
        `${tag.toUpperCase()} player (${el.getAttribute('src') || 'embedded media'})`,
        tag === 'video' && !hasTrack ? 'Missing closed captions' : undefined
      );
      return;
    }

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (tag === 'input' && el.getAttribute('type') === 'hidden') return;
      const id = el.getAttribute('id');
      const labelEl = id ? doc.querySelector(`label[for="${id}"]`) : el.closest('label');
      const label =
        el.getAttribute('aria-label') || labelEl?.textContent?.trim() || '';
      push(
        `Form ${tag}`,
        label || `Unlabeled ${tag}`,
        !label ? 'Missing accessible label' : undefined
      );
      return;
    }

    if (tag === 'p' || tag === 'li' || tag === 'summary') {
      // If paragraph contains links/images, walk children so links are announced; otherwise announce text
      const hasInteractive = Boolean(el.querySelector('a, img, input, select, textarea, button'));
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) {
        push(tag === 'li' ? 'List item' : tag === 'summary' ? 'Expandable' : 'Text', text);
      }
      if (!hasInteractive) return;
    }

    for (const child of Array.from(el.children)) {
      walk(child);
    }
  };

  walk(doc.body);

  return { items, headings, landmarks };
}
