/**
 * Client-side video & audio compression utilities to keep BYOK AI requests tiny
 * even when professors upload 500 MB+ Zoom lecture recordings.
 */

export interface ExtractedKeyframe {
  timestamp: number;
  base64Jpeg: string;
  mimeType: 'image/jpeg';
}

/** Encodes mono Float32 PCM samples into a compact 16-bit WAV ArrayBuffer */
function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Extracts and downsamples a video's audio track locally to 16 kHz mono WAV
 * using the browser's Web Audio API (~90% smaller than raw HD video).
 */
export async function extractCompressedAudio(videoFile: File): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx || typeof OfflineAudioContext === 'undefined') {
    throw new Error('Web Audio API is not available in this browser.');
  }

  const arrayBuffer = await videoFile.arrayBuffer();
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return encodeMonoWav(rendered.getChannelData(0), targetRate);
  } finally {
    await ctx.close();
  }
}

/**
 * Scrubs an offscreen HTML5 <video> onto a small <canvas> and captures compressed JPEG
 * keyframes ONLY when visual content changes significantly (e.g., new lecture slides).
 */
export async function extractVisualKeyframes(
  videoFile: File,
  maxFrames = 12,
  changeThreshold = 16
): Promise<ExtractedKeyframe[]> {
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode video metadata for keyframes.'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return [];

    const canvas = document.createElement('canvas');
    const targetWidth = 480;
    const scale = video.videoWidth > 0 ? Math.min(1, targetWidth / video.videoWidth) : 1;
    canvas.width = Math.max(160, Math.round((video.videoWidth || 480) * scale));
    canvas.height = Math.max(90, Math.round((video.videoHeight || 270) * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    const sampleSteps = Math.min(28, Math.max(6, Math.ceil(duration / 8)));
    const interval = duration / sampleSteps;
    const keyframes: ExtractedKeyframe[] = [];
    let prevLuma: Uint8Array | null = null;

    for (let i = 0; i < sampleSteps && keyframes.length < maxFrames; i++) {
      const ts = Math.min(duration - 0.1, i * interval);
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = Math.max(0, ts);
      });

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      // Compute coarse luminance fingerprint every 16th pixel
      const sampleLen = Math.floor(imgData.length / 64);
      const luma = new Uint8Array(sampleLen);
      for (let p = 0; p < sampleLen; p++) {
        const idx = p * 64;
        luma[p] = Math.round(
          0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]
        );
      }

      let meanDiff = 999;
      if (prevLuma && prevLuma.length === luma.length) {
        let sum = 0;
        for (let p = 0; p < luma.length; p++) {
          sum += Math.abs(luma[p] - prevLuma[p]);
        }
        meanDiff = sum / luma.length;
      }

      if (meanDiff >= changeThreshold) {
        prevLuma = luma;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        const comma = dataUrl.indexOf(',');
        keyframes.push({
          timestamp: ts,
          base64Jpeg: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
          mimeType: 'image/jpeg',
        });
      }
    }

    return keyframes;
  } finally {
    URL.revokeObjectURL(url);
  }
}
