import type { RemediationChange, RemediationOptions, RuleId } from '../types';
import {
  getEffectiveBackground,
  isFakeHeadingParagraph,
  isFullHtmlDocument,
  parseHtmlDocument,
} from './auditor';
import {
  findAccessibleColor,
  getContrastRatio,
  parseColor,
  parseFontSizePx,
} from './contrast';

const ACCESSIBLE_STYLE_ID = 'accessed-ada-styles';

const ACCESSIBLE_CSS = `
/* AccessEd ADA / WCAG 2.1 AA Accessibility Enhancements */
.skip-link {
  position: absolute;
  top: -48px;
  left: 12px;
  background: #0f172a;
  color: #ffffff;
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 600;
  z-index: 10000;
  text-decoration: none;
}
.skip-link:focus {
  top: 12px;
  outline: 3px solid #0284c7;
  outline-offset: 2px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
  outline: 3px solid #0284c7;
  outline-offset: 2px;
}
table caption {
  text-align: left;
  font-weight: 600;
  margin-bottom: 6px;
}
.accessed-transcript {
  margin: 10px 0 18px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.accessed-transcript summary {
  font-weight: 600;
  cursor: pointer;
  color: #0f172a;
}
.accessed-transcript-body {
  margin-top: 8px;
  line-height: 1.6;
  color: #1e293b;
}
`.trim();

function humanizeSlug(raw: string): string {
  try {
    const cleaned = decodeURIComponent(raw)
      .replace(/^.*[\\/]/, '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^(\d+|img\s*\d+|image\s*\d+|screenshot.*)$/i.test(cleaned)) {
      return '';
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return '';
  }
}

function inferIframeTitle(src: string): string {
  const lower = src.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'Embedded YouTube instructional video';
  }
  if (lower.includes('vimeo.com')) {
    return 'Embedded Vimeo instructional video';
  }
  if (lower.includes('docs.google.com/presentation')) {
    return 'Embedded Google Slides presentation';
  }
  if (lower.includes('docs.google.com/forms')) {
    return 'Embedded Google Form';
  }
  if (lower.includes('docs.google.com/document')) {
    return 'Embedded Google Document';
  }
  if (lower.includes('quizlet.com')) {
    return 'Embedded Quizlet study set';
  }
  if (lower.includes('desmos.com')) {
    return 'Embedded Desmos interactive graph';
  }
  if (lower.includes('phet.colorado.edu')) {
    return 'Embedded PhET interactive science simulation';
  }
  try {
    const url = new URL(src, 'https://example.edu');
    return `Embedded course content from ${url.hostname.replace(/^www\./, '')}`;
  } catch {
    return 'Embedded instructional content';
  }
}

function inferLinkLabel(href: string, titleAttr: string): string {
  if (titleAttr.trim()) return titleAttr.trim();
  if (href.startsWith('mailto:')) {
    return `Email ${href.replace(/^mailto:/i, '').split('?')[0]}`;
  }
  try {
    const url = new URL(href, 'https://course.local');
    const pathPart = url.pathname.split('/').filter(Boolean).pop() || '';
    const extMatch = pathPart.match(/\.(pdf|docx?|pptx?|xlsx?|csv|mp4|zip)$/i);
    const extLabel = extMatch ? ` (${extMatch[1].toUpperCase()})` : '';
    const human = humanizeSlug(pathPart);
    if (human) {
      return `${human}${extLabel}`;
    }
    if (url.hostname && url.hostname !== 'course.local') {
      return `Resource on ${url.hostname.replace(/^www\./, '')}`;
    }
  } catch {
    // ignore invalid URL
  }
  return 'Course resource';
}

export interface RemediationOutput {
  html: string;
  changes: RemediationChange[];
}

