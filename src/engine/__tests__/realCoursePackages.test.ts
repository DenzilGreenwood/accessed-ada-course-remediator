declare const process: { cwd: () => string };

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REMEDIATION_OPTIONS, type CoursePackage } from '../../types';
import { auditArchiveAttachments } from '../attachments';
import { auditHtml } from '../auditor';
import { createCoursePage, exportRemediatedPackage } from '../imscc';
import { extractOfficeHtmlOutline, inspectOfficeImages } from '../officeRemediator';
import { remediateHtml } from '../remediator';
import { generateComplianceReportMarkdown } from '../report';

async function loadImsccPackage(fileName: string): Promise<CoursePackage> {
  const fsModName = 'node:fs';
  const pathModName = 'node:path';
  const fs = (await import(/* @vite-ignore */ fsModName)) as {
    readFileSync: (p: string) => Uint8Array;
  };
  const path = (await import(/* @vite-ignore */ pathModName)) as {
    resolve: (...p: string[]) => string;
    join: (...p: string[]) => string;
  };
  const fullPath = path.join(path.resolve(process.cwd(), 'test-course'), fileName);
  const nodeBuf = fs.readFileSync(fullPath);
  const arrayBuf = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength
  ) as ArrayBuffer;
  const zip = await JSZip.loadAsync(arrayBuf);
  const htmlEntries = Object.values(zip.files).filter(
    (e) => !e.dir && /\.(html?|xhtml)$/i.test(e.name) && !e.name.startsWith('__MACOSX/')
  );
  const pages = [];
  for (const entry of htmlEntries) {
    const html = await entry.async('string');
    pages.push(createCoursePage(entry.name, html));
  }
  const attachments = await auditArchiveAttachments(zip);
  return {
    name: fileName.replace(/\.imscc$/i, ''),
    sourceType: 'imscc',
    originalFileName: fileName,
    zipArrayBuffer: arrayBuf,
    attachments,
    pages,
  };
}

describe('Real test-course .imscc end-to-end engine verification', () => {
  const packages = [
    'cs-310-data-structures-algorithms.imscc',
    'math-241-multivariable-calculus.imscc',
    'chem-212-organic-chemistry-ii.imscc',
    'hist-204-modern-world-history.imscc',
  ];

  for (const fileName of packages) {
    it(`audits, remediates, inspects attachments, and exports ${fileName}`, async () => {
      const pkg = await loadImsccPackage(fileName);
      expect(pkg.pages.length).toBeGreaterThan(0);

      // Remediate all HTML pages and verify score does not regress
      const remediatedPages = pkg.pages.map((p) => {
        const { html, changes } = remediateHtml(p.originalHtml, DEFAULT_REMEDIATION_OPTIONS);
        const afterAudit = auditHtml(html);
        expect(afterAudit.score).toBeGreaterThanOrEqual(p.originalAudit.score);
        return {
          ...p,
          remediatedHtml: html,
          remediatedAudit: afterAudit,
          changes,
          isRemediated: true,
        };
      });

      const updatedPkg: CoursePackage = { ...pkg, pages: remediatedPages };

      // Inspect any Office attachments inside the real .imscc
      if (pkg.zipArrayBuffer && pkg.attachments) {
        const zip = await JSZip.loadAsync(pkg.zipArrayBuffer);
        for (const att of pkg.attachments) {
          if (att.kind === 'pptx' || att.kind === 'docx') {
            const entry = zip.file(att.path);
            expect(entry).toBeTruthy();
            const buf = await entry!.async('arraybuffer');
            const imgs = await inspectOfficeImages(buf, att.kind);
            expect(Array.isArray(imgs)).toBe(true);
            const outline = await extractOfficeHtmlOutline(buf, att.kind, att.fileName);
            expect(outline.html).toContain('<!DOCTYPE html>');
          }
        }
      }

      const exportedBlob = await exportRemediatedPackage(updatedPkg);
      expect(exportedBlob.size).toBeGreaterThan(0);

      const reportMd = generateComplianceReportMarkdown(updatedPkg);
      expect(reportMd).toContain('# ADA Title II & WCAG 2.1 AA Course Remediation Report');
    });
  }
});
