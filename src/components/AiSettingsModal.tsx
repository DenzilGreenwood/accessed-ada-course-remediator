import { useState } from 'react';
import { AlertTriangle, ExternalLink, Sparkles, X } from 'lucide-react';
import type { AiConfig, AiProvider } from '../types';
import { estimateAiCostLabel, isChromeLocalAiAvailable } from '../engine/aiEnhancer';

interface AiSettingsModalProps {
  config: AiConfig;
  onSave: (next: AiConfig) => void;
  onClose: () => void;
}

export function AiSettingsModal({ config, onSave, onClose }: AiSettingsModalProps) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [provider, setProvider] = useState<AiProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || 'https://api.openai.com/v1');

  const chromeAiReady = isChromeLocalAiAvailable();

  function handleProviderChange(next: AiProvider) {
    setProvider(next);
    if (next === 'gemini') {
      setModel('gemini-2.5-flash');
    } else if (next === 'openai') {
      setModel('gpt-4o-mini');
    } else {
      setModel('gemini-nano');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      enabled,
      provider,
      apiKey: provider === 'chrome-nano' ? '' : apiKey.trim(),
      model:
        model.trim() ||
        (provider === 'gemini'
          ? 'gemini-2.5-flash'
          : provider === 'openai'
            ? 'gpt-4o-mini'
            : 'gemini-nano'),
      baseUrl: provider === 'openai' ? baseUrl.trim() : undefined,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="ai-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#0f766e" aria-hidden="true" />
            Optional AI Enhancement Settings
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close AI settings"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="field-hint" style={{ margin: 0 }}>
              AccessEd’s core WCAG 2.1 AA remediation engine works <strong>100% offline</strong>.
              Enable optional AI to generate subject-aware image alt text, rewrite vague links,
              auto-caption videos, and create plain-language summaries. Keys stay strictly in your
              browser’s local storage.
            </p>

            <label className="rule-toggle" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable AI-assisted alt text, link rewriting, summaries &amp; video captions
            </label>

            <div className="field-group">
              <label htmlFor="ai-provider">AI Provider</label>
              <select
                id="ai-provider"
                className="lang-select"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              >
                <option value="gemini">Google Gemini API (Recommended — Free Tier Available)</option>
                <option value="chrome-nano">
                  Chrome Built-In Local AI (Gemini Nano — Experimental, No API Key)
                </option>
                <option value="openai">OpenAI / OpenAI-Compatible API</option>
              </select>
            </div>

            {provider === 'chrome-nano' ? (
              <div className="info-callout" style={{ marginTop: 0 }}>
                <h3>
                  {chromeAiReady
                    ? 'Chrome Built-In AI Detected!'
                    : 'Experimental On-Device AI (Chrome 138+)'}
                </h3>
                <p style={{ margin: '0 0 8px' }}>
                  {chromeAiReady
                    ? 'Your browser supports Chrome’s on-device Gemini Nano Prompt API. Supported text tasks run 100% locally with zero API key or cloud inference.'
                    : 'Not detected in this browser yet. To try it offline, use Chrome 138+ with the Prompt API enabled—or select Google Gemini API above for a free key.'}
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <strong>Limitations:</strong> Chrome Built-In AI is <strong>text-only</strong> (alt-text
                  drafts from filename/context, link rewriting, plain-language summaries, and ASCII
                  diagram descriptions). It does <strong>not</strong> support image/vision tasks
                  (scanned PDF Vision, Office image inspection, code/equation screenshots, or
                  chart-to-table extraction)—those use offline Tesseract OCR / manual editors or
                  require Gemini/OpenAI. Sessions are destroyed after each prompt, though Chrome’s
                  own browser telemetry/crash-reporting settings still apply.
                </p>
              </div>
            ) : (
              <>
                <div className="field-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <label htmlFor="ai-key">API Key</label>
                    {provider === 'gemini' && (
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--accent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        Get a free Gemini API key in 30s
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <input
                    id="ai-key"
                    type="password"
                    className="text-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'gemini' ? 'AIza...' : 'sk-...'}
                    autoComplete="off"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="ai-model">Model Name</label>
                  <input
                    id="ai-model"
                    type="text"
                    className="text-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                  <span className="field-hint">
                    Estimated cost: {estimateAiCostLabel(24, provider)} (typical full course).
                  </span>
                </div>

                {provider === 'openai' && (
                  <div className="field-group">
                    <label htmlFor="ai-baseurl">API Base URL</label>
                    <input
                      id="ai-baseurl"
                      type="url"
                      className="text-input"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                )}

                <div
                  role="note"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #f59e0b',
                    background: '#fffbeb',
                    color: '#78350f',
                    fontSize: '0.8rem',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                    <AlertTriangle size={14} aria-hidden="true" />
                    Data Privacy &amp; AI Training Disclaimer
                  </div>
                  When using an external AI API key, course text, images, PDF pages, or media snippets
                  you choose to enhance are sent directly from your browser to that provider.{' '}
                  <strong>
                    Depending on your API plan (especially free-tier keys), the provider may retain
                    or use submitted data to train or improve its models.
                  </strong>{' '}
                  Do not submit FERPA-protected student records or sensitive/proprietary materials
                  unless your institution’s paid API agreement guarantees zero data retention—or
                  keep AI disabled and use AccessEd’s 100% offline engine.
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save AI Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
