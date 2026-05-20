import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Search,
  Upload,
  FileCode,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useState } from 'react';
import { useComponentStore } from '../stores/componentStore';
import { parseSchemaFile, parseSchemaFileMulti } from '../utils/tsParser';
import type { ComponentSchemaPayload } from '../types';

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span>{current} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UpdatePanel() {
  const {
    existingComponents,
    selectedComponents,
    updateResults,
    isLoadingComponents,
    isUpdating,
    updateDelay,
    updateProgress,
    loadComponents,
    toggleSelectComponent,
    toggleSelectAll,
    clearSelection,
    updateSelected,
    updateSelectedBulk,
    setUpdateDelay,
    clearUpdateResults,
    parsedSchemas,
    loadFromFile,
    autoLoadMatchingSchemas,
    localSchemas,
    addLog,
    autoMatchReport,
    clearAutoMatchReport,
  } = useComponentStore();

  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [tsError, setTsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = existingComponents.filter((c) => {
    const matchSearch =
      !search ||
      c.componentKey.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.nameAr.includes(search);
    const matchSection = !sectionFilter || c.sections.some((s) => s.slug === sectionFilter);
    return matchSearch && matchSection;
  });

  const sections = [...new Set(existingComponents.flatMap((c) => c.sections.map((s) => s.slug)))];
  const successCount = updateResults.filter((r) => r.success).length;
  const failCount = updateResults.filter((r) => !r.success).length;

  const quickLoads: { label: string; url: string }[] = [
    { label: 'All', url: '/api/schemas/all' },
    { label: 'Sections', url: '/api/schemas/sections' },
    { label: 'General', url: '/api/schemas/general' },
    { label: 'Funnels', url: '/api/schemas/funnels' },
    { label: 'Landing', url: '/api/schemas/landing' },
    { label: 'Themes', url: '/api/schemas/themes' },
  ];

  const loadUrl = async (url: string) => {
    setLoading(true);
    addLog(`Fetching schemas from ${url}...`, 'info');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ComponentSchemaPayload[] = await res.json();
      addLog(`Loaded ${data.length} schema(s) from ${url}`, 'success');
      loadFromFile(data);
    } catch (e) {
      addLog(`Failed to load from ${url}: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setTsError(null);
    addLog(`Parsing ${files.length} .ts file(s)...`, 'info');
    if (files.length === 1) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = parseSchemaFile(ev.target?.result as string);
        if (result.error) {
          setTsError(result.error);
          addLog(`Parse error: ${result.error}`, 'error');
        } else if (result.schemas) {
          addLog(`Parsed ${result.schemas.length} schema(s) from .ts file`, 'success');
          loadFromFile(result.schemas);
        }
      };
      reader.readAsText(files[0]);
    } else {
      Promise.all(
        Array.from(files).map(
          (f) =>
            new Promise<{ name: string; content: string }>((resolve) => {
              const r = new FileReader();
              r.onload = (ev) => resolve({ name: f.name, content: ev.target?.result as string });
              r.readAsText(f);
            })
        )
      ).then((data) => {
        const schemas = parseSchemaFileMulti(data);
        if (schemas.length === 0) {
          setTsError('No schemas found in selected files');
          addLog('No schemas found in selected .ts files', 'error');
        } else {
          addLog(`Parsed ${schemas.length} schema(s) from ${files.length} .ts files`, 'success');
          loadFromFile(schemas);
        }
      });
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`Loading JSON file: ${file.name}`, 'info');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const arr = Array.isArray(data) ? data : [data];
        addLog(`Loaded ${arr.length} schema(s) from JSON file`, 'success');
        loadFromFile(arr);
      } catch {
        setTsError('Invalid JSON file');
        addLog('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* Progress during updates */}
      {isUpdating && updateProgress && (
        <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4">
          <ProgressBar
            current={updateProgress.current}
            total={updateProgress.total}
            label={`Updating ${selectedComponents.length} components...`}
          />
        </div>
      )}

      {/* Progress during load components */}
      {isLoadingComponents && (
        <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4">
          <ProgressBar
            current={0}
            total={0}
            label="Fetching existing components from API..."
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={loadComponents}
          disabled={isLoadingComponents}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm rounded-lg transition"
        >
          {isLoadingComponents ? <Clock className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isLoadingComponents ? 'Loading...' : 'Load Components'}
        </button>

        {selectedComponents.length > 0 && (
          <button
            onClick={autoLoadMatchingSchemas}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition"
          >
            <Zap className="w-4 h-4" />
            Auto-match ({selectedComponents.length})
          </button>
        )}

        {selectedComponents.length > 0 && (
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}

        {/* Manual schema loaders */}
        {quickLoads.map((ql) => (
          <button
            key={ql.url}
            onClick={() => loadUrl(ql.url)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-200 text-sm rounded-lg transition"
          >
            {loading ? <Clock className="w-3.5 h-3.5 animate-spin" /> : null}
            {loading ? '...' : ql.label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer text-sm text-gray-200 transition">
          <FileCode className="w-4 h-4" />
          .ts
          <input type="file" accept=".ts" multiple className="hidden" onChange={handleTsUpload} />
        </label>
        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer text-sm text-gray-200 transition">
          <Upload className="w-4 h-4" />
          .json
          <input type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
        </label>
      </div>

      {/* Errors */}
      {tsError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          <strong>.ts Parse Error:</strong> {tsError}
        </div>
      )}

      {/* Schema Status */}
      {localSchemas.length > 0 && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
          <p className="text-sm text-green-400 font-medium">
            {localSchemas.length} schema(s) auto-matched from local files
          </p>
          <div className="flex gap-2 flex-wrap mt-1">
            {localSchemas.map((s, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-green-900/30 rounded text-green-300 font-mono">{s.componentKey}</span>
            ))}
          </div>
        </div>
      )}

      {/* Auto-match Report */}
      {autoMatchReport && (
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-medium text-gray-300">Auto-match Report</span>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                {autoMatchReport.matched.length} found
              </span>
              {autoMatchReport.missing.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5" />
                  {autoMatchReport.missing.length} missing
                </span>
              )}
            </div>
            <button
              onClick={clearAutoMatchReport}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Dismiss
            </button>
          </div>

          {autoMatchReport.missing.length > 0 && (
            <div className="p-4">
              <p className="text-xs text-red-400 mb-2 font-medium">
                These {autoMatchReport.missing.length} component(s) have no local schema file:
              </p>
              <div className="flex flex-wrap gap-2">
                {autoMatchReport.missing.map((c) => (
                  <span key={c.id} className="text-xs px-2 py-1 bg-red-900/20 border border-red-800/30 rounded text-red-300 font-mono">
                    {c.componentKey}
                  </span>
                ))}
              </div>
            </div>
          )}

          {autoMatchReport.matched.length > 0 && (
            <div className="p-4 border-t border-gray-800">
              <p className="text-xs text-green-400 mb-2 font-medium">
                Found schemas for {autoMatchReport.matched.length} component(s):
              </p>
              <div className="flex flex-wrap gap-2">
                {autoMatchReport.matched.map((c) => (
                  <span key={c.id} className="text-xs px-2 py-1 bg-green-900/20 border border-green-800/30 rounded text-green-300 font-mono">
                    {c.componentKey}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Update All button */}
          {localSchemas.length > 0 && selectedComponents.length > 0 && (
            <div className="px-4 pb-4 flex items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <label className="text-sm text-gray-400 whitespace-nowrap">Delay (ms):</label>
                <input
                  type="number"
                  value={updateDelay}
                  onChange={(e) => setUpdateDelay(Number(e.target.value))}
                  min={0}
                  step={100}
                  className="w-28 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => updateSelectedBulk(localSchemas)}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition"
              >
                {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isUpdating
                  ? `Updating...`
                  : `Update All (${localSchemas.length} matched)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Component List */}
      {existingComponents.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by key, name..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 p-2 bg-purple-900/10 border border-purple-800/40 rounded-lg">
            <span className="text-sm text-purple-300">{selectedComponents.length} selected</span>
            <span className="text-gray-600">/</span>
            <span className="text-sm text-gray-500">{filtered.length} shown</span>
            {filtered.length !== existingComponents.length && (
              <span className="text-xs text-gray-600 ml-2">of {existingComponents.length} total</span>
            )}
            <button
              onClick={() => toggleSelectAll(filtered)}
              disabled={filtered.length === 0}
              className="ml-auto text-xs px-2.5 py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition"
            >
              {filtered.every((c) => selectedComponents.some((sc) => sc.id === c.id)) ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-800 rounded-xl divide-y divide-gray-800">
            {filtered.map((c) => {
              const isSelected = selectedComponents.some((sc) => sc.id === c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => toggleSelectComponent(c)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition ${
                    isSelected ? 'bg-purple-900/20' : ''
                  }`}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => {}} className="w-4 h-4 accent-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{c.componentKey}</p>
                    <p className="text-xs text-gray-500 truncate">{c.name} — {c.nameAr}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap shrink-0">
                    {c.sections.map((s) => (
                      <span key={s.slug} className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">{s.slug}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Step 2 */}
      {selectedComponents.length > 0 && (
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 space-y-3">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-medium text-gray-300">
              Apply to {selectedComponents.length} component(s)
            </h3>
            {localSchemas.length > 0 && (
              <span className="text-xs px-2 py-0.5 bg-green-900/30 rounded text-green-400">
                {localSchemas.length} schema(s) matched
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 whitespace-nowrap">Delay (ms):</label>
            <input
              type="number"
              value={updateDelay}
              onChange={(e) => setUpdateDelay(Number(e.target.value))}
              min={0}
              step={100}
              className="w-28 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            {parsedSchemas.length === 0 ? (
              <button disabled className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
                <RefreshCw className="w-4 h-4" />
                Click "Auto-match" above to load schemas
              </button>
            ) : (
              parsedSchemas.map((s, i) => (
                <button
                  key={i}
                  onClick={() => updateSelected(s)}
                  disabled={isUpdating}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition"
                >
                  {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isUpdating ? `Updating (${updateProgress?.current ?? 0}/${updateProgress?.total ?? selectedComponents.length})...` : `Update ${selectedComponents.length} with "${s.componentKey}"`}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {updateResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{selectedComponents.length} done</span>
            {successCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle className="w-4 h-4" /> {successCount} succeeded
              </span>
            )}
            {failCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-500">
                <XCircle className="w-4 h-4" /> {failCount} failed
              </span>
            )}
            <button onClick={clearUpdateResults} className="ml-auto text-xs text-gray-500 hover:text-gray-300">Clear</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {updateResults.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                  r.success ? 'bg-green-900/10 text-green-400' : 'bg-red-900/10 text-red-400'
                }`}
              >
                {r.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                <span className="font-mono shrink-0">{r.componentKey}</span>
                <span className="text-gray-500 truncate">{r.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}