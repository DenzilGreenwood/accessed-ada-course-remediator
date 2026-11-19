import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REMEDIATION_OPTIONS, type CoursePackage } from '../../types';
import { auditDocxBuffer, auditPptxBuffer } from '../attachments';
import { auditHtml } from '../auditor';
import { createCoursePage, exportRemediatedPackage } from '../imscc';
import { latexToAccessibleLabel, renderLatexToMathMl } from '../mathRemediator';
import {
  applyOfficeImageFixes,
  extractOfficeHtmlOutline,
  inspectOfficeImages,
} from '../officeRemediator';
import {
  structurePlainTextToHtml,
  wrapAccessibleStudyGuideHtml,
} from '../pdfRemediator';
import {
  appendCompanionDataTableToImage,
  remediateHtml,
  replaceImageWithCodeBlock,
  replaceImageWithMathMl,
} from '../remediator';
import { generateComplianceReportMarkdown } from '../report';
import {
  buildRemediatedPreviewHtml,
  sanitizeForPreview,
} from '../../components/PreviewPane';
import { generateScreenReaderPreview } from '../captions';

const TINY_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120,
  156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

async function buildSamplePptxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="1" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Cell Biology Lecture</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Content 2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Mitochondria produce ATP</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="10" name="Diagram 1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
    </p:pic>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="11" name="TitleOnly" title="Labeled via title"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
    </p:pic>
    <p:pic>
      <p:nvPicPr>
        <p:cNvPr id="12" name="Decor">
          <a:extLst><a:ext uri="{FF2B5EF6-FFF9-40E9-858B-3C9632B2E5B0}"><adec:decorative val="1"/></a:ext></a:extLst>
        </p:cNvPr>
        <p:cNvPicPr/><p:nvPr/>
      </p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`
  );
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`
  );
  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Explain ATP synthase on this slide.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`
  );
  zip.file('ppt/media/image1.png', TINY_PNG_BYTES);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function buildSampleDocxBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Lab Protocol</a:t></w:r></w:p>
    <w:p><w:r><w:t>Observe the figure below.</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:docPr id="21" name="Picture 1"/><a:graphic><a:graphicData><a:blip r:embed="rId1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  </w:body>
</w:document>`.replace('</a:t>', '</w:t>')
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`
  );
  zip.file('word/media/image1.png', TINY_PNG_BYTES);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('Capability 1: Accessible PDF Study Guide HTML Generation', () => {
  it('structures plain OCR text into semantic HTML wrapped in WCAG 2.1 AA boilerplate', () => {
    const body = structurePlainTextToHtml(
      'Course Overview\n\n- Read chapter 1\n- Complete quiz\n\nWelcome to biology.'
    );
    const full = wrapAccessibleStudyGuideHtml('Syllabus Guide', body);
    expect(full).toContain('<!DOCTYPE html>');
    expect(full).toContain('<html lang="en">');
    expect(full).toContain('<a class="skip-link" href="#main-content">');
    expect(full).toContain('<h3>Course Overview</h3>');
    expect(full).toContain('<ul>');
    const audit = auditHtml(full);
    expect(audit.counts.critical).toBe(0);
  });
});

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Capability 2: Office (.pptx / .docx) Inspection, In-Place Patching & Outline', () => {
  it('audits .pptx respecting title and adec:decorative, patches missing alt in-place, and extracts outline', async () => {
    const pptxBuf = await buildSamplePptxBuffer();
    const initialAudit = await auditPptxBuffer('files/lecture.pptx', pptxBuf);
    // Only id="10" is missing alt; id="11" has title and id="12" is decorative
    expect(initialAudit.summary).toContain('1 image missing alt text');
    expect(initialAudit.status).toBe('critical');

    const images = await inspectOfficeImages(pptxBuf, 'pptx');
    expect(images).toHaveLength(3);
    expect(images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(images[0].missingAlt).toBe(true);
    expect(images[1].missingAlt).toBe(false);
    expect(images[2].isDecorative).toBe(true);

    const patched = await applyOfficeImageFixes(pptxBuf, 'pptx', [
      {
        partPath: 'ppt/slides/slide1.xml',
        elementId: '10',
        altText: 'Diagram of mitochondrial ATP synthesis',
        isDecorative: false,
      },
    ]);
    const patchedBuf = patched.buffer.slice(
      patched.byteOffset,
      patched.byteOffset + patched.byteLength
    ) as ArrayBuffer;
    const afterAudit = await auditPptxBuffer('files/lecture.pptx', patchedBuf);
    expect(afterAudit.status).toBe('review');
    expect(afterAudit.details[0]).toContain('all have alt text');

    const outline = await extractOfficeHtmlOutline(patchedBuf, 'pptx', 'lecture.pptx');
    expect(outline.html).toContain('Cell Biology Lecture');
    expect(outline.html).toContain('Mitochondria produce ATP');
    expect(outline.html).toContain('Diagram of mitochondrial ATP synthesis');
    expect(outline.html).toContain('Explain ATP synthase on this slide.');
  });

  it('audits and patches .docx images in-place and exports via imscc.ts & report.ts', async () => {
    const docxBuf = await buildSampleDocxBuffer();
    const initial = await auditDocxBuffer('docs/lab.docx', docxBuf);
    expect(initial.status).toBe('critical');

    const patched = await applyOfficeImageFixes(docxBuf, 'docx', [
      {
        partPath: 'word/document.xml',
        elementId: '21',
        altText: '',
        isDecorative: true,
      },
    ]);
    const patchedBuf = patched.buffer.slice(
      patched.byteOffset,
      patched.byteOffset + patched.byteLength
    ) as ArrayBuffer;
    const after = await auditDocxBuffer('docs/lab.docx', patchedBuf);
    expect(after.status).toBe('review');

    // Verify imscc export includes patched binary & registers new companion page in imsmanifest.xml
    const baseZip = new JSZip();
    baseZip.file(
      'imsmanifest.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <organizations><organization identifier="org1"></organization></organizations>
  <resources></resources>
</manifest>`
    );
    baseZip.file('docs/lab.docx', docxBuf);
    const zipArrayBuffer = await baseZip.generateAsync({ type: 'arraybuffer' });

    const companionPage = createCoursePage(
      'docs/lab-accessible.html',
      wrapAccessibleStudyGuideHtml('Lab Guide', '<p>Accessible content</p>')
    );
    const pkg: CoursePackage = {
      name: 'Bio 101',
      sourceType: 'imscc',
      originalFileName: 'bio101.imscc',
      zipArrayBuffer,
      extraBinaryFiles: { 'docs/lab.docx': patched },
      attachments: [
        {
          ...after,
          remediated: true,
          remediatedNote: 'Patched in-place in .imscc export',
        },
      ],
      pages: [companionPage],
    };

    const exportedBlob = await exportRemediatedPackage(pkg);
    const exportedBuf = await blobToArrayBuffer(exportedBlob);
    const exportedZip = await JSZip.loadAsync(exportedBuf);
    const manifestOut = await exportedZip.file('imsmanifest.xml')!.async('string');
    expect(manifestOut).toContain('docs/lab-accessible.html');

    const report = generateComplianceReportMarkdown(pkg);
    expect(report).toContain('REMEDIATED');
  });
});