export function remediateHtml(
  html: string,
  options: RemediationOptions,
  fallbackTitle = 'Course Page'
): RemediationOutput {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const changeMap = new Map<RuleId, RemediationChange>();

  const record = (
    ruleId: RuleId,
    wcagCriterion: string,
    summary: string,
    automated = true
  ) => {
    const existing = changeMap.get(ruleId);
    if (existing) {
      existing.count += 1;
    } else {
      changeMap.set(ruleId, { ruleId, wcagCriterion, summary, count: 1, automated });
    }
  };

  // 1. Document structure (full HTML documents only)
  if (isFullDoc && options.fixDocumentStructure) {
    const htmlEl = doc.documentElement;
    if (!htmlEl.getAttribute('lang')?.trim()) {
      htmlEl.setAttribute('lang', options.language || 'en');
      record('html-lang', '3.1.1 Language of Page', `Set <html lang="${options.language || 'en'}">`);
    }

    let head = doc.querySelector('head');
    if (!head) {
      head = doc.createElement('head');
      htmlEl.insertBefore(head, doc.body);
    }

    const titleEl = head.querySelector('title');
    const currentTitle = titleEl?.textContent?.trim() || '';
    const genericTitles = new Set(['', 'untitled', 'untitled document', 'document', 'page', 'new page', 'index', 'home']);
    if (genericTitles.has(currentTitle.toLowerCase())) {
      const firstH1 = doc.querySelector('h1')?.textContent?.trim();
      const resolvedTitle = firstH1 || fallbackTitle;
      if (titleEl) {
        titleEl.textContent = resolvedTitle;
      } else {
        const newTitle = doc.createElement('title');
        newTitle.textContent = resolvedTitle;
        head.appendChild(newTitle);
      }
      record('document-title', '2.4.2 Page Titled', `Set descriptive document <title> ("${resolvedTitle}")`);
    }

    // Viewport zoom restriction
    const viewport = head.querySelector('meta[name="viewport"]');
    if (viewport) {
      const content = viewport.getAttribute('content') || '';
      if (/user-scalable\s*=\s*(no|0)/i.test(content) || /maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(content)) {
        const fixed = content
          .replace(/,?\s*user-scalable\s*=\s*(no|0)/gi, '')
          .replace(/,?\s*maximum-scale\s*=\s*[\d.]+/gi, '')
          .replace(/^,\s*/, '')
          .trim();
        viewport.setAttribute('content', fixed || 'width=device-width, initial-scale=1.0');
        record('viewport-zoom', '1.4.4 Resize Text', 'Re-enabled pinch-to-zoom in viewport meta tag');
      }
    }

    // Wrap body in <main> and add skip link if missing
    let main = doc.querySelector('main, [role="main"]');
    if (!main) {
      main = doc.createElement('main');
      main.setAttribute('id', 'main-content');
      const bodyChildren = Array.from(doc.body.childNodes);
      // Keep <header> and <nav> outside <main> if present at top level
      for (const node of bodyChildren) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          ['header', 'nav', 'footer'].includes((node as Element).tagName.toLowerCase())
        ) {
          continue;
        }
        main.appendChild(node);
      }
      const footer = doc.body.querySelector(':scope > footer');
      if (footer) {
        doc.body.insertBefore(main, footer);
      } else {
        doc.body.appendChild(main);
      }
      record('bypass-blocks', '2.4.1 Bypass Blocks', 'Added <main id="main-content"> landmark');
    } else if (!main.getAttribute('id')) {
      main.setAttribute('id', 'main-content');
    }

    const hasSkipLink = Boolean(
      doc.querySelector('a[href^="#main"], a[href^="#content"], a.skip-link')
    );
    if (!hasSkipLink) {
      const skip = doc.createElement('a');
      skip.setAttribute('href', `#${main.getAttribute('id') || 'main-content'}`);
      skip.setAttribute('class', 'skip-link');
      skip.textContent = 'Skip to main content';
      doc.body.insertBefore(skip, doc.body.firstChild);
      record('bypass-blocks', '2.4.1 Bypass Blocks', 'Inserted "Skip to main content" link');
    }
  }

  // 2. Headings: promote fake headings, remove empty headings, normalize skipped levels
  if (options.fixHeadings) {
    const paragraphs = Array.from(doc.querySelectorAll('p'));
    const hasH1 = Boolean(doc.querySelector('h1'));
    let promotedCount = 0;

    paragraphs.forEach((p) => {
      if (isFakeHeadingParagraph(p)) {
        const tag = !hasH1 && promotedCount === 0 ? 'h2' : 'h2';
        const heading = doc.createElement(tag);
        heading.textContent = (p.textContent || '').replace(/\s+/g, ' ').trim();
        p.replaceWith(heading);
        promotedCount += 1;
        record('fake-heading', '1.3.1 Info and Relationships', 'Converted styled <p> titles to semantic headings');
      }
    });

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let prevLevel = 0;
    headings.forEach((h) => {
      const text = h.textContent?.trim() || '';
      if (!text) {
        h.remove();
        record('heading-hierarchy', '1.3.1 Info and Relationships', 'Removed empty heading elements');
        return;
      }
      const level = parseInt(h.tagName.slice(1), 10);
      if (prevLevel > 0 && level > prevLevel + 1) {
        const newLevel = Math.min(6, prevLevel + 1);
        const replacement = doc.createElement(`h${newLevel}`);
        for (const attr of Array.from(h.attributes)) {
          replacement.setAttribute(attr.name, attr.value);
        }
        replacement.innerHTML = h.innerHTML;
        h.replaceWith(replacement);
        prevLevel = newLevel;
        record(
          'heading-hierarchy',
          '1.3.1 Info and Relationships',
          'Normalized skipped heading levels for sequential outline'
        );
      } else {
        prevLevel = level;
      }
    });
  }

  // 3. Color contrast & legacy <font color>
  if (options.fixContrast) {
    const styledEls = Array.from(doc.body.querySelectorAll<HTMLElement>('[style], font[color]'));
    styledEls.forEach((el) => {
      const rawFg = el.style?.color || el.getAttribute('color');
      const fg = parseColor(rawFg);
      if (!fg) return;

      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );
      if (!hasText) return;

      const bg = getEffectiveBackground(el);
      const sizePx = parseFontSizePx(el.style?.fontSize);
      const tag = el.tagName.toLowerCase();
      const weight = el.style?.fontWeight?.toLowerCase() || '';
      const isBold =
        weight === 'bold' ||
        parseInt(weight, 10) >= 700 ||
        tag === 'strong' ||
        tag === 'b';
      const isLarge =
        tag === 'h1' ||
        tag === 'h2' ||
        (sizePx !== null && (sizePx >= 24 || (isBold && sizePx >= 18.66)));
      const target = isLarge ? 3.0 : 4.5;

      if (getContrastRatio(fg, bg) < target) {
        const accessibleHex = findAccessibleColor(fg, bg, target);
        if (el.tagName.toLowerCase() === 'font') {
          el.removeAttribute('color');
        }
        el.style.color = accessibleHex;
        record(
          'color-contrast',
          '1.4.3 Contrast (Minimum)',
          'Adjusted low-contrast text colors to meet WCAG 2.1 AA (>= 4.5:1)'
        );
      }
    });
  }

  // 4. Tables: convert first row to <th scope="col">, add <thead>/<tbody>, add <caption>
  if (options.fixTables) {
    const tables = Array.from(doc.querySelectorAll('table'));
    tables.forEach((table, idx) => {
      const role = table.getAttribute('role')?.toLowerCase();
      if (role === 'presentation' || role === 'none') return;

      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;
      const maxCols = Math.max(...rows.map((r) => r.querySelectorAll('td, th').length));
      if (maxCols < 2) return;

      const existingThs = Array.from(table.querySelectorAll('th'));
      if (existingThs.length === 0) {
        const firstRow = rows[0];
        const cells = Array.from(firstRow.querySelectorAll('td'));
        cells.forEach((td) => {
          const th = doc.createElement('th');
          th.setAttribute('scope', 'col');
          for (const attr of Array.from(td.attributes)) {
            th.setAttribute(attr.name, attr.value);
          }
          th.innerHTML = td.innerHTML;
          td.replaceWith(th);
        });

        if (!table.querySelector('thead')) {
          const thead = doc.createElement('thead');
          thead.appendChild(firstRow);
          const firstChild = table.querySelector('caption')
            ? table.querySelector('caption')!.nextSibling
            : table.firstChild;
          table.insertBefore(thead, firstChild);
        }
        record(
          'table-headers',
          '1.3.1 Info and Relationships',
          'Converted table header rows to semantic <th scope="col"> inside <thead>'
        );
      } else {
        let addedScope = false;
        existingThs.forEach((th) => {
          if (!th.getAttribute('scope')) {
            const parentTr = th.parentElement;
            const isFirstCol = parentTr && parentTr.firstElementChild === th && parentTr !== rows[0];
            th.setAttribute('scope', isFirstCol ? 'row' : 'col');
            addedScope = true;
          }
        });
        if (addedScope) {
          record(
            'table-headers',
            '1.3.1 Info and Relationships',
            'Added scope="col"/"row" attributes to table headers'
          );
        }
      }

      const hasCaption = Boolean(
        table.querySelector('caption')?.textContent?.trim() ||
          table.getAttribute('aria-label')?.trim()
      );
      if (!hasCaption) {
        const prevHeading = table.previousElementSibling;
        const captionText =
          prevHeading && /^h[1-6]$/i.test(prevHeading.tagName)
            ? `${prevHeading.textContent?.trim()} — Data Table`
            : `Course Data Table ${idx + 1}`;
        const caption = doc.createElement('caption');
        caption.textContent = captionText;
        table.insertBefore(caption, table.firstChild);
        record(
          'table-caption',
          '1.3.1 Info and Relationships',
          'Added descriptive <caption> elements to data tables'
        );
      }
    });
  }

  // 5. Links: improve generic link text & add new-tab warning
  if (options.fixLinks) {
    const genericPhrases = new Set([
      'click here',
      'here',
      'more',
      'read more',
      'learn more',
      'link',
      'this link',
      'this page',
      'website',
      'go',
      'info',
      'details',
      'continue',
      'download',
      'view',
      'open',
    ]);

    const links = Array.from(doc.querySelectorAll('a[href]'));
    links.forEach((a) => {
      const href = a.getAttribute('href') || '';
      const currentText = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const lower = currentText.toLowerCase().replace(/[.:!]+$/, '');

      if ((!currentText && !a.querySelector('img[alt]:not([alt=""])')) || genericPhrases.has(lower) || /^https?:\/\/\S+$/i.test(currentText)) {
        const better = inferLinkLabel(href, a.getAttribute('title') || '');
        a.textContent = better;
        record(
          'link-generic',
          '2.4.4 Link Purpose (In Context)',
          'Replaced vague "click here" / raw URL links with descriptive labels'
        );
      }

      if (a.getAttribute('target') === '_blank') {
        const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        rel.add('noreferrer');
        a.setAttribute('rel', Array.from(rel).join(' '));

        const combined = `${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`.toLowerCase();
        if (!/(new\s+(tab|window)|external)/i.test(combined)) {
          const sr = doc.createElement('span');
          sr.setAttribute('class', 'sr-only');
          sr.textContent = ' (opens in a new tab)';
          a.appendChild(sr);
          record(
            'link-new-tab',
            '3.2.5 Change on Request',
            'Added screen-reader new-tab notice and rel="noopener noreferrer" to external links'
          );
        }
      }
    });
  }

  // 6. Images: add starter alt text (or alt="" for tiny decorative spacers)
  if (options.fixImages) {
    const images = Array.from(doc.querySelectorAll('img'));
    images.forEach((img) => {
      if (img.getAttribute('alt') !== null) return;
      const w = parseInt(img.getAttribute('width') || '0', 10);
      const h = parseInt(img.getAttribute('height') || '0', 10);
      const src = img.getAttribute('src') || '';

      if ((w > 0 && w <= 16 && h > 0 && h <= 16) || /spacer|divider|pixel|blank/i.test(src)) {
        img.setAttribute('alt', '');
        img.setAttribute('role', 'presentation');
        record('img-alt', '1.1.1 Non-text Content', 'Marked decorative spacer images with alt=""');
      } else {
        const fromTitle = img.getAttribute('title')?.trim();
        const fromFile = humanizeSlug(src);
        const suggested = fromTitle || (fromFile ? `Illustration: ${fromFile}` : '[Needs alt text — describe this image]');
        img.setAttribute('alt', suggested);
        record(
          'img-alt',
          '1.1.1 Non-text Content',
          'Added starter alt text to images (review recommended for pedagogical accuracy)',
          false
        );
      }
    });
  }

  // 7. Media & Iframes & Forms
  if (options.fixMediaAndFrames) {
    const iframes = Array.from(doc.querySelectorAll('iframe'));
    iframes.forEach((iframe) => {
      if (!iframe.getAttribute('title')?.trim()) {
        iframe.setAttribute('title', inferIframeTitle(iframe.getAttribute('src') || ''));
        record('iframe-title', '4.1.2 Name, Role, Value', 'Added descriptive title attributes to <iframe> embeds');
      }
    });

    const videos = Array.from(doc.querySelectorAll('video'));
    videos.forEach((video) => {
      let fixed = false;
      if (!video.hasAttribute('controls')) {
        video.setAttribute('controls', '');
        fixed = true;
      }
      if (video.hasAttribute('autoplay')) {
        video.removeAttribute('autoplay');
        fixed = true;
      }
      if (!video.querySelector('track[kind="captions"], track[kind="subtitles"]')) {
        const track = doc.createElement('track');
        track.setAttribute('kind', 'captions');
        track.setAttribute('srclang', options.language || 'en');
        track.setAttribute('label', 'English captions (upload .vtt file)');
        track.setAttribute('src', 'captions.vtt');
        video.appendChild(track);
        fixed = true;
      }
      if (fixed) {
        record(
          'media-accessibility',
          '1.2.2 Captions (Prerecorded)',
          'Added playback controls, removed autoplay, and added caption <track> placeholder to videos'
        );
      }
    });

    const audios = Array.from(doc.querySelectorAll('audio'));
    audios.forEach((audio) => {
      if (!audio.hasAttribute('controls') || audio.hasAttribute('autoplay')) {
        audio.setAttribute('controls', '');
        audio.removeAttribute('autoplay');
        record('media-accessibility', '1.4.2 Audio Control', 'Enabled controls and disabled autoplay on audio players');
      }

      const nextEl = audio.nextElementSibling;
      const hasTranscript = Boolean(
        nextEl?.classList.contains('accessed-transcript') ||
          /transcript/i.test(nextEl?.textContent || '')
      );
      if (!hasTranscript) {
        const details = doc.createElement('details');
        details.setAttribute('class', 'accessed-transcript');
        const summary = doc.createElement('summary');
        summary.textContent = 'Read Audio Transcript';
        const body = doc.createElement('div');
        body.setAttribute('class', 'accessed-transcript-body');
        body.textContent =
          '[Add spoken transcript here using the Blind & Deaf/HoH Studio tab so Deaf and hard-of-hearing students can read this audio clip.]';
        details.appendChild(summary);
        details.appendChild(body);
        audio.insertAdjacentElement('afterend', details);
        record(
          'audio-transcript',
          '1.2.1 Audio-only and Video-only',
          'Inserted collapsible text transcript container for <audio> players'
        );
      }
    });

    // Inline <svg> graphics & icon-only <button> elements (Blind / Screen-Reader)
    const svgs = Array.from(doc.querySelectorAll('svg'));
    svgs.forEach((svg, idx) => {
      if (svg.getAttribute('aria-hidden') === 'true' || svg.getAttribute('role') === 'presentation') {
        return;
      }
      const hasName = Boolean(
        svg.getAttribute('aria-label')?.trim() ||
          svg.getAttribute('aria-labelledby')?.trim() ||
          svg.querySelector('title')?.textContent?.trim()
      );
      if (!hasName) {
        const w = parseInt(svg.getAttribute('width') || '0', 10);
        const h = parseInt(svg.getAttribute('height') || '0', 10);
        if (w > 0 && w <= 24 && h > 0 && h <= 24) {
          svg.setAttribute('aria-hidden', 'true');
        } else {
          svg.setAttribute('role', 'img');
          svg.setAttribute('aria-label', `Course diagram ${idx + 1}`);
        }
        record('svg-accessible-name', '1.1.1 Non-text Content', 'Added accessible names or decorative hiding to inline <svg> graphics');
      }
    });

    const buttons = Array.from(doc.querySelectorAll('button'));
    buttons.forEach((btn, idx) => {
      const label = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.textContent ||
        ''
      ).trim();
      if (!label) {
        btn.setAttribute('aria-label', `Action button ${idx + 1}`);
        record('button-accessible-name', '4.1.2 Name, Role, Value', 'Added aria-label to icon-only <button> elements');
      }
    });

    const controls = Array.from(
      doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea')
    );
    controls.forEach((ctrl, idx) => {
      const id = ctrl.getAttribute('id');
      const hasForLabel = id ? Boolean(doc.querySelector(`label[for="${id}"]`)) : false;
      const hasWrappingLabel = Boolean(ctrl.closest('label'));
      const hasAria = Boolean(
        ctrl.getAttribute('aria-label')?.trim() || ctrl.getAttribute('aria-labelledby')?.trim()
      );
      if (!hasForLabel && !hasWrappingLabel && !hasAria) {
        const label =
          ctrl.getAttribute('placeholder')?.trim() ||
          humanizeSlug(ctrl.getAttribute('name') || '') ||
          `Form field ${idx + 1}`;
        ctrl.setAttribute('aria-label', label);
        record('form-label', '1.3.1 Info and Relationships', 'Added accessible labels to unlabeled form controls');
      }
    });
  }

  // 8. Typography, deprecated tags & keyboard focus order
  if (options.fixTypographyAndFocus) {
    const styledEls = Array.from(doc.body.querySelectorAll<HTMLElement>('[style]'));
    styledEls.forEach((el) => {
      const sizePx = parseFontSizePx(el.style?.fontSize);
      if (sizePx !== null && sizePx < 12 && el.textContent?.trim()) {
        el.style.fontSize = '14px';
        record('tiny-text', '1.4.4 Resize Text', 'Increased tiny text (< 12px) to readable 14px minimum');
      }
    });

    const distracting = Array.from(doc.querySelectorAll('marquee, blink'));
    distracting.forEach((el) => {
      const replacement = doc.createElement(el.tagName.toLowerCase() === 'marquee' ? 'div' : 'span');
      replacement.innerHTML = el.innerHTML;
      replacement.setAttribute('class', 'accessed-static-notice');
      el.replaceWith(replacement);
      record(
        'deprecated-distracting',
        '2.2.2 Pause, Stop, Hide',
        'Replaced moving/blinking <marquee>/<blink> elements with static accessible text'
      );
    });

    const positiveTab = Array.from(doc.querySelectorAll('[tabindex]')).filter(
      (el) => parseInt(el.getAttribute('tabindex') || '0', 10) > 0
    );
    positiveTab.forEach((el) => {
      el.setAttribute('tabindex', '0');
      record(
        'positive-tabindex',
        '2.4.3 Focus Order',
        'Normalized positive tabindex values to preserve natural keyboard order'
      );
    });
  }

  // 9. Inject clean accessible base CSS (skip-link, sr-only, focus-visible)
  if (options.injectAccessibleStyles) {
    if (isFullDoc) {
      let head = doc.querySelector('head');
      if (!head) {
        head = doc.createElement('head');
        doc.documentElement.insertBefore(head, doc.body);
      }
      if (!head.querySelector(`#${ACCESSIBLE_STYLE_ID}`)) {
        const style = doc.createElement('style');
        style.setAttribute('id', ACCESSIBLE_STYLE_ID);
        style.textContent = ACCESSIBLE_CSS;
        head.appendChild(style);
      }
    } else if (!doc.body.querySelector(`#${ACCESSIBLE_STYLE_ID}`)) {
      const style = doc.createElement('style');
      style.setAttribute('id', ACCESSIBLE_STYLE_ID);
      style.textContent = ACCESSIBLE_CSS;
      doc.body.insertBefore(style, doc.body.firstChild);
    }
  }

  const outputHtml = isFullDoc
    ? `<!doctype html>\n${doc.documentElement.outerHTML}`
    : doc.body.innerHTML;

  return {
    html: outputHtml,
    changes: Array.from(changeMap.values()),
  };
}

/** Inline manual edit helper: updates a specific <img> alt attribute */
export function updateImageAltInHtml(html: string, imgIndex: number, newAlt: string): string {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const images = Array.from(doc.querySelectorAll('img'));
  const target = images[imgIndex];
  if (!target) return html;
  target.setAttribute('alt', newAlt);
  return isFullDoc ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}

/** Inline manual edit helper: updates a specific <a> text */
export function updateLinkTextInHtml(html: string, linkIndex: number, newText: string): string {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const links = Array.from(doc.querySelectorAll('a[href]'));
  const target = links[linkIndex];
  if (!target) return html;
  const srOnly = target.querySelector('.sr-only');
  target.textContent = newText;
  if (srOnly) {
    target.appendChild(srOnly);
  }
  return isFullDoc ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
}
