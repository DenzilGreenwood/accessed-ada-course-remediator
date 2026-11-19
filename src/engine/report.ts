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

  const lines: string[] = [
    `# ADA Title II & WCAG 2.1 AA Course Remediation Report`,
    ``,
    `- **Course:** ${pkg.name}`,
    `- **Source File:** ${pkg.originalFileName}`,
    `- **Generated:** ${timestamp}`,
    `- **Pages Audited:** ${pkg.pages.length}`,
    `- **Compliance Score:** ${avgBefore}% → **${avgAfter}%**`,
    `- **Total Issues:** ${totalBefore} found → **${totalAfter} remaining** (${Math.max(
      0,
      totalBefore - totalAfter
    )} resolved)`,
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

  lines.push(
    ``,
    `---`,
    ``,
    `_Note: Automated remediation resolves structural, contrast, semantic, and navigation WCAG 2.1 AA barriers. Educators should manually verify image alt-text accuracy and closed-caption files (.vtt) for full ADA Title II compliance._`
  );

  return lines.join('\n');
}
