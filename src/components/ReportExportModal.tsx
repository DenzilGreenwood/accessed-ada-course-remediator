import { useState } from 'react';
import {
  Code2,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import type { CoursePackage } from '../types';
import {
  generateComplianceReportCsv,
  generateComplianceReportDocx,
  generateComplianceReportHtml,
  generateComplianceReportJson,
  generateComplianceReportMarkdown,
  generateComplianceReportPdf,
} from '../engine/report';

interface ReportExportModalProps {
  course: CoursePackage;
  onClose: () => void;
  onDownloaded: (msg: string) => void;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportExportModal({
  course,
  onClose,
  onDownloaded,
}: ReportExportModalProps) {
  const [busyFormat, setBusyFormat] = useState<string | null>(null);

  const baseName = course.originalFileName.replace(/\.(imscc|zip|html?|accessed|json)$/i, '');

  async function handleDownload(format: 'pdf' | 'docx' | 'csv' | 'html' | 'md' | 'json') {
    setBusyFormat(format);
    try {
      if (format === 'pdf') {
        const blob = generateComplianceReportPdf(course);
        triggerDownload(blob, `${baseName}-ada-compliance-report.pdf`);
        onDownloaded('Downloaded ADA Compliance Report (PDF).');
      } else if (format === 'docx') {
        const blob = await generateComplianceReportDocx(course);
        triggerDownload(blob, `${baseName}-ada-compliance-report.docx`);
        onDownloaded('Downloaded ADA Compliance Report (Word .docx).');
      } else if (format === 'csv') {
        const csv = generateComplianceReportCsv(course);
        triggerDownload(
          new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          `${baseName}-ada-compliance-report.csv`
        );
        onDownloaded('Downloaded ADA Compliance Report (Excel/Sheets .csv).');
      } else if (format === 'html') {
        const html = generateComplianceReportHtml(course);
        triggerDownload(
          new Blob([html], { type: 'text/html;charset=utf-8' }),
          `${baseName}-ada-compliance-report.html`
        );
        onDownloaded('Downloaded ADA Compliance Report (Accessible .html).');
      } else if (format === 'md') {
        const md = generateComplianceReportMarkdown(course);
        triggerDownload(
          new Blob([md], { type: 'text/markdown;charset=utf-8' }),
          `${baseName}-ada-compliance-report.md`
        );
        onDownloaded('Downloaded ADA Compliance Report (Markdown .md).');
      } else if (format === 'json') {
        const json = generateComplianceReportJson(course);
        triggerDownload(
          new Blob([json], { type: 'application/json;charset=utf-8' }),
          `${baseName}-ada-compliance-report.json`
        );
        onDownloaded('Downloaded ADA Compliance Report (JSON .json).');
      }
    } finally {
      setBusyFormat(null);
    }
  }

  function handlePrintStyledPdf() {
    const html = generateComplianceReportHtml(course);
    const win = window.open('', '_blank', 'width=960,height=780');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
    onDownloaded('Opened printable ADA Compliance Report.');
  }

  const formats = [
    {
      id: 'pdf' as const,
      title: 'PDF Document (.pdf)',
      desc: 'Instant downloadable multi-page PDF for Deans, ADA Coordinators & accreditation files.',
      icon: FileText,
    },
    {
      id: 'docx' as const,
      title: 'Microsoft Word (.docx)',
      desc: 'Editable Word / Google Docs report for department sign-off and comments.',
      icon: FileText,
    },
    {
      id: 'csv' as const,
      title: 'Excel / Google Sheets (.csv)',
      desc: 'Flat issue & attachment tracker for district-wide accessibility spreadsheets.',
      icon: FileSpreadsheet,
    },
    {
      id: 'html' as const,
      title: 'Accessible Web Report (.html)',
      desc: 'Self-contained WCAG 2.1 AA styled report ready to share or host.',
      icon: FileCode,
    },
    {
      id: 'md' as const,
      title: 'Markdown (.md)',
      desc: 'Clean plain-text documentation for GitHub, Notion, wikis, or ticket systems.',
      icon: FileText,
    },
    {
      id: 'json' as const,
      title: 'Structured JSON (.json)',
      desc: 'Machine-readable audit payload for IT integrations and compliance dashboards.',
      icon: Code2,
    },
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 id="report-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={18} color="#0f766e" aria-hidden="true" />
            Export ADA Title II Compliance Report
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close report export dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <p className="field-hint" style={{ margin: 0 }}>
            Choose any format for <strong>{course.name}</strong> ({course.pages.length} HTML page
            {course.pages.length === 1 ? '' : 's'}
            {(course.attachments?.length || 0) > 0
              ? ` + ${course.attachments?.length} scanned attachment${course.attachments?.length === 1 ? '' : 's'}`
              : ''}
            ). All reports are generated 100% locally in your browser.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 10,
            }}
          >
            {formats.map((fmt) => {
              const Icon = fmt.icon;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className="issue-card"
                  disabled={busyFormat !== null}
                  onClick={() => void handleDownload(fmt.id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 13,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Icon size={16} color="#0f766e" aria-hidden="true" />
                    {busyFormat === fmt.id ? 'Generating...' : fmt.title}
                  </span>
                  <span style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>
                    {fmt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePrintStyledPdf}
          >
            <Printer size={15} aria-hidden="true" />
            Print / Browser Save as PDF
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
