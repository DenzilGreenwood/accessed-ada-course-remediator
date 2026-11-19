import type { AuditIssue, AuditResult } from '../types';
import {
  getContrastRatio,
  parseColor,
  parseFontSizePx,
  type RGB,
} from './contrast';

const GENERIC_LINK_PHRASES = new Set([
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

const SUSPICIOUS_ALT_REGEX =
  /^(\s*(image|img|photo|picture|graphic|pic|icon|logo|banner|placeholder|untitled|screenshot|screen shot)[\s_-]*\d*\s*|.*\.(png|jpe?g|gif|webp|svg|bmp|tiff?)\s*|\[needs alt text.*\])$/i;

const GENERIC_TITLES = new Set([
  '',
  'untitled',
  'untitled document',
  'document',
  'page',
  'new page',
  'index',
  'home',
]);

export function isFullHtmlDocument(html: string): boolean {
  return /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html);
}

export function parseHtmlDocument(html: string, isFullDoc: boolean): Document {
  const parser = new DOMParser();
  if (isFullDoc) {
    return parser.parseFromString(html, 'text/html');
  }
  return parser.parseFromString(
    `<!doctype html><html lang="en"><head><title>Fragment</title></head><body>${html}</body></html>`,
    'text/html'
  );
}

function getSnippet(el: Element): string {
  const raw = el.outerHTML.replace(/\s+/g, ' ').trim();
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}

function getSurroundingContext(el: Element): string {
  const parentText = el.parentElement?.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (parentText.length > 160) return `${parentText.slice(0, 157)}...`;
  return parentText;
}

export function getEffectiveBackground(el: Element): RGB {
  let current: Element | null = el;
  while (current) {
    const styleBg = (current as HTMLElement).style?.backgroundColor;
    const parsed = parseColor(styleBg);
    if (parsed) return parsed;

    const bgAttr = current.getAttribute('bgcolor');
    const parsedAttr = parseColor(bgAttr);
    if (parsedAttr) return parsedAttr;

    current = current.parentElement;
  }
  return { r: 255, g: 255, b: 255 };
}

function isLargeText(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2') return true;
  const sizePx = parseFontSizePx(el.style?.fontSize);
  const weight = el.style?.fontWeight?.toLowerCase() || '';
  const isBold =
    weight === 'bold' ||
    weight === 'bolder' ||
    parseInt(weight, 10) >= 700 ||
    tag === 'strong' ||
    tag === 'b';
  if (sizePx !== null) {
    if (sizePx >= 24) return true;
    if (isBold && sizePx >= 18.66) return true;
  }
  return false;
}

function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }
  }
  return false;
}

export function isFakeHeadingParagraph(p: Element): boolean {
  if (p.tagName.toLowerCase() !== 'p') return false;
  const text = p.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (text.length < 3 || text.length > 90) return false;
  if (/[.!?]$/.test(text)) return false;

  const elementChildren = Array.from(p.children);
  const hasNonWhitespaceText = Array.from(p.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
  );

  // Case 1: <p><strong>Heading</strong></p> or <p><b>Heading</b></p>
  if (!hasNonWhitespaceText && elementChildren.length === 1) {
    const child = elementChildren[0] as HTMLElement;
    const childTag = child.tagName.toLowerCase();
    if (childTag === 'strong' || childTag === 'b') {
      return true;
    }
    const fontSize = parseFontSizePx(child.style?.fontSize);
    if (fontSize !== null && fontSize >= 18) {
      return true;
    }
  }

  // Case 2: <p style="font-size: 22px; font-weight: bold">Heading</p>
  const pEl = p as HTMLElement;
  const pSize = parseFontSizePx(pEl.style?.fontSize);
  const pWeight = pEl.style?.fontWeight?.toLowerCase() || '';
  const isBold = pWeight === 'bold' || parseInt(pWeight, 10) >= 600;
  if (pSize !== null && pSize >= 19 && (isBold || pSize >= 22)) {
    return true;
  }

  return false;
}

function isDataTable(table: Element): boolean {
  const role = table.getAttribute('role')?.toLowerCase();
  if (role === 'presentation' || role === 'none') return false;
  const rows = table.querySelectorAll('tr');
  if (rows.length < 2) return false;
  const maxCols = Math.max(
    ...Array.from(rows).map((r) => r.querySelectorAll('td, th').length)
  );
  return maxCols >= 2;
}

