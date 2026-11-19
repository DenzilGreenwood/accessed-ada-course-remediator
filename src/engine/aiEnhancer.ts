import type { AiConfig, CourseContext } from '../types';
import { isFullHtmlDocument, parseHtmlDocument } from './auditor';
import { formatVttTime } from './videoAda';
import {
  extractCompressedAudio,
  extractVisualKeyframes,
} from './videoMediaPrep';

interface ChromeLanguageModelSession {
  prompt: (text: string) => Promise<string>;
  destroy?: () => void;
}

interface ChromeAiGlobal {
  LanguageModel?: {
    availability?: () => Promise<string>;
    create: (opts?: { systemPrompt?: string }) => Promise<ChromeLanguageModelSession>;
  };
  ai?: {
    languageModel?: {
      capabilities?: () => Promise<{ available: string }>;
      create: (opts?: { systemPrompt?: string }) => Promise<ChromeLanguageModelSession>;
    };
  };
}

/** Detects whether Chrome's built-in on-device Gemini Nano Prompt API is available */
export function isChromeLocalAiAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const g = window as unknown as ChromeAiGlobal;
  return Boolean(g.LanguageModel?.create || g.ai?.languageModel?.create);
}

/** Rough client-side cost estimator for Gemini Flash / GPT-4o-mini BYOK usage */
export function estimateAiCostLabel(itemCount: number, provider: AiConfig['provider']): string {
  if (provider === 'chrome-nano') return 'Free (runs locally on-device in Chrome)';
  const safeCount = Math.max(1, itemCount);
  const perItemUsd = provider === 'gemini' ? 0.00035 : 0.0005;
  const est = safeCount * perItemUsd;
  if (est < 0.01) return `${safeCount} item${safeCount === 1 ? '' : 's'} ≈ <$0.01`;
  return `${safeCount} item${safeCount === 1 ? '' : 's'} ≈ $${est.toFixed(2)}`;
}

async function callChromeLocalAi(prompt: string): Promise<string> {
  const g = window as unknown as ChromeAiGlobal;
  const factory = g.LanguageModel || g.ai?.languageModel;
  if (!factory?.create) {
    throw new Error(
      'Chrome Built-In AI (Gemini Nano) is not enabled in this browser. Use Chrome 138+ with Prompt API enabled, or switch to Gemini/OpenAI.'
    );
  }
  const session = await factory.create({
    systemPrompt:
      'You are an instructional accessibility specialist expert in ADA Title II and WCAG 2.1 AA for education.',
  });
  try {
    return (await session.prompt(prompt)).trim();
  } finally {
    session.destroy?.();
  }
}

