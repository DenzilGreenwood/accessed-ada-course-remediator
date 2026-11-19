import { describe, expect, it } from 'vitest';
import { auditHtml } from '../auditor';
import {
  findAccessibleColor,
  getContrastRatio,
  parseColor,
} from '../contrast';
import {
  remediateHtml,
  updateImageAltInHtml,
  updateLinkTextInHtml,
} from '../remediator';
import {
  attachCaptionsAndTranscriptToHtml,
  generateScreenReaderPreview,
  parseCaptionsToTranscript,
  srtToVtt,
} from '../captions';
import { DEFAULT_REMEDIATION_OPTIONS } from '../../types';
import { buildSampleCourse } from '../../data/sampleCourse';

describe('WCAG 2.1 Contrast Engine', () => {
  it('computes accurate contrast ratios and darkens low-contrast text on white', () => {
    const lightGray = parseColor('#94a3b8')!;
    const white = parseColor('#ffffff')!;
    expect(getContrastRatio(lightGray, white)).toBeLessThan(4.5);

    const fixedHex = findAccessibleColor(lightGray, white, 4.5);
    const fixedRgb = parseColor(fixedHex)!;
    expect(getContrastRatio(fixedRgb, white)).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens dark text on dark backgrounds to reach 4.5:1', () => {
    const darkBlue = parseColor('#1e3a8a')!;
    const nearBlack = parseColor('#0f172a')!;
    const fixedHex = findAccessibleColor(darkBlue, nearBlack, 4.5);
    expect(getContrastRatio(parseColor(fixedHex)!, nearBlack)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ADA / WCAG 2.1 AA Audit & Auto-Remediation Engine', () => {
  it('detects accessibility barriers in the sample BIO 101 syllabus and auto-fixes them to 100%', () => {
    const course = buildSampleCourse();
    const syllabus = course.pages[0];

    const before = auditHtml(syllabus.originalHtml);
    const ruleIds = new Set(before.issues.map((i) => i.ruleId));

    expect(ruleIds.has('html-lang')).toBe(true);
    expect(ruleIds.has('document-title')).toBe(true);
    expect(ruleIds.has('viewport-zoom')).toBe(true);
    expect(ruleIds.has('bypass-blocks')).toBe(true);
    expect(ruleIds.has('fake-heading')).toBe(true);
    expect(ruleIds.has('heading-hierarchy')).toBe(true);
    expect(ruleIds.has('table-headers')).toBe(true);
    expect(ruleIds.has('table-caption')).toBe(true);
    expect(ruleIds.has('color-contrast')).toBe(true);
    expect(ruleIds.has('tiny-text')).toBe(true);
    expect(ruleIds.has('link-generic')).toBe(true);
    expect(ruleIds.has('link-new-tab')).toBe(true);
    expect(ruleIds.has('deprecated-distracting')).toBe(true);

    const remediated = remediateHtml(
      syllabus.originalHtml,
      DEFAULT_REMEDIATION_OPTIONS,
      syllabus.title
    );
    const after = auditHtml(remediated.html);

    expect(after.counts.total).toBe(0);
    expect(after.score).toBe(100);
    expect(remediated.changes.length).toBeGreaterThanOrEqual(8);
  });

  it('flags suspicious filename alt text and resolves it via inline manual alt edit', () => {
    const course = buildSampleCourse();
    const lecture = course.pages[1];

    const remediated = remediateHtml(
      lecture.originalHtml,
      DEFAULT_REMEDIATION_OPTIONS,
      lecture.title
    );
    const afterAuto = auditHtml(remediated.html);
    const suspicious = afterAuto.issues.find((i) => i.ruleId === 'img-alt-suspicious');
    expect(suspicious).toBeDefined();
    expect(suspicious?.elementRef?.tag).toBe('img');

    const manuallyFixed = updateImageAltInHtml(
      remediated.html,
      suspicious!.elementRef!.index,
      'Microscope photograph of stained eukaryotic cells showing nuclei'
    );
    const afterManual = auditHtml(manuallyFixed);
    expect(afterManual.counts.total).toBe(0);
    expect(afterManual.score).toBe(100);
  });

  it('fixes video autoplay, missing controls, form labels, and positive tabindex on Lab 1', () => {
    const course = buildSampleCourse();
    const lab = course.pages[2];

    const before = auditHtml(lab.originalHtml);
    expect(before.issues.some((i) => i.ruleId === 'media-accessibility')).toBe(true);
    expect(before.issues.some((i) => i.ruleId === 'form-label')).toBe(true);
    expect(before.issues.some((i) => i.ruleId === 'positive-tabindex')).toBe(true);

    const remediated = remediateHtml(
      lab.originalHtml,
      DEFAULT_REMEDIATION_OPTIONS,
      lab.title
    );
    const after = auditHtml(remediated.html);
    expect(after.counts.total).toBe(0);
    expect(after.score).toBe(100);
  });

  it('supports inline link text editing', () => {
    const snippet = '<p>See the rubric <a href="/rubric.pdf">click here</a>.</p>';
    const updated = updateLinkTextInHtml(snippet, 0, 'Download Grading Rubric (PDF)');
    expect(updated).toContain('Download Grading Rubric (PDF)');
    expect(auditHtml(updated).counts.total).toBe(0);
  });
});

describe('Blind & Deaf/Hard-of-Hearing Studio Engine', () => {
  it('converts SRT subtitles to WebVTT and extracts clean transcript text', () => {
    const srt = `1\n00:00:00,000 --> 00:00:03,500\nWelcome to Modern World History.\n\n2\n00:00:03,500 --> 00:00:07,000\nToday we study the Industrial Revolution.`;
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:03.500');

    const transcript = parseCaptionsToTranscript(vtt);
    expect(transcript).toBe(
      'Welcome to Modern World History. Today we study the Industrial Revolution.'
    );
  });

  it('detects missing audio transcripts, unlabeled SVGs, and empty buttons, and auto-fixes them', () => {
    const html = `
      <div>
        <svg width="200" height="100"><rect width="200" height="100" /></svg>
        <button></button>
        <audio src="lecture.mp3"></audio>
      </div>
    `;
    const before = auditHtml(html);
    expect(before.issues.some((i) => i.ruleId === 'svg-accessible-name' && i.disabilities.includes('blind'))).toBe(true);
    expect(before.issues.some((i) => i.ruleId === 'button-accessible-name' && i.disabilities.includes('blind'))).toBe(true);
    expect(before.issues.some((i) => i.ruleId === 'audio-transcript' && i.disabilities.includes('deaf-hoh'))).toBe(true);

    const fixed = remediateHtml(html, DEFAULT_REMEDIATION_OPTIONS);
    const after = auditHtml(fixed.html);
    expect(after.counts.total).toBe(0);
    expect(fixed.html).toContain('class="accessed-transcript"');
  });

  it('attaches .vtt caption track and collapsible transcript to video elements', () => {
    const html = '<video src="demo.mp4"></video>';
    const updated = attachCaptionsAndTranscriptToHtml(html, 'video', 0, {
      vttPath: 'captions/demo.vtt',
      language: 'en',
      transcriptText: 'Hello class, this video demonstrates microscope calibration.',
    });
    expect(updated).toContain('src="captions/demo.vtt"');
    expect(updated).toContain('Read Video Transcript');
    expect(updated).toContain('microscope calibration');
    expect(auditHtml(updated).counts.total).toBe(0);
  });

  it('generates a linearized screen-reader readout with headings and landmarks', () => {
    const html = '<!doctype html><html lang="en"><head><title>Lesson 1</title></head><body><main><h1>Cells</h1><p>Cells are basic units of life.</p></main></body></html>';
    const preview = generateScreenReaderPreview(html);
    expect(preview.headings).toEqual([{ level: 1, text: 'Cells' }]);
    expect(preview.landmarks).toContain('main');
    expect(preview.items.some((i) => i.role === 'Heading 1' && i.text === 'Cells')).toBe(true);
  });
});