export function auditHtml(html: string): AuditResult {
  const isFullDoc = isFullHtmlDocument(html);
  const doc = parseHtmlDocument(html, isFullDoc);
  const issues: AuditIssue[] = [];
  let seq = 1;

  const push = (issue: Omit<AuditIssue, 'id'>) => {
    issues.push({ ...issue, id: `issue-${seq++}` });
  };

  // 1. Document-level checks (only for full HTML documents)
  if (isFullDoc) {
    const htmlEl = doc.documentElement;
    const lang = htmlEl?.getAttribute('lang')?.trim();
    if (!lang) {
      push({
        ruleId: 'html-lang',
        wcagCriterion: '3.1.1 Language of Page',
        wcagLevel: 'A',
        principle: 'Understandable',
        disabilities: ['blind'],
        severity: 'serious',
        title: 'Missing page language attribute',
        description: 'The <html> element does not declare a primary language (e.g., lang="en").',
        studentImpact:
          'Screen readers may use the wrong pronunciation rules, making course content difficult or impossible to understand.',
        snippet: '<html>',
        autoFixable: true,
      });
    }

    const titleText = doc.querySelector('title')?.textContent?.trim() || '';
    if (GENERIC_TITLES.has(titleText.toLowerCase())) {
      push({
        ruleId: 'document-title',
        wcagCriterion: '2.4.2 Page Titled',
        wcagLevel: 'A',
        principle: 'Operable',
        disabilities: ['blind', 'motor-cognitive'],
        severity: 'serious',
        title: titleText ? `Generic document title ("${titleText}")` : 'Missing document <title>',
        description: 'Every course page must have a descriptive <title> identifying its topic.',
        studentImpact:
          'Screen reader users rely on the page title to confirm which lesson or syllabus tab they opened.',
        snippet: `<title>${titleText}</title>`,
        autoFixable: true,
      });
    }

    const viewport = doc.querySelector('meta[name="viewport"]');
    const vpContent = viewport?.getAttribute('content') || '';
    if (/user-scalable\s*=\s*(no|0)/i.test(vpContent) || /maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(vpContent)) {
      push({
        ruleId: 'viewport-zoom',
        wcagCriterion: '1.4.4 Resize Text',
        wcagLevel: 'AA',
        principle: 'Perceivable',
        disabilities: ['low-vision'],
        severity: 'critical',
        title: 'Pinch-to-zoom disabled in viewport meta tag',
        description: 'Viewport metadata blocks students from zooming in on course content.',
        studentImpact:
          'Low-vision students on tablets and phones cannot magnify text or diagrams.',
        snippet: viewport ? getSnippet(viewport) : '<meta name="viewport">',
        autoFixable: true,
      });
    }

    const hasMain = Boolean(doc.querySelector('main, [role="main"]'));
    const hasSkipLink = Boolean(
      doc.querySelector('a[href^="#main"], a[href^="#content"], a.skip-link')
    );
    if (!hasMain || !hasSkipLink) {
      push({
        ruleId: 'bypass-blocks',
        wcagCriterion: '2.4.1 Bypass Blocks',
        wcagLevel: 'A',
        principle: 'Operable',
        disabilities: ['blind', 'motor-cognitive'],
        severity: 'moderate',
        title: !hasMain
          ? 'Missing <main> landmark and skip link'
          : 'Missing "Skip to main content" link',
        description:
          'Course pages should include a <main> landmark and a skip-to-content link so keyboard users can jump straight to lesson content.',
        studentImpact:
          'Keyboard-only and switch-access students must tab through repeated navigation on every page.',
        snippet: '<body>...</body>',
        autoFixable: true,
      });
    }
  }

  // 2. Images: missing alt or suspicious filename alt
  const images = Array.from(doc.querySelectorAll('img'));
  images.forEach((img, idx) => {
    const role = img.getAttribute('role')?.toLowerCase();
    const ariaHidden = img.getAttribute('aria-hidden') === 'true';
    if (role === 'presentation' || role === 'none' || ariaHidden) return;

    const alt = img.getAttribute('alt');
    const src = img.getAttribute('src') || '';

    if (alt === null) {
      push({
        ruleId: 'img-alt',
        wcagCriterion: '1.1.1 Non-text Content',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'critical',
        title: 'Image missing alternative text (alt)',
        description: `Image (${src || 'inline image'}) has no alt attribute.`,
        studentImpact:
          'Blind and low-vision students using screen readers hear the raw file path or miss diagrams and figures completely.',
        snippet: getSnippet(img),
        autoFixable: true,
        needsReview: true,
        elementRef: {
          tag: 'img',
          index: idx,
          currentValue: '',
          context: getSurroundingContext(img),
        },
      });
    } else if (alt.trim() !== '' && SUSPICIOUS_ALT_REGEX.test(alt.trim())) {
      push({
        ruleId: 'img-alt-suspicious',
        wcagCriterion: '1.1.1 Non-text Content',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'serious',
        title: `Non-descriptive image alt text ("${alt.trim()}")`,
        description:
          'Alt text appears to be a filename, placeholder, or generic label rather than a meaningful description.',
        studentImpact:
          'Students hear unhelpful text like "IMG_4021.jpg" instead of what the figure actually teaches.',
        snippet: getSnippet(img),
        autoFixable: false,
        needsReview: true,
        elementRef: {
          tag: 'img',
          index: idx,
          currentValue: alt,
          context: getSurroundingContext(img),
        },
      });
    }
  });

  // 2b. Inline <svg> graphics & icon-only <button> elements (Blind / Screen-Reader)
  const svgs = Array.from(doc.querySelectorAll('svg'));
  svgs.forEach((svg) => {
    if (svg.getAttribute('aria-hidden') === 'true' || svg.getAttribute('role') === 'presentation') {
      return;
    }
    const hasName = Boolean(
      svg.getAttribute('aria-label')?.trim() ||
        svg.getAttribute('aria-labelledby')?.trim() ||
        svg.querySelector('title')?.textContent?.trim()
    );
    if (!hasName) {
      push({
        ruleId: 'svg-accessible-name',
        wcagCriterion: '1.1.1 Non-text Content',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'serious',
        title: 'Inline <svg> graphic missing accessible name',
        description: 'SVG diagrams must include a <title> or aria-label, or aria-hidden="true" if purely decorative.',
        studentImpact:
          'Screen readers either skip the diagram or read unreadable vector code to blind students.',
        snippet: getSnippet(svg),
        autoFixable: true,
      });
    }
  });

  const buttons = Array.from(doc.querySelectorAll('button'));
  buttons.forEach((btn) => {
    const label = (
      btn.getAttribute('aria-label') ||
      btn.getAttribute('title') ||
      btn.textContent ||
      ''
    ).trim();
    if (!label) {
      push({
        ruleId: 'button-accessible-name',
        wcagCriterion: '4.1.2 Name, Role, Value',
        wcagLevel: 'A',
        principle: 'Robust',
        disabilities: ['blind'],
        severity: 'critical',
        title: 'Button missing accessible name',
        description: 'Icon-only or empty <button> elements must include visible text or an aria-label.',
        studentImpact: 'Blind students hear only "button" with no clue what clicking it will do.',
        snippet: getSnippet(btn),
        autoFixable: true,
      });
    }
  });

  // 3. Iframes missing title
  const iframes = Array.from(doc.querySelectorAll('iframe'));
  iframes.forEach((iframe) => {
    const title = iframe.getAttribute('title')?.trim();
    if (!title) {
      push({
        ruleId: 'iframe-title',
        wcagCriterion: '4.1.2 Name, Role, Value',
        wcagLevel: 'A',
        principle: 'Robust',
        disabilities: ['blind'],
        severity: 'serious',
        title: 'Embedded frame (<iframe>) missing title attribute',
        description: 'Embedded videos, slides, or external tools must have a descriptive title.',
        studentImpact:
          'Screen reader users encounter an unlabeled frame and cannot tell what media or quiz is embedded.',
        snippet: getSnippet(iframe),
        autoFixable: true,
      });
    }
  });

  // 4. Headings: skipped levels & empty headings
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let prevLevel = 0;
  headings.forEach((h) => {
    const level = parseInt(h.tagName.slice(1), 10);
    const text = h.textContent?.trim() || '';
    if (!text) {
      push({
        ruleId: 'heading-hierarchy',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'moderate',
        title: `Empty <${h.tagName.toLowerCase()}> heading element`,
        description: 'Empty heading tags create confusing blank stops in screen reader outlines.',
        studentImpact: 'Screen reader users navigating by headings hear empty announcements.',
        snippet: getSnippet(h),
        autoFixable: true,
      });
      return;
    }
    if (prevLevel > 0 && level > prevLevel + 1) {
      push({
        ruleId: 'heading-hierarchy',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind', 'motor-cognitive'],
        severity: 'moderate',
        title: `Skipped heading level (<h${prevLevel}> to <h${level}>)`,
        description: `Heading "${text.slice(0, 50)}" jumps from H${prevLevel} directly to H${level}.`,
        studentImpact:
          'Students navigating by heading hierarchy may think sections are missing or misread the lesson outline.',
        snippet: getSnippet(h),
        autoFixable: true,
      });
    }
    prevLevel = level;
  });

  // 5. Fake headings (bold/large paragraphs used instead of semantic <h2>/<h3>)
  const paragraphs = Array.from(doc.querySelectorAll('p'));
  paragraphs.forEach((p) => {
    if (isFakeHeadingParagraph(p)) {
      push({
        ruleId: 'fake-heading',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'moderate',
        title: `Visual heading styled with <p> ("${(p.textContent || '').trim().slice(0, 45)}")`,
        description:
          'Styled paragraph text appears to be a section heading instead of a semantic <h2> or <h3> element.',
        studentImpact:
          'Screen reader users cannot jump to this section using heading navigation shortcuts.',
        snippet: getSnippet(p),
        autoFixable: true,
      });
    }
  });

  // 6. Data tables missing headers or captions
  const tables = Array.from(doc.querySelectorAll('table'));
  tables.forEach((table) => {
    if (!isDataTable(table)) return;
    const ths = Array.from(table.querySelectorAll('th'));
    const hasTh = ths.length > 0;
    const missingScope = hasTh && ths.some((th) => !th.getAttribute('scope'));

    if (!hasTh || missingScope) {
      push({
        ruleId: 'table-headers',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'serious',
        title: !hasTh
          ? 'Data table missing header cells (<th>)'
          : 'Table header cells missing scope attribute',
        description: !hasTh
          ? 'This data table uses <td> for all cells instead of semantic <th scope="col"> headers.'
          : 'Header cells (<th>) should include scope="col" or scope="row" to associate headers with data cells.',
        studentImpact:
          'Screen reader users cannot tell which column or row a grade, date, or value belongs to.',
        snippet: getSnippet(table),
        autoFixable: true,
      });
    }

    const hasCaption = Boolean(
      table.querySelector('caption')?.textContent?.trim() ||
        table.getAttribute('aria-label')?.trim() ||
        table.getAttribute('aria-labelledby')?.trim()
    );
    if (!hasCaption) {
      push({
        ruleId: 'table-caption',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind'],
        severity: 'moderate',
        title: 'Data table missing descriptive <caption>',
        description: 'Adding a <caption> explains the table’s purpose before students read its cells.',
        studentImpact:
          'Students using assistive technology must explore multiple cells just to figure out what the table represents.',
        snippet: getSnippet(table),
        autoFixable: true,
      });
    }
  });

  // 7. Inline color contrast & tiny text
  const styledEls = Array.from(doc.body.querySelectorAll<HTMLElement>('[style], font[color]'));
  styledEls.forEach((el) => {
    // Check tiny font size
    const sizePx = parseFontSizePx(el.style?.fontSize);
    if (sizePx !== null && sizePx < 12 && el.textContent?.trim()) {
      push({
        ruleId: 'tiny-text',
        wcagCriterion: '1.4.4 Resize Text',
        wcagLevel: 'AA',
        principle: 'Perceivable',
        disabilities: ['low-vision'],
        severity: 'moderate',
        title: `Text too small (${sizePx.toFixed(0)}px)`,
        description: `Inline font-size of ${el.style.fontSize} is below the 12px readability floor.`,
        studentImpact: 'Low-vision students and readers with dyslexia struggle to read tiny text.',
        snippet: getSnippet(el),
        autoFixable: true,
      });
    }

    // Check color contrast if element has inline color or legacy <font color>
    const rawFg = el.style?.color || el.getAttribute('color');
    const fg = parseColor(rawFg);
    if (fg && hasDirectText(el)) {
      const bg = getEffectiveBackground(el);
      const ratio = getContrastRatio(fg, bg);
      const large = isLargeText(el);
      const required = large ? 3.0 : 4.5;
      if (ratio < required) {
        push({
          ruleId: 'color-contrast',
          wcagCriterion: '1.4.3 Contrast (Minimum)',
          wcagLevel: 'AA',
          principle: 'Perceivable',
          disabilities: ['low-vision'],
          severity: ratio < 3.0 ? 'critical' : 'serious',
          title: `Insufficient text contrast (${ratio.toFixed(2)}:1, needs ${required}:1)`,
          description: `Text color "${rawFg}" does not meet WCAG 2.1 AA minimum contrast against its background.`,
          studentImpact:
            'Students with low vision, color blindness, or glare on classroom screens cannot read this text.',
          snippet: getSnippet(el),
          autoFixable: true,
        });
      }
    }
  });

  // 8. Links: generic text & target="_blank" without warning
  const links = Array.from(doc.querySelectorAll('a[href]'));
  links.forEach((a, idx) => {
    const ariaLabel = a.getAttribute('aria-label')?.trim() || '';
    const text = (ariaLabel || a.textContent || '').replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase().replace(/[.:!]+$/, '');

    if (!text) {
      // Only flag if there's no img with alt inside
      const imgWithAlt = a.querySelector('img[alt]:not([alt=""])');
      if (!imgWithAlt) {
        push({
          ruleId: 'link-generic',
          wcagCriterion: '2.4.4 Link Purpose (In Context)',
          wcagLevel: 'A',
          principle: 'Operable',
          disabilities: ['blind'],
          severity: 'critical',
          title: 'Empty link with no accessible name',
          description: 'Link has no visible text or aria-label.',
          studentImpact: 'Screen readers announce only "link" with no indication of where it goes.',
          snippet: getSnippet(a),
          autoFixable: true,
          elementRef: {
            tag: 'a',
            index: idx,
            currentValue: text,
            context: getSurroundingContext(a),
          },
        });
      }
    } else if (GENERIC_LINK_PHRASES.has(lower) || /^https?:\/\/\S+$/i.test(text)) {
      push({
        ruleId: 'link-generic',
        wcagCriterion: '2.4.4 Link Purpose (In Context)',
        wcagLevel: 'A',
        principle: 'Operable',
        disabilities: ['blind', 'motor-cognitive'],
        severity: 'serious',
        title: /^https?:\/\//i.test(text)
          ? 'Raw URL used as link text'
          : `Ambiguous link text ("${text}")`,
        description:
          'Link text should describe the destination (e.g., "Download Week 1 Lab Rubric PDF") rather than "click here" or a raw URL.',
        studentImpact:
          'Screen reader users scanning a list of links hear "click here" repeatedly without knowing what each link opens.',
        snippet: getSnippet(a),
        autoFixable: true,
        needsReview: true,
        elementRef: {
          tag: 'a',
          index: idx,
          currentValue: text,
          context: getSurroundingContext(a),
        },
      });
    }

    if (a.getAttribute('target') === '_blank') {
      const combined = `${text} ${a.getAttribute('title') || ''}`.toLowerCase();
      if (!/(new\s+(tab|window)|external)/i.test(combined)) {
        push({
          ruleId: 'link-new-tab',
          wcagCriterion: '3.2.5 Change on Request / Best Practice',
          wcagLevel: 'AA',
          principle: 'Understandable',
          disabilities: ['blind', 'motor-cognitive'],
          severity: 'moderate',
          title: 'Link opens in a new tab without warning',
          description: 'Links using target="_blank" should notify students that a new tab will open.',
          studentImpact:
            'Screen reader and cognitive-disability users can become disoriented when the Back button stops working.',
          snippet: getSnippet(a),
          autoFixable: true,
        });
      }
    }
  });

  // 9. Form controls missing labels
  const controls = Array.from(
    doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea')
  );
  controls.forEach((ctrl) => {
    const id = ctrl.getAttribute('id');
    const hasForLabel = id ? Boolean(doc.querySelector(`label[for="${CSS.escape ? CSS.escape(id) : id}"]`)) : false;
    const hasWrappingLabel = Boolean(ctrl.closest('label'));
    const hasAria = Boolean(
      ctrl.getAttribute('aria-label')?.trim() || ctrl.getAttribute('aria-labelledby')?.trim()
    );
    if (!hasForLabel && !hasWrappingLabel && !hasAria) {
      push({
        ruleId: 'form-label',
        wcagCriterion: '1.3.1 Info and Relationships',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind', 'motor-cognitive'],
        severity: 'critical',
        title: `Form <${ctrl.tagName.toLowerCase()}> missing accessible label`,
        description: 'Interactive form inputs must be linked to a <label> or have an aria-label.',
        studentImpact:
          'Screen reader users cannot tell what information to enter into the quiz or form field.',
        snippet: getSnippet(ctrl),
        autoFixable: true,
      });
    }
  });

  // 10. Media accessibility (<video>, <audio>) — Deaf / Hard-of-Hearing & Blind
  const videos = Array.from(doc.querySelectorAll('video'));
  videos.forEach((video) => {
    const hasCaptions = Boolean(
      video.querySelector('track[kind="captions"], track[kind="subtitles"]')
    );
    const hasAutoplayUnmuted = video.hasAttribute('autoplay') && !video.hasAttribute('muted');
    if (!hasCaptions || hasAutoplayUnmuted || !video.hasAttribute('controls')) {
      push({
        ruleId: 'media-accessibility',
        wcagCriterion: '1.2.2 Captions (Prerecorded)',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['deaf-hoh', 'blind'],
        severity: 'critical',
        title: !hasCaptions
          ? 'Video missing closed captions (<track kind="captions">)'
          : 'Video autoplays or lacks playback controls',
        description:
          'Prerecorded instructional videos must include captions, user controls, and must not autoplay with sound.',
        studentImpact:
          'Deaf and hard-of-hearing students cannot access spoken lecture content; autoplaying audio interferes with screen readers.',
        snippet: getSnippet(video),
        autoFixable: true,
        needsReview: !hasCaptions,
      });
    }
  });

  const audios = Array.from(doc.querySelectorAll('audio'));
  audios.forEach((audio) => {
    if (!audio.hasAttribute('controls') || audio.hasAttribute('autoplay')) {
      push({
        ruleId: 'media-accessibility',
        wcagCriterion: '1.4.2 Audio Control',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['blind', 'deaf-hoh'],
        severity: 'serious',
        title: 'Audio element missing controls or set to autoplay',
        description: 'Audio clips must provide pause/stop controls and never autoplay automatically.',
        studentImpact:
          'Autoplaying audio talks over screen readers and disrupts students with sensory sensitivities.',
        snippet: getSnippet(audio),
        autoFixable: true,
      });
    }

    const nextEl = audio.nextElementSibling;
    const hasTranscript = Boolean(
      nextEl?.classList.contains('accessed-transcript') ||
        /transcript/i.test(nextEl?.textContent || '')
    );
    if (!hasTranscript) {
      push({
        ruleId: 'audio-transcript',
        wcagCriterion: '1.2.1 Audio-only and Video-only',
        wcagLevel: 'A',
        principle: 'Perceivable',
        disabilities: ['deaf-hoh'],
        severity: 'critical',
        title: 'Audio clip missing text transcript',
        description:
          'Prerecorded audio-only lessons or archival recordings must provide a full text transcript.',
        studentImpact:
          'Deaf and hard-of-hearing students cannot access spoken audio recordings without a written transcript.',
        snippet: getSnippet(audio),
        autoFixable: true,
        needsReview: true,
      });
    }
  });

  // 11. Deprecated distracting elements (<marquee>, <blink>)
  const distracting = Array.from(doc.querySelectorAll('marquee, blink'));
  distracting.forEach((el) => {
    push({
      ruleId: 'deprecated-distracting',
      wcagCriterion: '2.2.2 Pause, Stop, Hide',
      wcagLevel: 'A',
      principle: 'Operable',
      disabilities: ['motor-cognitive', 'low-vision'],
      severity: 'serious',
      title: `Deprecated moving/blinking <${el.tagName.toLowerCase()}> element`,
      description: 'Auto-scrolling or blinking text cannot be paused by students.',
      studentImpact:
        'Distracts students with ADHD or cognitive disabilities and can trigger vestibular discomfort.',
      snippet: getSnippet(el),
      autoFixable: true,
    });
  });

  // 12. Positive tabindex
  const positiveTab = Array.from(doc.querySelectorAll('[tabindex]')).filter((el) => {
    const val = parseInt(el.getAttribute('tabindex') || '0', 10);
    return val > 0;
  });
  positiveTab.forEach((el) => {
    push({
      ruleId: 'positive-tabindex',
      wcagCriterion: '2.4.3 Focus Order',
      wcagLevel: 'A',
      principle: 'Operable',
      disabilities: ['blind', 'motor-cognitive'],
      severity: 'moderate',
      title: `Positive tabindex="${el.getAttribute('tabindex')}" disrupts keyboard order`,
      description: 'Positive tabindex values override the natural DOM focus order.',
      studentImpact: 'Keyboard users jump unpredictably around the page.',
      snippet: getSnippet(el),
      autoFixable: true,
    });
  });

  // Compute compliance score (0 - 100)
  const counts = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    serious: issues.filter((i) => i.severity === 'serious').length,
    moderate: issues.filter((i) => i.severity === 'moderate').length,
    total: issues.length,
    autoFixable: issues.filter((i) => i.autoFixable).length,
  };

  const penalty = counts.critical * 14 + counts.serious * 8 + counts.moderate * 4;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { score, issues, counts };
}