describe('Capability 3: ASCII Diagrams & Code Screenshot Conversion', () => {
  it('flags and auto-remediates ASCII art <pre> blocks into <figure role="img">', () => {
    const html = `<!doctype html><html lang="en"><head><title>Trees</title></head><body><main>
      <h1>Binary Tree</h1>
      <pre>
        ┌───┐
        │ A │
        └─┬─┘
      ┌───┴───┐
      │ B   C │
      └───────┘
      </pre>
    </main></body></html>`;

    const before = auditHtml(html);
    expect(before.issues.some((i) => i.ruleId === 'ascii-diagram')).toBe(true);

    const { html: fixed, changes } = remediateHtml(html, DEFAULT_REMEDIATION_OPTIONS);
    expect(changes.some((c) => c.ruleId === 'ascii-diagram')).toBe(true);
    expect(fixed).toContain('<figure role="img"');
    expect(fixed).toContain('aria-hidden="true"');

    const after = auditHtml(fixed);
    expect(after.issues.some((i) => i.ruleId === 'ascii-diagram')).toBe(false);
  });

  it('replaces a code screenshot <img> with semantic <figure><pre><code>', () => {
    const html = `<p><img src="code.png" /></p>`;
    const updated = replaceImageWithCodeBlock(
      html,
      0,
      'def greet(name):\n    return f"Hello {name}"',
      'python',
      'Python greeting function'
    );
    expect(updated).toContain('<figure class="accessed-code-figure">');
    expect(updated).toContain('<code class="language-python">');
    expect(updated).toContain('<figcaption>Python greeting function</figcaption>');
    expect(updated).not.toContain('<img');
  });
});

