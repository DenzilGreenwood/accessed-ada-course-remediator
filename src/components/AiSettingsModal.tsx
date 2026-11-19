import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { AiConfig, AiProvider } from '../types';

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

  function handleProviderChange(next: AiProvider) {
    setProvider(next);
    if (next === 'gemini') {
      setModel('gemini-2.5-flash');
    } else {
      setModel('gpt-4o-mini');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      enabled,
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'),
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
              Enable an optional AI API key to generate contextual image alt text, rewrite vague
              links, and create plain-language student summaries. Your key is saved only in your
              browser’s local storage.
            </p>

            <label className="rule-toggle" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable AI-assisted alt text, link rewriting &amp; plain-language summaries
            </label>

            <div className="field-group">
              <label htmlFor="ai-provider">AI Provider</label>
              <select
                id="ai-provider"
                className="lang-select"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              >
                <option value="gemini">Google Gemini API</option>
                <option value="openai">OpenAI / OpenAI-Compatible API</option>
              </select>
            </div>

            <div className="field-group">
              <label htmlFor="ai-key">API Key</label>
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
