import { describe, expect, it } from 'vitest';
import { generateLmsSafeHtml, remediateHtml } from '../remediator';
import { auditPdfBuffer } from '../attachments';
import { exportWorkspaceFile, importWorkspaceFile } from '../storage';
import { generateComplianceReportMarkdown } from '../report';
import { estimateAiCostLabel } from '../aiEnhancer';
import { DEFAULT_REMEDIATION_OPTIONS } from '../../types';
import { buildSampleCourse } from '../../data/sampleCourse';

function strToBuffer(str: string): ArrayBuffer {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

describe('Client-Side Classroom Upgrades', () => {
  it('produces LMS-safe HTML without <style>/<script>/positive tabindex while preserving inline fixes', () => {
    const raw = `<!doctype html><html><head><title>Lesson</title><style>.x{color:red}</style></head><body><a href="#main" class="skip-link">Skip</a><main><p style="color:#94a3b8" tabindex="4">Low contrast text</p><script>alert(1)</script></main></body></html>`;
    const fixed = remediateHtml(raw, DEFAULT_REMEDIATION_OPTIONS);
    const lmsSafe = generateLmsSafeHtml(fixed.html);

    expect(lmsSafe).not.toContain('<style');
    expect(lmsSafe).not.toContain('<script');
    expect(lmsSafe).not.toContain('skip-link');
    expect(lmsSafe).not.toContain('tabindex="4"');
    expect(lmsSafe).toContain('style="color:');
  });

  it('flags scanned image-only PDFs as critical and recognizes tagged PDFs', () => {
    const scannedPdf = `%PDF-1.4\n1 0 obj << /Type /XObject /Subtype /Image >> endobj\n%%EOF`;
    const scannedAudit = auditPdfBuffer('files/scan.pdf', strToBuffer(scannedPdf));
    expect(scannedAudit.status).toBe('critical');
    expect(scannedAudit.summary).toContain('Scanned Image PDF');

    const taggedPdf = `%PDF-1.7\n1 0 obj << /Type /Catalog /Lang (en-US) /StructTreeRoot 2 0 R /Type /Font >> BT (Hello) Tj ET\n%%EOF`;
    const taggedAudit = auditPdfBuffer('files/accessible.pdf', strToBuffer(taggedPdf));
    expect(taggedAudit.status).toBe('ok');
  });

  it('includes non-HTML attachment audit findings in the Markdown compliance report', () => {
    const pkg = buildSampleCourse();
    pkg.attachments = [
      auditPdfBuffer(
        'files/scanned-reading.pdf',
        strToBuffer('%PDF-1.4\n/Subtype /Image\n%%EOF')
      ),
    ];
    const report = generateComplianceReportMarkdown(pkg);
    expect(report).toContain('Manual Action Checklist: Attached PDFs, Slides & Media');
    expect(report).toContain('scanned-reading.pdf');
    expect(report).toContain('CRITICAL BARRIER');
  });

  it('round-trips portable .accessed workspace files with courseContext intact', async () => {
    const pkg = buildSampleCourse();
    pkg.courseContext = { subject: 'Cellular Biology', level: 'Undergraduate College' };

    const blob = exportWorkspaceFile(pkg);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(blob);
    });
    const fakeFile = { text: async () => text } as File;
    const restored = await importWorkspaceFile(fakeFile);

    expect(restored.name).toBe(pkg.name);
    expect(restored.pages).toHaveLength(pkg.pages.length);
    expect(restored.courseContext?.subject).toBe('Cellular Biology');
  });

  it('estimates BYOK AI cost cleanly including free Chrome Built-In AI', () => {
    expect(estimateAiCostLabel(24, 'chrome-nano')).toContain('Free');
    expect(estimateAiCostLabel(24, 'gemini')).toContain('<$0.01');
  });
});