describe('Capability 4: Raw LaTeX & Equation Image -> Semantic MathML', () => {
  it('detects and upgrades raw LaTeX expressions to navigable MathML', () => {
    const html = `<!doctype html><html lang="en"><head><title>Math</title></head><body><main>
      <h1>Quadratic Formula</h1>
      <p>Solve using \\(x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\).</p>
    </main></body></html>`;

    const before = auditHtml(html);
    expect(before.issues.some((i) => i.ruleId === 'raw-latex')).toBe(true);

    const { html: fixed } = remediateHtml(html, DEFAULT_REMEDIATION_OPTIONS);
    expect(fixed).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(fixed).toContain('role="math"');

    const after = auditHtml(fixed);
    expect(after.issues.some((i) => i.ruleId === 'raw-latex')).toBe(false);
  });

  it('replaces an equation <img> with MathML and plain-English aria-label', () => {
    const mathMl = renderLatexToMathMl('E = mc^2');
    expect(mathMl).toContain('<math');
    expect(latexToAccessibleLabel('\\frac{a}{b}')).toContain('a over b');

    const updated = replaceImageWithMathMl('<p><img src="eq.png" /></p>', 0, 'E = mc^2');
    expect(updated).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(updated).toContain('aria-label="Math equation: E = mc squared"');
    expect(updated).not.toContain('<img');
  });
});

describe('Capability 5: Complex Charts -> Companion Data Table', () => {
  it('injects a collapsible WCAG 1.1.1 <details> data table beneath an <img>', () => {
    const html = `<p><img src="chart.png" /></p>`;
    const updated = appendCompanionDataTableToImage(html, 0, {
      title: 'Enrollment Growth',
      headers: ['Year', 'Students'],
      rows: [
        ['2024', '120'],
        ['2025', '185'],
      ],
    });
    expect(updated).toContain('<details class="accessed-data-table">');
    expect(updated).toContain('<summary>Accessible Data Table: Enrollment Growth</summary>');
    expect(updated).toContain('<caption>Enrollment Growth</caption>');
    expect(updated).toContain('<th scope="col">Year</th>');
    expect(updated).toContain('<th scope="row">2024</th>');
    expect(updated).toContain('<td>120</td>');
  });
});

describe('Preview Windows & Screen-Reader Simulator', () => {
  it('preserves MathML, <details>, <figure>, and injects ADA highlight CSS in PreviewPane', () => {
    const raw = `
      <figure role="img" aria-label="Binary tree"><pre aria-hidden="true">┌─┐</pre><figcaption>Binary tree</figcaption></figure>
      <span class="accessed-math" role="math" aria-label="Math equation: x squared"><math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math></span>
      <details class="accessed-data-table"><summary>Accessible Data Table: Growth</summary><table><caption>Growth</caption><thead><tr><th scope="col">Year</th></tr></thead></table></details>
    `;
    const sanitized = sanitizeForPreview(raw);
    expect(sanitized).toContain('<math');
    expect(sanitized).toContain('role="img"');
    expect(sanitized).toContain('aria-label="Binary tree"');
    expect(sanitized).toContain('<details');

    const preview = buildRemediatedPreviewHtml(sanitized, true);
    expect(preview).toContain('id="accessed-preview-helper-css"');
    expect(preview).toContain('open>');

    const sr = generateScreenReaderPreview(raw);
    expect(sr.items.some((i) => i.role === 'Diagram / Image' && i.text === 'Binary tree')).toBe(true);
    expect(sr.items.some((i) => i.role === 'Math' && i.text === 'Math equation: x squared')).toBe(true);
  });
});
