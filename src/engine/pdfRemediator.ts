import * as pdfjsLib from 'pdfjs-dist';
import DOMPurify from 'dompurify';
import { createWorker } from 'tesseract.js';
import type { AiConfig, CourseContext } from '../types';
import { extractPdfPageHtmlWithVisionAi, isVisionAiReady } from './aiEnhancer';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export interface PdfConversionProgress {
  page: number;
  totalPages: number;
  stage: string;
}

export interface PdfConversionResult {
  html: string;
  title: string;
  pageCount: number;
  method: 'vision-ai' | 'ocr-tesseract';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function structurePlainTextToHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // Detect bullet list block
    if (lines.every((l) => /^[-*•]\s+/.test(l))) {
      const items = lines.map((l) => `  <li>${escapeHtml(l.replace(/^[-*•]\s+/, ''))}</li>`).join('\n');
      parts.push(`<ul>\n${items}\n</ul>`);
      continue;
    }

    // Detect numbered list block
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
      const items = lines.map((l) => `  <li>${escapeHtml(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('\n');
      parts.push(`<ol>\n${items}\n</ol>`);
      continue;
    }

    // Detect short heading-like single line
    if (
      lines.length === 1 &&
      lines[0].length >= 3 &&
      lines[0].length <= 80 &&
      !/[.!?]$/.test(lines[0])
    ) {
      parts.push(`<h3>${escapeHtml(lines[0])}</h3>`);
      continue;
    }

    parts.push(`<p>${escapeHtml(lines.join(' '))}</p>`);
  }

  return parts.join('\n');
}

export function wrapAccessibleStudyGuideHtml(
  title: string,
  bodyHtml: string,
  lang = 'en'
): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.65; color: #0f172a; background: #ffffff; max-width: 860px; margin: 0 auto; padding: 24px 20px 48px; }
    .skip-link { position: absolute; top: -48px; left: 12px; background: #0f172a; color: #ffffff; padding: 10px 16px; border-radius: 6px; font-weight: 600; z-index: 10000; text-decoration: none; }
    .skip-link:focus { top: 12px; outline: 3px solid #0284c7; outline-offset: 2px; }
    h1, h2, h3 { color: #0f172a; line-height: 1.3; margin-top: 1.4em; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .pdf-page-section { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <main id="main-content">
    <h1>${safeTitle}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`;
}

export async function ocrImageWithTesseract(
  imageSource: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(Math.round(m.progress * 100));
      }
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(imageSource);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function convertPdfToAccessibleHtml(
  buffer: ArrayBuffer,
  fileName: string,
  options?: {
    aiConfig?: AiConfig;
    courseContext?: CourseContext;
    language?: string;
    onProgress?: (progress: PdfConversionProgress) => void;
  }
): Promise<PdfConversionResult> {
  const useVisionAi = Boolean(options?.aiConfig && isVisionAiReady(options.aiConfig));
  const cleanTitle = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Accessible Study Guide';

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pageSections: string[] = [];

  let ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
  if (!useVisionAi) {
    options?.onProgress?.({ page: 0, totalPages, stage: 'Initializing offline Tesseract OCR...' });
    ocrWorker = await createWorker('eng');
  }

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      options?.onProgress?.({
        page: pageNum,
        totalPages,
        stage: `Rendering page ${pageNum} of ${totalPages}...`,
      });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize 2D canvas context for PDF rendering.');
      }

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL('image/png');

      let pageHtml = '';
      if (useVisionAi && options?.aiConfig) {
        options?.onProgress?.({
          page: pageNum,
          totalPages,
          stage: `Extracting structured HTML via Vision AI (page ${pageNum}/${totalPages})...`,
        });
        const rawAiHtml = await extractPdfPageHtmlWithVisionAi(
          options.aiConfig,
          dataUrl,
          pageNum,
          totalPages,
          options.courseContext
        );
        pageHtml = DOMPurify.sanitize(rawAiHtml, {
          USE_PROFILES: { html: true, mathMl: true },
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
        });
      } else if (ocrWorker) {
        options?.onProgress?.({
          page: pageNum,
          totalPages,
          stage: `Running offline OCR on page ${pageNum} of ${totalPages}...`,
        });
        const {
          data: { text },
        } = await ocrWorker.recognize(dataUrl);
        pageHtml = structurePlainTextToHtml(text) || '<p><em>No readable text detected on this page.</em></p>';
      }

      pageSections.push(
        `<section class="pdf-page-section" aria-label="Page ${pageNum}">\n<h2>Page ${pageNum}</h2>\n${pageHtml}\n</section>`
      );
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
    await loadingTask.destroy();
  }

  const html = wrapAccessibleStudyGuideHtml(
    cleanTitle,
    pageSections.join('\n'),
    options?.language || 'en'
  );

  return {
    html,
    title: cleanTitle,
    pageCount: totalPages,
    method: useVisionAi ? 'vision-ai' : 'ocr-tesseract',
  };
}
