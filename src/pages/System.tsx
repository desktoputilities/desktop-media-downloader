import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink, ShieldCheck, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type PlatformId = 'windows' | 'macos' | 'linux';

interface RuntimeDependency {
  id: string;
  name: string;
  required: boolean;
  installed: boolean;
  installCommand: string;
  helpUrl: string;
}

interface RuntimeStatus {
  platform: PlatformId;
  dependencies: RuntimeDependency[];
}

const System: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [error, setError] = useState('');
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  const loadStatus = async () => {
    if (!window.electronAPI?.getRuntimeDependenciesStatus) {
      setError(t('system.unavailable'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.getRuntimeDependenciesStatus();
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        setError(t('system.loadError'));
      }
    } catch {
      setError('Could not load dependency status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    window.electronAPI?.getEngineStatus?.().then(setEngines).catch(() => undefined);
    // A background check may update an engine while this page is open.
    return window.electronAPI?.onEnginesUpdated?.((next) => {
      setEngines(next);
      loadStatus();
    });
  }, []);

  const engineVersion = (id: string) => engines?.engines.find((engine) => engine.id === id);

  const handleUpdateEngines = async () => {
    if (!window.electronAPI?.updateEngines) return;
    setIsUpdating(true);
    setUpdateMessage('');
    try {
      const { results, status: next } = await window.electronAPI.updateEngines();
      setEngines(next);
      const updated = results.flatMap((result) => (result.status === 'updated' ? [`${result.engine} ${result.to}`] : []));
      const failed = results.flatMap((result) => (result.status === 'error' ? [`${result.engine}: ${result.error}`] : []));
      setUpdateMessage([
        updated.length ? t('system.enginesUpdated', { engines: updated.join(', ') }) : failed.length ? '' : t('system.enginesCurrent'),
        failed.length ? t('system.enginesUpdateFailed', { error: failed.join('; ') }) : '',
      ].filter(Boolean).join(' '));
      loadStatus();
    } catch {
      setUpdateMessage(t('system.enginesUpdateFailed', { error: '' }));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleAutoUpdate = async () => {
    if (!engines || !window.electronAPI?.setEngineAutoUpdate) return;
    setEngines(await window.electronAPI.setEngineAutoUpdate(!engines.autoUpdate));
  };

  const missingRequired = useMemo(
    () => (status?.dependencies || []).filter((item) => item.required && !item.installed),
    [status],
  );

  const copyCommand = async (id: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1200);
    } catch {
      setCopiedId('');
    }
  };

  const openLink = async (url: string) => {
    if (window.electronAPI?.openExternalUrl) {
      const result = await window.electronAPI.openExternalUrl(url);
      if (!result.success) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full w-full bg-transparent p-8 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            System Check
          </div>
          <h1 className="text-2xl font-bold mt-3">{t('system.title')}</h1>
          <p className="text-foreground/60 mt-2">
            {t('system.description')}
          </p>
        </div>

        <div className="bg-secondary/30 rounded-2xl p-4 border border-foreground/5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground/60">
              {t('system.platform')}: <span className="text-foreground/85 font-medium">{status?.platform || t('common.unknown')}</span>
            </p>
            <button
              onClick={loadStatus}
              className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-sm transition-colors inline-flex items-center gap-1.5"
              disabled={isLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {t('system.recheck')}
            </button>
          </div>

          {missingRequired.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
              {t('system.missingWarning')}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-foreground/20 bg-foreground/5 p-3 text-sm text-foreground/75">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {(status?.dependencies || []).map((item) => (
              <div key={item.id} className="surface-subtle p-4 border border-foreground/10 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {item.installed ? (
                        <CheckCircle2 className="w-4 h-4 text-foreground" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-warning" />
                      )}
                      <p className="text-sm font-medium">
                        {item.name}
                        {item.required ? (
                          <span className="text-warning"> ({t('system.required')})</span>
                        ) : (
                          <span className="text-foreground/50"> ({t('system.optional')})</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-foreground/60 mt-1">
                      {item.installed ? t('system.detected') : t('system.notFound')}
                      {item.installed && engineVersion(item.id)?.version && (
                        <span>
                          {' '}{t('system.engineVersion', { version: engineVersion(item.id)?.version })}
                          {engineVersion(item.id)?.source === 'updated' && ` (${t('system.engineUpdatedTag')})`}
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    onClick={() => openLink(item.helpUrl)}
                    className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-sm transition-colors inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('system.guide')}
                  </button>
                </div>

                {!item.installed && (
                  <>
                    <pre className="mt-3 bg-background/60 border border-foreground/10 rounded-lg p-3 text-xs whitespace-pre-wrap break-words">
                      {item.installCommand}
                    </pre>
                    <button
                      onClick={() => copyCommand(item.id, item.installCommand)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-sm transition-colors inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedId === item.id ? t('system.copied') : t('system.copyCommand')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {engines && (
          <div className="mt-4 bg-secondary/30 rounded-2xl p-4 border border-foreground/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t('system.engineUpdatesTitle')}</p>
                <p className="text-xs text-foreground/60 mt-1">{t('system.engineUpdatesDescription')}</p>
                <p className="text-xs text-foreground/50 mt-1">
                  {engines.lastCheckedAt
                    ? t('system.enginesLastChecked', { time: new Date(engines.lastCheckedAt).toLocaleString() })
                    : t('system.enginesNeverChecked')}
                </p>
              </div>
              <button
                onClick={handleUpdateEngines}
                disabled={isUpdating || engines.updating}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {isUpdating ? t('system.enginesUpdating') : t('system.updateEngines')}
              </button>
            </div>

            {updateMessage && (
              <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/5 p-3 text-sm text-foreground/75">
                {updateMessage}
              </div>
            )}

            <label className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground/75">{t('system.enginesAutoUpdate')}</span>
              <button
                role="switch"
                aria-checked={engines.autoUpdate}
                onClick={handleToggleAutoUpdate}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${engines.autoUpdate ? 'bg-primary' : 'bg-secondary'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-primary-foreground transition-all ${engines.autoUpdate ? 'left-6' : 'left-1'}`} />
              </button>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default System;
