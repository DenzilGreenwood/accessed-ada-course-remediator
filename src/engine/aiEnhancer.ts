import type { AiConfig } from '../types';
import { isFullHtmlDocument, parseHtmlDocument } from './auditor';

async function callLlm(config: AiConfig, prompt: string): Promise<string> {
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

export async function generateAltTextWithAi(
  config: AiConfig,
  imgSrc: string,
  surroundingContext: string
): Promise<string> {
  const prompt = [
    'Write concise, pedagogically accurate WCAG 2.1 AA alternative text (alt attribute) for an educational course image.',
    'Rules:',
    '- Return ONLY the alt text string (no quotes, no prefix like "Image of" or "Picture of").',
    '- Maximum 125 characters.',
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
  surroundingContext: string
): Promise<string> {
  const prompt = [
    'Rewrite this vague educational hyperlink text so it satisfies WCAG 2.4.4 (Link Purpose).',
    'Rules:',
    '- Return ONLY the improved link text (3 to 8 words, no quotes).',
    `- Current link text: ${currentText}`,
    `- Destination URL: ${href}`,
    `- Surrounding sentence: ${surroundingContext}`,
  ].join('\n');

  const result = await callLlm(config, prompt);
  return result.replace(/^["']|["']$/g, '').trim();
}

export async function generatePlainLanguageSummaryWithAi(
  config: AiConfig,
  html: string
): Promise<string> {
  const doc = parseHtmlDocument(html, isFullHtmlDocument(html));
  const plainText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000);

  const prompt = [
    'Create a short Plain-Language Student Summary (WCAG 3.1.5 Reading Level) for this school course page.',
    'Rules:',
    '- Use clear, Grade 7-8 reading level English.',
    '- Include: 1) One-sentence overview, 2) 3 concise bullet points of key takeaways or deadlines.',
    '- Keep it under 120 words.',
    '',
    'Course page content:',
    plainText,
  ].join('\n');

  return callLlm(config, prompt);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read video file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uses Gemini multimodal API to automatically generate timestamped WebVTT closed captions
 * AND visual audio descriptions for blind students from an uploaded video file (<= 18 MB).
 */
export async function transcribeVideoWithGemini(
  config: AiConfig,
  videoFile: File
): Promise<{ captionsVtt: string; descriptionsVtt: string }> {
  if (!config.apiKey.trim()) {
    throw new Error('Please enter a Gemini API key in AI Settings first.');
  }
  if (config.provider !== 'gemini') {
    throw new Error('Automatic video transcription requires the Google Gemini provider in AI Settings.');
  }
  if (videoFile.size > 18 * 1024 * 1024) {
    throw new Error(
      'Video is larger than 18 MB for direct browser upload. Please upload a shorter clip or upload a .vtt/.srt caption file manually.'
    );
  }

  const base64Data = await fileToBase64(videoFile);
  const model = config.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;

  const prompt = [
    'Analyze this educational video for ADA Title II / WCAG 2.1 AA compliance.',
    'Return ONLY a valid JSON object (no markdown fences) with two string keys:',
    '1. "captionsVtt": Complete, accurate WebVTT (starting with WEBVTT) closed captions of all speech and important non-speech sound cues like [music] or [bell rings].',
    '2. "descriptionsVtt": WebVTT (starting with WEBVTT) audio descriptions for blind students describing key visual-only content (slides, text on screen, diagrams, demonstrations) at their timestamps.',
  ].join('\n');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: videoFile.type || 'video/mp4',
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
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
  };
}

