import JSZip from 'jszip';
import type { AttachmentAudit } from '../types';

/**
 * Lightweight, zero-worker client-side PDF accessibility inspector.
 * Inspects PDF binary structure for Tagged PDF (/StructTreeRoot),
 * extractable text/fonts (/Font, BT/Tj/TJ), embedded images (/Subtype /Image),
 * and document language (/Lang).
 */
export function auditPdfBuffer(
  path: string,
  buffer: ArrayBuffer
): AttachmentAudit {
  const bytes = new Uint8Array(buffer);
  // Decode as latin1 so PDF keywords and ASCII operators remain intact
  let text = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  const fileName = path.replace(/^.*[\\/]/, '');
  const hasStructTree = /\/StructTreeRoot\b/.test(text);
  const hasFont = /\/Type\s*\/Font\b|\/BaseFont\b/.test(text);
  const hasTextOperators = /\bBT\b[\s\S]{0,400}\b(Tj|TJ|')\b/.test(text);
  const hasImages = /\/Subtype\s*\/Image\b/.test(text);
  const hasLang = /\/Lang\s*\([^)]+\)/.test(text);
  const hasFlate = /\/FlateDecode\b/.test(text);

  const details: string[] = [];

  // Image-only scanned PDF: has images, no fonts, no text operators, no structure tree
  const looksScannedImageOnly =
    (!hasFont && !hasTextOperators && hasImages) ||
    (!hasFont && !hasTextOperators && !hasFlate);

  if (looksScannedImageOnly) {
    details.push('No selectable text or font definitions detected — likely a scanned image PDF.');
    details.push('Screen readers cannot read scanned images without OCR and PDF tagging.');
    details.push('Action: Run OCR + Auto-Tag in Adobe Acrobat or convert this reading to an accessible HTML page.');
    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'pdf',
      sizeBytes: buffer.byteLength,
      status: 'critical',
      summary: 'Untagged / Scanned Image PDF (Critical Barrier)',
      details,
      wcagCriterion: '1.1.1 / 1.3.1 / 1.4.5',
    };
  }

  if (!hasStructTree) {
    details.push('Missing PDF Structure Tree (/StructTreeRoot) — not a Tagged PDF.');
    if (!hasLang) details.push('Missing PDF document language (/Lang).');
    details.push('Action: Add accessibility tags (headings, reading order, alt text) in Adobe Acrobat or Word before exporting.');
    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'pdf',
      sizeBytes: buffer.byteLength,
      status: 'review',
      summary: 'Untagged PDF (Needs Manual Tagging)',
      details,
      wcagCriterion: '1.3.1 Info and Relationships',
    };
  }

  if (!hasLang) {
    details.push('PDF is tagged (/StructTreeRoot found), but document language (/Lang) was not detected.');
    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'pdf',
      sizeBytes: buffer.byteLength,
      status: 'review',
      summary: 'Tagged PDF — Verify Language & Alt Text',
      details,
      wcagCriterion: '3.1.1 Language of Page',
    };
  }

  details.push('PDF includes structure tags (/StructTreeRoot) and language metadata (/Lang).');
  details.push('Recommended: Spot-check reading order and figure alt text.');
  return {
    id: `att-${path}`,
    path,
    fileName,
    kind: 'pdf',
    sizeBytes: buffer.byteLength,
    status: 'ok',
    summary: 'Tagged PDF Detected',
    details,
    wcagCriterion: '1.3.1 / 3.1.1',
  };
}

/** Namespace-agnostic element lookup that works across browsers and jsdom */
export function getElementsByLocalName(
  root: Document | Element,
  localName: string
): Element[] {
  const all = root.getElementsByTagName('*');
  const out: Element[] = [];
  const suffix = `:${localName}`;
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (
      el.localName === localName ||
      el.tagName === localName ||
      el.tagName.endsWith(suffix)
    ) {
      out.push(el);
    }
  }
  return out;
}

/** Checks if an OOXML cNvPr or docPr element is marked decorative via adec:decorative val="1" */
export function isOoxmlElementDecorative(el: Element): boolean {
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const node = all[i];
    if (node.localName === 'decorative' && node.getAttribute('val') === '1') {
      return true;
    }
  }
  return false;
}

/** Checks whether an OOXML cNvPr or docPr element has alt text in descr or title */
export function getOoxmlAltText(el: Element): string {
  const descr = el.getAttribute('descr')?.trim() || '';
  if (descr) return descr;
  return el.getAttribute('title')?.trim() || '';
}