async function callLlm(config: AiConfig, prompt: string): Promise<string> {
  if (config.provider === 'chrome-nano') {
    return callChromeLocalAi(prompt);
  }

  if (!config.apiKey.trim()) {
    throw new Error('Please enter an API key in AI Settings first.');
  }

  if (config.provider === 'gemini') {
    const model = config.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 180)}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // OpenAI-compatible endpoint
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are an instructional accessibility specialist expert in ADA Title II and WCAG 2.1 AA for education.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error (${res.status}): ${errText.slice(0, 180)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

function formatCourseContextLine(ctx?: CourseContext): string {
  if (!ctx || (!ctx.subject.trim() && !ctx.level.trim())) {
    return 'General school/university course';
  }
  return [ctx.level.trim(), ctx.subject.trim()].filter(Boolean).join(' — ');
}

export async function generateAltTextWithAi(
  config: AiConfig,
  imgSrc: string,
  surroundingContext: string,
  courseContext?: CourseContext
): Promise<string> {
  const prompt = [
    'Write concise, pedagogically accurate WCAG 2.1 AA alternative text (alt attribute) for an educational course image.',
    'Rules:',
    '- Describe WHAT the student needs to learn from the figure/diagram, not generic visual filler.',
    '- Return ONLY the alt text string (no quotes, no prefix like "Image of" or "Picture of").',
    '- Maximum 125 characters.',
    `- Course subject & level: ${formatCourseContextLine(courseContext)}`,
    `- Image source/filename: ${imgSrc || 'unknown'}`,
    `- Surrounding lesson context: ${surroundingContext || 'general school course page'}`,
  ].join('\n');

  const result = await callLlm(config, prompt);
  return result.replace(/^["']|["']$/g, '').trim();
}

export async function generateDescriptiveLinkWithAi(
  config: AiConfig,
  href: string,
  currentText: string,
  surroundingContext: string,
  courseContext?: CourseContext
): Promise<string> {
  const prompt = [
    'Rewrite this vague educational hyperlink text so it satisfies WCAG 2.4.4 (Link Purpose).',
    'Rules:',
    '- Return ONLY the improved link text (3 to 8 words, no quotes).',
    `- Course subject & level: ${formatCourseContextLine(courseContext)}`,
    `- Current link text: ${currentText}`,
    `- Destination URL: ${href}`,
    `- Surrounding sentence: ${surroundingContext}`,
  ].join('\n');

  const result = await callLlm(config, prompt);
  return result.replace(/^["']|["']$/g, '').trim();
}

export async function generatePlainLanguageSummaryWithAi(
  config: AiConfig,
  html: string,
  courseContext?: CourseContext
): Promise<string> {
  const doc = parseHtmlDocument(html, isFullHtmlDocument(html));
  const plainText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000);

  const prompt = [
    'Create a short Plain-Language Student Summary (WCAG 3.1.5 Reading Level) for this school course page.',
    'Rules:',
    `- Tailor clarity for: ${formatCourseContextLine(courseContext)} (aim for accessible Grade 7-8 reading level).`,
    '- Include: 1) One-sentence overview, 2) 3 concise bullet points of key takeaways or deadlines.',
    '- Keep it under 120 words.',
    '',
    'Course page content:',
    plainText,
  ].join('\n');

  return callLlm(config, prompt);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read media blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compresses video audio locally (16 kHz mono WAV via Web Audio API) and extracts
 * scene-change keyframes via offscreen <canvas> before calling Gemini—so even large
 * lecture recordings stay lightweight and fast.
 */
export async function transcribeVideoWithGemini(
  config: AiConfig,
  videoFile: File,
  onProgress?: (status: string) => void
): Promise<{ captionsVtt: string; descriptionsVtt: string; compressionNote: string }> {
  if (!config.apiKey.trim()) {
    throw new Error('Please enter a Gemini API key in AI Settings first.');
  }
  if (config.provider !== 'gemini') {
    throw new Error('Automatic video transcription requires the Google Gemini provider in AI Settings.');
  }

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  let compressionNote = '';

  // Step 1: Try local audio extraction + canvas keyframes (handles large videos cleanly)
  try {
    onProgress?.('Compressing audio track locally (16 kHz mono)...');
    const audioBlob = await extractCompressedAudio(videoFile);
    const audioMb = (audioBlob.size / (1024 * 1024)).toFixed(2);
    const origMb = (videoFile.size / (1024 * 1024)).toFixed(2);

    if (audioBlob.size <= 18 * 1024 * 1024) {
      const audioB64 = await blobToBase64(audioBlob);
      parts.push({ inlineData: { mimeType: 'audio/wav', data: audioB64 } });

      onProgress?.('Extracting visual slide/scene keyframes via canvas...');
      const keyframes = await extractVisualKeyframes(videoFile, 12);
      for (const kf of keyframes) {
        parts.push({
          text: `Visual keyframe at timestamp ${formatVttTime(kf.timestamp)}:`,
        });
        parts.push({
          inlineData: { mimeType: kf.mimeType, data: kf.base64Jpeg },
        });
      }
      compressionNote = `Shrunk ${origMb} MB video → ${audioMb} MB mono audio + ${keyframes.length} scene keyframes locally.`;
    }
  } catch {
    // Fallback to direct inline video for small clips if browser cannot decode audio track
  }

  if (parts.length === 0) {
    if (videoFile.size > 18 * 1024 * 1024) {
      throw new Error(
        'Audio extraction exceeded 18 MB for direct browser upload. Please trim the lecture clip or upload a .vtt/.srt file manually.'
      );
    }
    onProgress?.('Sending compact video clip to Gemini...');
    const base64Data = await blobToBase64(videoFile);
    parts.push({
      inlineData: {
        mimeType: videoFile.type || 'video/mp4',
        data: base64Data,
      },
    });
    compressionNote = 'Processed compact video directly.';
  }

  const prompt = [
    'Analyze this educational lecture audio and visual keyframes for ADA Title II / WCAG 2.1 AA compliance.',
    'Return ONLY a valid JSON object (no markdown fences) with two string keys:',
    '1. "captionsVtt": Complete, accurate WebVTT (starting with WEBVTT) closed captions of all speech and important non-speech sound cues like [music] or [bell rings].',
    '2. "descriptionsVtt": WebVTT (starting with WEBVTT) audio descriptions for blind students describing key visual-only content (slides, text on screen, diagrams, demonstrations) aligned to the keyframe timestamps.',
  ].join('\n');

  parts.push({ text: prompt });

  onProgress?.('Generating WebVTT captions & audio descriptions with Gemini...');
  const model = config.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini video transcription error (${res.status}): ${errText.slice(0, 180)}`);
  }

  const data = await res.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned) as {
    captionsVtt?: string;
    descriptionsVtt?: string;
  };

  return {
    captionsVtt: parsed.captionsVtt || 'WEBVTT\n',
    descriptionsVtt: parsed.descriptionsVtt || 'WEBVTT\n',
    compressionNote,
  };
}
