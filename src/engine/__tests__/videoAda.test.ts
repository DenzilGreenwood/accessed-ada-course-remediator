import { describe, expect, it } from 'vitest';
import {
  auditVideoAccessibility,
  buildAccessibleVideoPageHtml,
  formatVttTime,
  parseVttCues,
  parseVttTime,
  serializeCuesToVtt,
} from '../videoAda';
import { auditHtml } from '../auditor';

describe('Video ADA Studio Engine', () => {
  it('formats and parses WebVTT timestamps accurately', () => {
    expect(formatVttTime(65.25)).toBe('00:01:05.250');
    expect(parseVttTime('00:01:05.250')).toBeCloseTo(65.25, 2);
  });

  it('parses and serializes WebVTT/SRT cues cleanly', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,500\nHello class, welcome to Biology.\n\n2\n00:00:05,000 --> 00:00:08,000\n[Microscope lens clicks into focus]`;
    const cues = parseVttCues(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello class, welcome to Biology.');

    const vtt = serializeCuesToVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500');
  });

  it('scores video ADA compliance across WCAG 1.2.1, 1.2.2, and 1.2.5', () => {
    const incomplete = auditVideoAccessibility({
      title: 'Week 1 Lab Demo',
      captionCues: [],
      descriptionCues: [],
      transcriptText: '',
    });
    expect(incomplete.score).toBe(40);

    const complete = auditVideoAccessibility({
      title: 'Week 1 Lab Demo',
      captionCues: [{ id: '1', start: 0, end: 5, text: 'Welcome to the microscope lab walkthrough.' }],
      descriptionCues: [{ id: 'd1', start: 1, end: 4, text: 'Instructor adjusts coarse focus knob.' }],
      transcriptText: 'Welcome to the microscope lab walkthrough.',
    });
    expect(complete.score).toBe(100);
  });

  it('generates a 100% WCAG 2.1 AA compliant HTML video lesson page', () => {
    const html = buildAccessibleVideoPageHtml({
      title: 'Microscope Calibration Walkthrough',
      videoFileName: 'microscope.mp4',
      language: 'en',
      captionsFileName: 'captions.vtt',
      descriptionsFileName: 'descriptions.vtt',
      transcriptText: 'Welcome to our lab demonstration on calibrating a compound microscope.',
      descriptionCues: [{ id: 'd1', start: 2, end: 5, text: 'Close-up of objective lens.' }],
    });

    expect(html).toContain('kind="captions"');
    expect(html).toContain('kind="descriptions"');
    expect(html).toContain('Full Text Transcript');
    expect(html).toContain('Visual &amp; Audio Descriptions');
    expect(auditHtml(html).score).toBe(100);
  });
});
