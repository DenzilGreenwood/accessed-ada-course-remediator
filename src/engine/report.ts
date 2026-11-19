import JSZip from 'jszip';
import type { CoursePackage } from '../types';

interface ReportMetrics {
  timestamp: string;
  isoTimestamp: string;
  totalBefore: number;
  totalAfter: number;
  resolved: number;
  avgBefore: number;
  avgAfter: number;
  criticalAttachments: number;
}

function getMetrics(pkg: CoursePackage): ReportMetrics {
  const now = new Date();
  const totalBefore = pkg.pages.reduce((sum, p) => sum + p.originalAudit.counts.total, 0);
  const totalAfter = pkg.pages.reduce((sum, p) => sum + p.remediatedAudit.counts.total, 0);
  const avgBefore = pkg.pages.length
    ? Math.round(pkg.pages.reduce((s, p) => s + p.originalAudit.score, 0) / pkg.pages.length)
    : 100;
  const avgAfter = pkg.pages.length
    ? Math.round(pkg.pages.reduce((s, p) => s + p.remediatedAudit.score, 0) / pkg.pages.length)
    : 100;
  const criticalAttachments = (pkg.attachments || []).filter((a) => a.status === 'critical').length;

  return {
    timestamp: now.toLocaleString(),
    isoTimestamp: now.toISOString(),
    totalBefore,
    totalAfter,
    resolved: Math.max(0, totalBefore - totalAfter),
    avgBefore,
    avgAfter,
    criticalAttachments,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(str: string): string {
  return escapeHtml(str).replace(/'/g, '&apos;');
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 1. Markdown (.md) Report */
export function generateComplianceReportMarkdown(pkg: CoursePackage): string {
  const m = getMetrics(pkg);
  const attachments = pkg.attachments || [];

  const lines: string[] = [
    `# ADA Title II & WCAG 2.1 AA Course Remediation Report`,
    ``,
    `- **Course:** ${pkg.name}`,
    `- **Source File:** ${pkg.originalFileName}`,
    `- **Generated:** ${m.timestamp}`,
    `- **HTML Pages Audited:** ${pkg.pages.length}`,
    `- **HTML Compliance Score:** ${m.avgBefore}% -> **${m.avgAfter}%**`,
    `- **HTML Issues:** ${m.totalBefore} found -> **${m.totalAfter} remaining** (${m.resolved} resolved)`,
    `- **Non-HTML Attachments Audited (PDF/Slides/Docs):** ${attachments.length} (${m.criticalAttachments} critical barrier${m.criticalAttachments === 1 ? '' : 's'})`,
    ``,
    `---`,
    ``,
    `## Page-by-Page Summary`,
    ``,
    `| Page | Before Score | After Score | Issues Resolved | Remaining |`,
    `| --- | ---: | ---: | ---: | ---: |`,
  ];

  for (const page of pkg.pages) {
    const resolved = Math.max(0, page.originalAudit.counts.total - page.remediatedAudit.counts.total);
    lines.push(
      `| ${page.title} (\`${page.path}\`) | ${page.originalAudit.score}% | ${page.remediatedAudit.score}% | ${resolved} | ${page.remediatedAudit.counts.total} |`
    );
  }

  lines.push(``, `---`, ``, `## Detailed Remediation Log`);

  for (const page of pkg.pages) {
    lines.push(``, `### ${page.title} (\`${page.path}\`)`);
    if (page.changes.length > 0) {
      lines.push(``, `**Automated Fixes Applied:**`);
      for (const ch of page.changes) {
        lines.push(`- [${ch.wcagCriterion}] ${ch.summary} (${ch.count}x)`);
      }
    } else {
      lines.push(``, `_No automated fixes applied yet._`);
    }

    if (page.remediatedAudit.issues.length > 0) {
      lines.push(``, `**Items Requiring Educator Review:**`);
      for (const issue of page.remediatedAudit.issues) {
        lines.push(
          `- **${issue.severity.toUpperCase()}** [${issue.wcagCriterion}]: ${issue.title} — ${issue.description}`
        );
      }
    } else {
      lines.push(``, `All automated WCAG 2.1 AA checks passed.`);
    }
  }

  if (attachments.length > 0) {
    lines.push(
      ``,
      `---`,
      ``,
      `## Manual Action Checklist: Attached PDFs, Slides & Media`,
      ``,
      `The following non-HTML course attachments were scanned inside the archive and require manual verification or remediation before certifying full ADA Title II compliance:`,
      ``,
      `| File | Type | Status | WCAG | Findings |`,
      `| --- | --- | --- | --- | --- |`
    );
    for (const att of attachments) {
      const statusLabel = att.remediated
        ? 'REMEDIATED'
        : att.status === 'critical'
          ? 'CRITICAL BARRIER'
          : att.status === 'review'
            ? 'NEEDS REVIEW'
            : 'TAGGED / OK';
      const finding = att.remediatedNote
        ? `${att.summary} — ${att.remediatedNote}${att.companionPagePath ? ` (\`${att.companionPagePath}\`)` : ''}`
        : att.summary;
      lines.push(
        `| \`${att.path}\` | ${att.kind.toUpperCase()} | **${statusLabel}** | ${att.wcagCriterion} | ${finding} |`
      );
    }
  }

  lines.push(
    ``,
    `---`,
    ``,
    `_Note: Automated remediation resolves structural, contrast, semantic, and navigation WCAG 2.1 AA barriers in HTML course pages. Educators should manually verify image alt-text accuracy, closed-caption files (.vtt), and any flagged PDF/slide attachments for full ADA Title II compliance._`
  );

  return lines.join('\n');
}

/** 2. Standalone Accessible HTML (.html) Report */
export function generateComplianceReportHtml(pkg: CoursePackage): string {
  const m = getMetrics(pkg);
  const attachments = pkg.attachments || [];

  const pageRows = pkg.pages
    .map((p) => {
      const resolved = Math.max(0, p.originalAudit.counts.total - p.remediatedAudit.counts.total);
      return `<tr>
        <td><strong>${escapeHtml(p.title)}</strong><br /><code>${escapeHtml(p.path)}</code></td>
        <td>${p.originalAudit.score}%</td>
        <td><strong>${p.remediatedAudit.score}%</strong></td>
        <td>${resolved}</td>
        <td>${p.remediatedAudit.counts.total}</td>
      </tr>`;
    })
    .join('\n');

  const detailSections = pkg.pages
    .map((p) => {
      const fixesHtml =
        p.changes.length > 0
          ? `<ul>${p.changes
              .map(
                (ch) =>
                  `<li><strong>[${escapeHtml(ch.wcagCriterion)}]</strong> ${escapeHtml(ch.summary)} (${ch.count}&times;)</li>`
              )
              .join('')}</ul>`
          : '<p><em>No automated fixes applied yet.</em></p>';

      const remainingHtml =
        p.remediatedAudit.issues.length > 0
          ? `<ul>${p.remediatedAudit.issues
              .map(
                (i) =>
                  `<li><span class="tag tag-${i.severity}">${i.severity.toUpperCase()}</span> <strong>[${escapeHtml(i.wcagCriterion)}]</strong> ${escapeHtml(i.title)} &mdash; ${escapeHtml(i.description)}</li>`
              )
              .join('')}</ul>`
          : '<p class="pass-note">All automated WCAG 2.1 AA checks passed.</p>';

      return `<section class="page-block">
        <h3>${escapeHtml(p.title)} <code>${escapeHtml(p.path)}</code></h3>
        <h4>Automated Fixes Applied</h4>
        ${fixesHtml}
        <h4>Items Requiring Educator Review</h4>
        ${remainingHtml}
      </section>`;
    })
    .join('\n');

  const attachmentSection =
    attachments.length > 0
      ? `<section>
        <h2>Manual Action Checklist: Attached PDFs, Slides &amp; Media</h2>
        <table>
          <caption>Non-HTML course attachments scanned inside the package</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">WCAG</th>
              <th scope="col">Findings</th>
            </tr>
          </thead>
          <tbody>
            ${attachments
              .map(
                (a) => `<tr>
              <td><code>${escapeHtml(a.path)}</code></td>
              <td>${a.kind.toUpperCase()}</td>
              <td><span class="tag tag-${a.status === 'critical' ? 'critical' : a.status === 'review' ? 'serious' : 'ok'}">${a.status === 'critical' ? 'CRITICAL BARRIER' : a.status === 'review' ? 'NEEDS REVIEW' : 'TAGGED / OK'}</span></td>
              <td>${escapeHtml(a.wcagCriterion)}</td>
              <td>${escapeHtml(a.summary)}</td>
            </tr>`
              )
              .join('\n')}
          </tbody>
        </table>
      </section>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ADA Compliance Report — ${escapeHtml(pkg.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #ffffff; max-width: 960px; margin: 0 auto; padding: 28px 20px; line-height: 1.55; }
    header { border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 1.65rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 20px 0 28px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; background: #f8fafc; }
    .kpi-label { font-size: 0.78rem; color: #475569; font-weight: 600; text-transform: uppercase; }
    .kpi-val { font-size: 1.35rem; font-weight: 800; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0 24px; font-size: 0.9rem; }
    caption { text-align: left; font-weight: 700; margin-bottom: 8px; color: #334155; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    .page-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; page-break-inside: avoid; }
    .tag { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
    .tag-critical { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .tag-serious { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
    .tag-moderate { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .tag-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .pass-note { color: #15803d; font-weight: 600; }
    code { font-family: Consolas, monospace; font-size: 0.85em; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
    footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #cbd5e1; font-size: 0.84rem; color: #475569; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>ADA Title II &amp; WCAG 2.1 AA Course Remediation Report</h1>
      <p class="meta"><strong>Course:</strong> ${escapeHtml(pkg.name)} &bull; <strong>Source:</strong> ${escapeHtml(pkg.originalFileName)} &bull; <strong>Generated:</strong> ${escapeHtml(m.timestamp)}</p>
    </header>

    <section class="kpi-grid" aria-label="Compliance summary metrics">
      <div class="kpi"><div class="kpi-label">HTML Compliance Score</div><div class="kpi-val">${m.avgBefore}% &rarr; ${m.avgAfter}%</div></div>
      <div class="kpi"><div class="kpi-label">Pages Audited</div><div class="kpi-val">${pkg.pages.length}</div></div>
      <div class="kpi"><div class="kpi-label">Issues Resolved</div><div class="kpi-val">${m.resolved} / ${m.totalBefore}</div></div>
      <div class="kpi"><div class="kpi-label">Attachments Flagged</div><div class="kpi-val">${m.criticalAttachments} critical (${attachments.length} total)</div></div>
    </section>

    <section>
      <h2>Page-by-Page Summary</h2>
      <table>
        <caption>Compliance scores and resolved issues per HTML course page</caption>
        <thead>
          <tr>
            <th scope="col">Page</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Resolved</th>
            <th scope="col">Remaining</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Detailed Remediation Log</h2>
      ${detailSections}
    </section>

    ${attachmentSection}

    <footer>
      Generated by AccessEd (100% client-side WCAG 2.1 AA remediation). Educators should manually verify image alt-text accuracy, closed-caption files (.vtt), and any flagged PDF/slide attachments for full ADA Title II certification.
    </footer>
  </main>
</body>
</html>`;
}

/** 3. Excel / Google Sheets CSV (.csv) Report */
export function generateComplianceReportCsv(pkg: CoursePackage): string {
  const headers = [
    'Category',
    'Page / File Path',
    'Title / Name',
    'Status',
    'Severity',
    'WCAG Criterion',
    'Impacted Learners',
    'Summary',
    'Details / Action Required',
  ];

  const rows: string[][] = [headers];

  for (const page of pkg.pages) {
    for (const ch of page.changes) {
      rows.push([
        'HTML Auto-Fix',
        page.path,
        page.title,
        'Resolved',
        'Fixed',
        ch.wcagCriterion,
        'All Learners',
        ch.summary,
        `Applied ${ch.count} time(s)`,
      ]);
    }
    for (const issue of page.remediatedAudit.issues) {
      rows.push([
        'HTML Issue',
        page.path,
        page.title,
        'Remaining',
        issue.severity.toUpperCase(),
        `${issue.wcagCriterion} (${issue.wcagLevel})`,
        issue.disabilities.join(', '),
        issue.title,
        issue.description,
      ]);
    }
    if (page.changes.length === 0 && page.remediatedAudit.issues.length === 0) {
      rows.push([
        'HTML Page',
        page.path,
        page.title,
        'Passed',
        'None',
        'WCAG 2.1 AA',
        'All Learners',
        'All automated checks passed',
        'No action required',
      ]);
    }
  }

  for (const att of pkg.attachments || []) {
    rows.push([
      `Attachment (${att.kind.toUpperCase()})`,
      att.path,
      att.fileName,
      att.status === 'critical'
        ? 'CRITICAL BARRIER'
        : att.status === 'review'
          ? 'Needs Review'
          : 'Tagged / OK',
      att.status === 'critical' ? 'CRITICAL' : att.status === 'review' ? 'SERIOUS' : 'LOW',
      att.wcagCriterion,
      att.kind === 'media' ? 'Deaf/HoH, Blind' : 'Blind, Low Vision',
      att.summary,
      att.details.join(' '),
    ]);
  }

  // Include UTF-8 BOM so Microsoft Excel opens UTF-8 characters cleanly
  return '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

/** 4. Structured JSON (.json) Report */
export function generateComplianceReportJson(pkg: CoursePackage): string {
  const m = getMetrics(pkg);
  const payload = {
    reportFormat: 'accessed-ada-compliance-report',
    standard: 'ADA Title II / WCAG 2.1 Level AA',
    generatedAt: m.isoTimestamp,
    course: {
      name: pkg.name,
      sourceFile: pkg.originalFileName,
      courseContext: pkg.courseContext || null,
    },
    summary: {
      pagesAudited: pkg.pages.length,
      scoreBefore: m.avgBefore,
      scoreAfter: m.avgAfter,
      htmlIssuesFound: m.totalBefore,
      htmlIssuesResolved: m.resolved,
      htmlIssuesRemaining: m.totalAfter,
      attachmentsAudited: (pkg.attachments || []).length,
      criticalAttachments: m.criticalAttachments,
    },
    pages: pkg.pages.map((p) => ({
      path: p.path,
      title: p.title,
      scoreBefore: p.originalAudit.score,
      scoreAfter: p.remediatedAudit.score,
      automatedFixes: p.changes,
      remainingIssues: p.remediatedAudit.issues,
    })),
    attachments: pkg.attachments || [],
  };
  return JSON.stringify(payload, null, 2);
}

/** 5. Microsoft Word (.docx) Report (genuine OOXML generated via JSZip) */
export async function generateComplianceReportDocx(pkg: CoursePackage): Promise<Blob> {
  const m = getMetrics(pkg);
  const attachments = pkg.attachments || [];

  const para = (text: string, opts?: { bold?: boolean; size?: number; color?: string }) => {
    const rPr: string[] = [];
    if (opts?.bold) rPr.push('<w:b/>');
    if (opts?.size) rPr.push(`<w:sz w:val="${opts.size * 2}"/>`);
    if (opts?.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
    const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
    return `<w:p><w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  };

  const blocks: string[] = [
    para('ADA Title II & WCAG 2.1 AA Course Remediation Report', {
      bold: true,
      size: 18,
      color: '0F766E',
    }),
    para(`Course: ${pkg.name}`, { bold: true, size: 11 }),
    para(`Source File: ${pkg.originalFileName} | Generated: ${m.timestamp}`, {
      size: 10,
      color: '475569',
    }),
    para(
      `HTML Compliance Score: ${m.avgBefore}% -> ${m.avgAfter}% (${m.resolved} of ${m.totalBefore} HTML issues resolved across ${pkg.pages.length} pages)`,
      { bold: true, size: 11 }
    ),
    para(
      `Non-HTML Attachments Scanned: ${attachments.length} (${m.criticalAttachments} critical barrier(s))`,
      { size: 10 }
    ),
    para(''),
    para('Page-by-Page Remediation Details', { bold: true, size: 14, color: '0F172A' }),
  ];

  for (const page of pkg.pages) {
    blocks.push(
      para(
        `${page.title} (${page.path}) — Score: ${page.originalAudit.score}% -> ${page.remediatedAudit.score}%`,
        { bold: true, size: 12, color: '0369A1' }
      )
    );
    if (page.changes.length > 0) {
      blocks.push(para('Automated Fixes Applied:', { bold: true, size: 10 }));
      for (const ch of page.changes) {
        blocks.push(para(`  • [${ch.wcagCriterion}] ${ch.summary} (${ch.count}x)`, { size: 10 }));
      }
    }
    if (page.remediatedAudit.issues.length > 0) {
      blocks.push(para('Remaining Items Requiring Educator Review:', { bold: true, size: 10, color: 'B91C1C' }));
      for (const issue of page.remediatedAudit.issues) {
        blocks.push(
          para(
            `  • ${issue.severity.toUpperCase()} [${issue.wcagCriterion}]: ${issue.title} — ${issue.description}`,
            { size: 10 }
          )
        );
      }
    } else {
      blocks.push(para('  • All automated WCAG 2.1 AA checks passed.', { size: 10, color: '15803D' }));
    }
    blocks.push(para(''));
  }

  if (attachments.length > 0) {
    blocks.push(
      para('Manual Action Checklist: Attached PDFs, Slides & Media', {
        bold: true,
        size: 14,
        color: '0F172A',
      })
    );
    for (const att of attachments) {
      blocks.push(
        para(
          `  • [${att.status.toUpperCase()}] ${att.path} (${att.kind.toUpperCase()}, WCAG ${att.wcagCriterion}) — ${att.summary}`,
          {
            size: 10,
            bold: att.status === 'critical',
            color: att.status === 'critical' ? 'B91C1C' : '0F172A',
          }
        )
      );
    }
    blocks.push(para(''));
  }

  blocks.push(
    para(
      'Note: Automated remediation resolves structural, contrast, semantic, and navigation WCAG 2.1 AA barriers in HTML course pages. Educators should manually verify image alt-text accuracy, closed-caption files (.vtt), and any flagged PDF/slide attachments for full ADA Title II compliance.',
      { size: 9, color: '475569' }
    )
  );

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${blocks.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** 6. Vector-Text Multi-Page PDF (.pdf) Report (zero-dependency spec-valid PDF 1.4) */
function sanitizePdfText(str: string): string {
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2022/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function generateComplianceReportPdf(pkg: CoursePackage): Blob {
  const m = getMetrics(pkg);
  const attachments = pkg.attachments || [];

  interface PdfLine {
    text: string;
    bold?: boolean;
    size: number;
    color?: [number, number, number];
    gapBefore?: number;
  }

  const lines: PdfLine[] = [
    { text: 'ADA Title II & WCAG 2.1 AA Course Remediation Report', bold: true, size: 16, color: [0.06, 0.46, 0.43] },
    { text: `Course: ${pkg.name}`, bold: true, size: 11, gapBefore: 6 },
    { text: `Source File: ${pkg.originalFileName}  |  Generated: ${m.timestamp}`, size: 9, color: [0.3, 0.35, 0.42] },
    {
      text: `HTML Compliance Score: ${m.avgBefore}% -> ${m.avgAfter}%   |   Pages Audited: ${pkg.pages.length}   |   Issues Resolved: ${m.resolved}/${m.totalBefore}`,
      bold: true,
      size: 10,
      gapBefore: 8,
    },
    {
      text: `Non-HTML Attachments Audited: ${attachments.length} (${m.criticalAttachments} critical barrier${m.criticalAttachments === 1 ? '' : 's'})`,
      size: 10,
      color: m.criticalAttachments > 0 ? [0.72, 0.11, 0.11] : [0.1, 0.4, 0.2],
    },
    { text: 'Page-by-Page Remediation Summary', bold: true, size: 13, gapBefore: 14, color: [0.06, 0.09, 0.16] },
  ];

  for (const page of pkg.pages) {
    const resolved = Math.max(0, page.originalAudit.counts.total - page.remediatedAudit.counts.total);
    lines.push({
      text: `${page.title} (${page.path}) — ${page.originalAudit.score}% -> ${page.remediatedAudit.score}% (${resolved} resolved, ${page.remediatedAudit.counts.total} remaining)`,
      bold: true,
      size: 10,
      gapBefore: 8,
      color: [0.01, 0.41, 0.63],
    });
    for (const ch of page.changes) {
      lines.push({
        text: `  - [FIXED] [${ch.wcagCriterion}] ${ch.summary} (${ch.count}x)`,
        size: 9,
      });
    }
    for (const issue of page.remediatedAudit.issues) {
      lines.push({
        text: `  - [${issue.severity.toUpperCase()}] [${issue.wcagCriterion}] ${issue.title}: ${issue.description}`,
        size: 9,
        color: issue.severity === 'critical' ? [0.72, 0.11, 0.11] : [0.2, 0.25, 0.33],
      });
    }
    if (page.remediatedAudit.issues.length === 0) {
      lines.push({
        text: '  - All automated WCAG 2.1 AA checks passed.',
        size: 9,
        color: [0.08, 0.5, 0.24],
      });
    }
  }

  if (attachments.length > 0) {
    lines.push({
      text: 'Manual Action Checklist: Attached PDFs, Slides & Media',
      bold: true,
      size: 13,
      gapBefore: 14,
      color: [0.06, 0.09, 0.16],
    });
    for (const att of attachments) {
      lines.push({
        text: `  - [${att.status.toUpperCase()}] ${att.path} (${att.kind.toUpperCase()}, WCAG ${att.wcagCriterion}): ${att.summary}`,
        bold: att.status === 'critical',
        size: 9,
        color: att.status === 'critical' ? [0.72, 0.11, 0.11] : [0.2, 0.25, 0.33],
        gapBefore: 4,
      });
    }
  }

  lines.push({
    text: 'Note: Automated remediation resolves structural, contrast, semantic, and navigation WCAG 2.1 AA barriers. Educators should manually verify image alt-text accuracy, closed-caption files (.vtt), and any flagged PDF/slide attachments for full ADA Title II certification.',
    size: 8.5,
    color: [0.35, 0.4, 0.47],
    gapBefore: 14,
  });

  // Paginate onto US Letter pages (612 x 792 pt)
  const pageStreams: string[] = [];
  let cmds: string[] = [];
  let y = 742;
  const marginX = 48;
  const minY = 58;

  const flushPage = () => {
    pageStreams.push(cmds.join('\n'));
    cmds = [];
    y = 742;
  };

  for (const item of lines) {
    const maxChars = Math.floor(516 / (item.size * 0.53));
    const wrapped = wrapText(item.text, maxChars);
    const lineHeight = item.size + 4;
    if (item.gapBefore) y -= item.gapBefore;

    for (const wLine of wrapped) {
      if (y - lineHeight < minY) {
        flushPage();
      }
      const [r, g, b] = item.color || [0.06, 0.09, 0.16];
      const font = item.bold ? '/F2' : '/F1';
      cmds.push(
        `BT ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${font} ${item.size} Tf ${marginX} ${y.toFixed(1)} Td (${sanitizePdfText(wLine)}) Tj ET`
      );
      y -= lineHeight;
    }
  }
  if (cmds.length > 0) flushPage();

  // Add page footer numbers
  const totalPages = pageStreams.length;
  const finalizedStreams = pageStreams.map(
    (stream, idx) =>
      `${stream}\nBT 0.40 0.45 0.52 rg /F1 8 Tf 48 30 Td (AccessEd ADA Title II & WCAG 2.1 AA Compliance Report) Tj ET\nBT 0.40 0.45 0.52 rg /F1 8 Tf 510 30 Td (Page ${idx + 1} of ${totalPages}) Tj ET`
  );

  // Assemble spec-valid PDF 1.4 objects
  const objects: string[] = [];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObj(''); // placeholder 1
  const pagesId = addObj(''); // placeholder 2
  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageIds: number[] = [];
  for (const stream of finalizedStreams) {
    const streamId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${streamId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Lang (en-US) /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}