/** Audits a .pptx slide deck inside an LMS archive for missing image alt text */
export async function auditPptxBuffer(
  path: string,
  buffer: ArrayBuffer
): Promise<AttachmentAudit> {
  const fileName = path.replace(/^.*[\\/]/, '');
  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.values(zip.files).filter(
      (f) => !f.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(f.name)
    );
    const parser = new DOMParser();
    let totalPics = 0;
    let missingAltPics = 0;

    for (const slide of slideFiles) {
      const xmlText = await slide.async('string');
      const doc = parser.parseFromString(xmlText, 'application/xml');
      const picEls = getElementsByLocalName(doc, 'pic');

      for (const pic of picEls) {
        totalPics += 1;
        const cNvPr = getElementsByLocalName(pic, 'cNvPr')[0] || null;
        if (!cNvPr) {
          missingAltPics += 1;
          continue;
        }
        if (isOoxmlElementDecorative(cNvPr)) {
          continue;
        }
        if (!getOoxmlAltText(cNvPr)) {
          missingAltPics += 1;
        }
      }
    }

    if (missingAltPics > 0) {
      return {
        id: `att-${path}`,
        path,
        fileName,
        kind: 'pptx',
        sizeBytes: buffer.byteLength,
        status: 'critical',
        summary: `PowerPoint (${slideFiles.length} slides) — ${missingAltPics} image${missingAltPics === 1 ? '' : 's'} missing alt text`,
        details: [
          `Inspected ${slideFiles.length} slides and ${totalPics} embedded images (checked descr, title, and decorative flags).`,
          `${missingAltPics} non-decorative image(s) have no alt-text description.`,
          'Action: Expand this attachment below to add alt text or mark images decorative in-place, or extract an accessible HTML outline.',
        ],
        wcagCriterion: '1.1.1 Non-text Content',
      };
    }

    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'pptx',
      sizeBytes: buffer.byteLength,
      status: 'review',
      summary: `PowerPoint (${slideFiles.length} slides) — Verify reading order & contrast`,
      details: [
        `Inspected ${slideFiles.length} slides (${totalPics} images all have alt text or are marked decorative).`,
        'Action: Spot-check slide reading order and color contrast in PowerPoint Accessibility Checker.',
      ],
      wcagCriterion: '1.3.2 / 1.4.3',
    };
  } catch {
    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'pptx',
      sizeBytes: buffer.byteLength,
      status: 'review',
      summary: 'Slide Deck Attachment (Manual Review Required)',
      details: ['Could not unpack slide XML; review manually with PowerPoint Accessibility Checker.'],
      wcagCriterion: '1.1.1 / 1.3.1',
    };
  }
}

/** Audits a .docx Word document inside an LMS archive for missing image alt text */
export async function auditDocxBuffer(
  path: string,
  buffer: ArrayBuffer
): Promise<AttachmentAudit> {
  const fileName = path.replace(/^.*[\\/]/, '');
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('Missing word/document.xml');
    }
    const xml = await docXmlFile.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const docPrs = getElementsByLocalName(doc, 'docPr');

    const missingAlt = docPrs.filter(
      (el) => !isOoxmlElementDecorative(el) && !getOoxmlAltText(el)
    ).length;
    const hasHeadingStyles = /pStyle\s+w:val="Heading\d"/i.test(xml);

    const details: string[] = [];
    if (missingAlt > 0) {
      details.push(`${missingAlt} non-decorative embedded image(s) missing alt text (checked descr, title, and decorative flags).`);
    }
    if (!hasHeadingStyles) {
      details.push('No Word Heading styles (Heading 1/2/3) detected.');
    }
    details.push('Action: Expand this attachment below to repair image alt text in-place or extract an accessible HTML outline.');

    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'docx',
      sizeBytes: buffer.byteLength,
      status: missingAlt > 0 ? 'critical' : 'review',
      summary:
        missingAlt > 0
          ? `Word Document — ${missingAlt} image(s) missing alt text`
          : !hasHeadingStyles
            ? 'Word Document — Missing semantic Heading styles'
            : 'Word Document — Manual Verification Recommended',
      details,
      wcagCriterion: missingAlt > 0 ? '1.1.1 Non-text Content' : '1.3.1 Info and Relationships',
    };
  } catch {
    return {
      id: `att-${path}`,
      path,
      fileName,
      kind: 'docx',
      sizeBytes: buffer.byteLength,
      status: 'review',
      summary: 'Word Document Attachment (Manual Review Required)',
      details: ['Review manually using Microsoft Word Accessibility Checker.'],
      wcagCriterion: '1.3.1 Info and Relationships',
    };
  }
}

/** Scans all non-HTML attachments inside an uploaded .imscc / .zip archive */
export async function auditArchiveAttachments(zip: JSZip): Promise<AttachmentAudit[]> {
  const results: AttachmentAudit[] = [];

  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith('__MACOSX/')) continue;
    const lower = entry.name.toLowerCase();

    if (lower.endsWith('.pdf')) {
      const buf = await entry.async('arraybuffer');
      results.push(auditPdfBuffer(entry.name, buf));
    } else if (lower.endsWith('.pptx')) {
      const buf = await entry.async('arraybuffer');
      results.push(await auditPptxBuffer(entry.name, buf));
    } else if (lower.endsWith('.docx')) {
      const buf = await entry.async('arraybuffer');
      results.push(await auditDocxBuffer(entry.name, buf));
    } else if (/\.(mp4|mov|webm|mp3|wav|m4a)$/i.test(lower)) {
      const buf = await entry.async('arraybuffer');
      const isAudio = /\.(mp3|wav|m4a)$/i.test(lower);
      results.push({
        id: `att-${entry.name}`,
        path: entry.name,
        fileName: entry.name.replace(/^.*[\\/]/, ''),
        kind: 'media',
        sizeBytes: buf.byteLength,
        status: 'review',
        summary: isAudio
          ? 'Attached Audio File — Verify Text Transcript (WCAG 1.2.1)'
          : 'Attached Video File — Verify Closed Captions & Audio Descriptions',
        details: [
          isAudio
            ? 'Ensure a full text transcript is linked or embedded alongside this audio clip.'
            : 'Upload this video into AccessEd Video Studio to attach WebVTT captions and visual descriptions.',
        ],
        wcagCriterion: isAudio ? '1.2.1 Audio-only' : '1.2.2 / 1.2.5',
      });
    }
  }

  return results.sort((a, b) => {
    const order = { critical: 0, review: 1, ok: 2 };
    return order[a.status] - order[b.status] || a.path.localeCompare(b.path);
  });
}
