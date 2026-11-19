import JSZip from 'jszip';
import { getOoxmlAltText, isOoxmlElementDecorative } from './attachments';
import { wrapAccessibleStudyGuideHtml } from './pdfRemediator';

export interface OfficeImageItem {
  id: string;
  partPath: string;
  slideOrPage: number;
  elementId: string;
  elementName: string;
  mediaPath: string;
  dataUrl: string;
  currentAlt: string;
  isDecorative: boolean;
  missingAlt: boolean;
}

export interface OfficeImageFix {
  partPath: string;
  elementId: string;
  altText: string;
  isDecorative: boolean;
}

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const ADEC_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
const DECORATIVE_EXT_URI = '{FF2B5EF6-FFF9-40E9-858B-3C9632B2E5B0}';

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function resolveRelsTarget(baseDir: string, target: string): string {
  const cleanTarget = target.replace(/\\/g, '/');
  if (cleanTarget.startsWith('/')) {
    return cleanTarget.slice(1);
  }
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of cleanTarget.split('/')) {
    if (seg === '..') {
      parts.pop();
    } else if (seg !== '.' && seg !== '') {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

async function parseRelsMap(
  zip: JSZip,
  relsPath: string,
  baseDir: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const file = zip.file(relsPath);
  if (!file) return map;
  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rels = Array.from(doc.getElementsByTagName('Relationship'));
  for (const rel of rels) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) {
      map.set(id, resolveRelsTarget(baseDir, target));
    }
  }
  return map;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractSlideNumber(path: string): number {
  const m = path.match(/slide(\d+)\.xml$/i);
  return m ? parseInt(m[1], 10) : 1;
}

export async function inspectOfficeImages(
  buffer: ArrayBuffer,
  kind: 'pptx' | 'docx'
): Promise<OfficeImageItem[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();
  const items: OfficeImageItem[] = [];

  if (kind === 'pptx') {
    const slideFiles = Object.values(zip.files)
      .filter((f) => !f.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(f.name))
      .sort((a, b) => extractSlideNumber(a.name) - extractSlideNumber(b.name));

    for (const slideFile of slideFiles) {
      const slideNum = extractSlideNumber(slideFile.name);
      const slideBase = slideFile.name.split('/').pop()!;
      const relsMap = await parseRelsMap(
        zip,
        `ppt/slides/_rels/${slideBase}.rels`,
        'ppt/slides'
      );
      const xml = await slideFile.async('string');
      const doc = parser.parseFromString(xml, 'application/xml');
      const pics = Array.from(doc.getElementsByTagNameNS('*', 'pic'));
      const picEls = pics.length > 0 ? pics : Array.from(doc.getElementsByTagName('p:pic'));

      picEls.forEach((pic, idx) => {
        const cNvPr =
          pic.getElementsByTagNameNS('*', 'cNvPr')[0] ||
          pic.getElementsByTagName('p:cNvPr')[0];
        if (!cNvPr) return;

        const elementId = cNvPr.getAttribute('id') || `pic-${idx + 1}`;
        const elementName = cNvPr.getAttribute('name') || `Image ${idx + 1}`;
        const currentAlt = getOoxmlAltText(cNvPr);
        const isDecorative = isOoxmlElementDecorative(cNvPr);

        const blip =
          pic.getElementsByTagNameNS('*', 'blip')[0] ||
          pic.getElementsByTagName('a:blip')[0];
        const rId =
          blip?.getAttributeNS(
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'embed'
          ) ||
          blip?.getAttribute('r:embed') ||
          '';
        const mediaPath = relsMap.get(rId) || '';
        items.push({
          id: `${slideFile.name}#${elementId}`,
          partPath: slideFile.name,
          slideOrPage: slideNum,
          elementId,
          elementName,
          mediaPath,
          dataUrl: '',
          currentAlt,
          isDecorative,
          missingAlt: !isDecorative && !currentAlt,
        });
      });
    }
  } else {
    const docFile = zip.file('word/document.xml');
    if (!docFile) return items;
    const relsMap = await parseRelsMap(zip, 'word/_rels/document.xml.rels', 'word');
    const xml = await docFile.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');

    const docPrsNs = Array.from(doc.getElementsByTagNameNS('*', 'docPr'));
    const docPrs = docPrsNs.length > 0 ? docPrsNs : Array.from(doc.getElementsByTagName('wp:docPr'));

    docPrs.forEach((docPr, idx) => {
      const elementId = docPr.getAttribute('id') || `docPr-${idx + 1}`;
      const elementName = docPr.getAttribute('name') || `Image ${idx + 1}`;
      const currentAlt = getOoxmlAltText(docPr);
      const isDecorative = isOoxmlElementDecorative(docPr);

      // Find nearest ancestor drawing/inline/anchor to locate <a:blip r:embed="...">
      let parent: Element | null = docPr.parentElement;
      let rId = '';
      while (parent && !rId) {
        const blip =
          parent.getElementsByTagNameNS('*', 'blip')[0] ||
          parent.getElementsByTagName('a:blip')[0];
        if (blip) {
          rId =
            blip.getAttributeNS(
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
              'embed'
            ) ||
            blip.getAttribute('r:embed') ||
            '';
          break;
        }
        if (parent.localName === 'drawing' || parent.localName === 'document') break;
        parent = parent.parentElement;
      }

      const mediaPath = relsMap.get(rId) || '';
      items.push({
        id: `word/document.xml#${elementId}`,
        partPath: 'word/document.xml',
        slideOrPage: 1,
        elementId,
        elementName,
        mediaPath,
        dataUrl: '',
        currentAlt,
        isDecorative,
        missingAlt: !isDecorative && !currentAlt,
      });
    });
  }

  // Populate base64 data URLs for each resolved media path
  for (const item of items) {
    if (!item.mediaPath) continue;
    const mediaFile = zip.file(item.mediaPath);
    if (!mediaFile) continue;
    const bytes = await mediaFile.async('uint8array');
    const mime = mimeFromExt(item.mediaPath);
    item.dataUrl = `data:${mime};base64,${uint8ToBase64(bytes)}`;
  }

  return items;
}

function setDecorativeFlag(doc: Document, targetEl: Element, decorative: boolean): void {
  // Remove existing decorative elements
  const existingDec = Array.from(targetEl.getElementsByTagName('*')).filter(
    (n) => n.localName === 'decorative'
  );
  for (const node of existingDec) {
    const extParent = node.parentElement;
    node.parentNode?.removeChild(node);
    if (extParent && extParent.localName === 'ext' && extParent.children.length === 0) {
      extParent.parentNode?.removeChild(extParent);
    }
  }

  if (!decorative) return;

  let extLst = Array.from(targetEl.children).find((c) => c.localName === 'extLst');
  if (!extLst) {
    extLst = doc.createElementNS(A_NS, 'a:extLst');
    targetEl.appendChild(extLst);
  }
  const ext = doc.createElementNS(A_NS, 'a:ext');
  ext.setAttribute('uri', DECORATIVE_EXT_URI);
  const adec = doc.createElementNS(ADEC_NS, 'adec:decorative');
  adec.setAttribute('val', '1');
  ext.appendChild(adec);
  extLst.appendChild(ext);
}

export async function applyOfficeImageFixes(
  buffer: ArrayBuffer,
  kind: 'pptx' | 'docx',
  fixes: OfficeImageFix[]
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const fixesByPart = new Map<string, OfficeImageFix[]>();
  for (const fix of fixes) {
    const arr = fixesByPart.get(fix.partPath) || [];
    arr.push(fix);
    fixesByPart.set(fix.partPath, arr);
  }

  for (const [partPath, partFixes] of fixesByPart.entries()) {
    const file = zip.file(partPath);
    if (!file) continue;
    const xml = await file.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');

    const candidates =
      kind === 'pptx'
        ? Array.from(doc.getElementsByTagNameNS('*', 'cNvPr'))
        : Array.from(doc.getElementsByTagNameNS('*', 'docPr'));
    const fallbackCandidates =
      candidates.length > 0
        ? candidates
        : Array.from(doc.getElementsByTagName(kind === 'pptx' ? 'p:cNvPr' : 'wp:docPr'));

    for (const fix of partFixes) {
      const target = fallbackCandidates.find((el) => el.getAttribute('id') === fix.elementId);
      if (!target) continue;

      if (fix.isDecorative) {
        target.removeAttribute('descr');
        setDecorativeFlag(doc, target, true);
      } else {
        setDecorativeFlag(doc, target, false);
        target.setAttribute('descr', fix.altText.trim());
      }
    }

    const updatedXml = serializer.serializeToString(doc);
    zip.file(partPath, updatedXml);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

function getAllTextInElement(el: Element): string {
  const tNodes = Array.from(el.getElementsByTagNameNS('*', 't'));
  const nodes = tNodes.length > 0 ? tNodes : Array.from(el.getElementsByTagName('a:t'));
  return nodes.map((n) => n.textContent || '').join('').trim();
}

export async function extractOfficeHtmlOutline(
  buffer: ArrayBuffer,
  kind: 'pptx' | 'docx',
  fileName: string
): Promise<{ html: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();
  const cleanTitle =
    fileName
      .replace(/\.(pptx|docx)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Document Outline';

  const sections: string[] = [];

  if (kind === 'pptx') {
    const slideFiles = Object.values(zip.files)
      .filter((f) => !f.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(f.name))
      .sort((a, b) => extractSlideNumber(a.name) - extractSlideNumber(b.name));

    for (const slideFile of slideFiles) {
      const slideNum = extractSlideNumber(slideFile.name);
      const xml = await slideFile.async('string');
      const doc = parser.parseFromString(xml, 'application/xml');

      let slideTitle = `Slide ${slideNum}`;
      const bullets: string[] = [];
      const shapes = Array.from(doc.getElementsByTagNameNS('*', 'sp'));

      for (const sp of shapes) {
        const ph = sp.getElementsByTagNameNS('*', 'ph')[0];
        const phType = ph?.getAttribute('type') || '';
        const paragraphs = Array.from(sp.getElementsByTagNameNS('*', 'p'));
        const texts = paragraphs
          .map((p) => getAllTextInElement(p))
          .filter(Boolean);
        if (texts.length === 0) continue;

        if ((phType === 'title' || phType === 'ctrTitle') && slideTitle === `Slide ${slideNum}`) {
          slideTitle = texts.join(' ');
        } else {
          bullets.push(...texts);
        }
      }

      // Extract image alt texts on this slide
      const alts: string[] = [];
      const pics = Array.from(doc.getElementsByTagNameNS('*', 'pic'));
      for (const pic of pics) {
        const cNvPr = pic.getElementsByTagNameNS('*', 'cNvPr')[0];
        if (!cNvPr || isOoxmlElementDecorative(cNvPr)) continue;
        const alt = getOoxmlAltText(cNvPr);
        alts.push(alt ? alt : '[Unlabelled image]');
      }

      // Extract speaker notes via slide rels
      const slideBase = slideFile.name.split('/').pop()!;
      const relsMap = await parseRelsMap(
        zip,
        `ppt/slides/_rels/${slideBase}.rels`,
        'ppt/slides'
      );
      const notesTexts: string[] = [];
      for (const target of relsMap.values()) {
        if (/notesSlide\d+\.xml$/i.test(target)) {
          const notesFile = zip.file(target);
          if (notesFile) {
            const notesXml = await notesFile.async('string');
            const notesDoc = parser.parseFromString(notesXml, 'application/xml');
            const ps = Array.from(notesDoc.getElementsByTagNameNS('*', 'p'));
            for (const p of ps) {
              const t = getAllTextInElement(p);
              if (t && !/^\d+$/.test(t)) notesTexts.push(t);
            }
          }
        }
      }

      const part: string[] = [`<section aria-label="Slide ${slideNum}">`, `<h2>Slide ${slideNum}: ${escapeHtml(slideTitle)}</h2>`];
      if (bullets.length > 0) {
        part.push('<ul>');
        for (const b of bullets) part.push(`  <li>${escapeHtml(b)}</li>`);
        part.push('</ul>');
      }
      if (alts.length > 0) {
        part.push('<h3>Slide Figures &amp; Alt Text</h3><ul>');
        for (const a of alts) part.push(`  <li>${escapeHtml(a)}</li>`);
        part.push('</ul>');
      }
      if (notesTexts.length > 0) {
        part.push(`<h3>Speaker Notes</h3><p>${escapeHtml(notesTexts.join(' '))}</p>`);
      }
      part.push('</section>');
      sections.push(part.join('\n'));
    }
  } else {
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      const xml = await docFile.async('string');
      const doc = parser.parseFromString(xml, 'application/xml');
      const body = doc.getElementsByTagNameNS('*', 'body')[0] || doc.documentElement;

      let inList = false;
      const closeList = () => {
        if (inList) {
          sections.push('</ul>');
          inList = false;
        }
      };

      for (const child of Array.from(body.children)) {
        if (child.localName === 'p') {
          const pStyle = child.getElementsByTagNameNS('*', 'pStyle')[0]?.getAttribute('w:val') ||
            child.getElementsByTagNameNS('*', 'pStyle')[0]?.getAttribute('val') || '';
          const numPr = child.getElementsByTagNameNS('*', 'numPr')[0];
          const text = getAllTextInElement(child);

          // Check embedded images in paragraph
          const docPrs = Array.from(child.getElementsByTagNameNS('*', 'docPr'));
          for (const dp of docPrs) {
            if (isOoxmlElementDecorative(dp)) continue;
            const alt = getOoxmlAltText(dp);
            closeList();
            sections.push(`<p><em>[Figure: ${escapeHtml(alt || 'Unlabelled image')}]</em></p>`);
          }

          if (!text) continue;

          const headingMatch = pStyle.match(/^Heading([1-6])$/i);
          if (headingMatch) {
            closeList();
            const level = Math.min(6, Math.max(2, parseInt(headingMatch[1], 10) + 1));
            sections.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
          } else if (numPr) {
            if (!inList) {
              sections.push('<ul>');
              inList = true;
            }
            sections.push(`  <li>${escapeHtml(text)}</li>`);
          } else {
            closeList();
            sections.push(`<p>${escapeHtml(text)}</p>`);
          }
        } else if (child.localName === 'tbl') {
          closeList();
          const rows = Array.from(child.getElementsByTagNameNS('*', 'tr'));
          if (rows.length > 0) {
            sections.push('<table>');
            rows.forEach((tr, rIdx) => {
              const cells = Array.from(tr.getElementsByTagNameNS('*', 'tc'));
              const tag = rIdx === 0 ? 'th scope="col"' : 'td';
              const closeTag = rIdx === 0 ? 'th' : 'td';
              const rowHtml = cells
                .map((tc) => `<${tag}>${escapeHtml(getAllTextInElement(tc))}</${closeTag}>`)
                .join('');
              if (rIdx === 0) sections.push(`<thead><tr>${rowHtml}</tr></thead><tbody>`);
              else sections.push(`<tr>${rowHtml}</tr>`);
            });
            sections.push('</tbody></table>');
          }
        }
      }
      closeList();
    }
  }

  const html = wrapAccessibleStudyGuideHtml(
    `${cleanTitle} (Accessible Outline)`,
    sections.join('\n') || '<p>No extractable text content found.</p>'
  );
  return { html, title: `${cleanTitle} (Accessible Outline)` };
}
