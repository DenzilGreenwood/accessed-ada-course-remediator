import type { CoursePackage } from '../types';

export function generateComplianceReportMarkdown(pkg: CoursePackage): string {
  const timestamp = new Date().toLocaleString();
  const totalBefore = pkg.pages.reduce((sum, p) => sum + p.originalAudit.counts.total, 0);
  const totalAfter = pkg.pages.reduce((sum, p) => sum + p.remediatedAudit.counts.total, 0);
  const avgBefore = pkg.pages.length
    ? Math.round(pkg.pages.reduce((s, p) => s + p.originalAudit.score, 0) / pkg.pages.length)
    : 100;
  const avgAfter = pkg.pages.length
    ? Math.round(pkg.pages.reduce((s, p) => s + p.remediatedAudit.score, 0) / pkg.pages.length)
    : 100;

  const attachments = pkg.attachments || [];
  const criticalAttachments = attachments.filter((a) => a.status === 'critical').length;

  const lines: string[] = [
    `# ADA Title II & WCAG 2.1 AA Course Remediation Report`,
    ``,
    `- **Course:** ${pkg.name}`,
    `- **Source File:** ${pkg.originalFileName}`,
    `- **Generated:** ${timestamp}`,
    `- **HTML Pages Audited:** ${pkg.pages.length}`,
    `- **HTML Compliance Score:** ${avgBefore}% → **${avgAfter}%**`,
    `- **HTML Issues:** ${totalBefore} found → **${totalAfter} remaining** (${Math.max(
      0,
      totalBefore - totalAfter
    )} resolved)`,
    `- **Non-HTML Attachments Audited (PDF/Slides/Docs):** ${attachments.length} (${criticalAttachments} critical barrier${criticalAttachments === 1 ? '' : 's'})`,
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
        lines.push(`- [${ch.wcagCriterion}] ${ch.summary} (${ch.count}×)`);
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
      lines.push(``, `✅ **All automated WCAG 2.1 AA checks passed!**`);
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
