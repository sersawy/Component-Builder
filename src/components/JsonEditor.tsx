import { FileCode } from 'lucide-react';
import { useState } from 'react';
import { useComponentStore } from '../stores/componentStore';
import { parseSchemaFile, parseSchemaFileMulti } from '../utils/tsParser';
import type { ComponentSchemaPayload } from '../types';

export function JsonEditor() {
  const { rawJson, parsedSchemas, parseError, setRawJson, parseJson, loadFromFile, addLog } = useComponentStore();
  const [tsError, setTsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const quickLoads: { label: string; url: string }[] = [
    { label: 'All (392)', url: '/api/schemas/all' },
    { label: 'Sections (39)', url: '/api/schemas/sections' },
    { label: 'General (50)', url: '/api/schemas/general' },
    { label: 'Funnels (154)', url: '/api/schemas/funnels' },
    { label: 'Landing (74)', url: '/api/schemas/landing' },
    { label: 'Themes (94)', url: '/api/schemas/themes' },
  ];

  const loadUrl = async (url: string) => {
    setLoading(true);
    addLog(`Loading schemas from ${url}...`, 'info');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ComponentSchemaPayload[] = await res.json();
      addLog(`Loaded ${data.length} schema(s) from ${url}`, 'success');
      loadFromFile(data);
    } catch (e) {
      addLog(`Failed to load ${url}: ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`Loading JSON file: ${file.name}`, 'info');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawJson(ev.target?.result as string || '');
      setTimeout(parseJson, 50);
    };
    reader.readAsText(file);
  };

  const handleTsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setTsError(null);
    addLog(`Parsing ${files.length} .ts file(s)...`, 'info');

    if (files.length === 1) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string || '';
        const result = parseSchemaFile(content);
        if (result.error) {
          setTsError(result.error);
          addLog(`Parse error: ${result.error}`, 'error');
        } else if (result.schemas) {
          addLog(`Parsed ${result.schemas.length} schema(s) from ${file.name}`, 'success', result.schemas.map((s) => s.componentKey).join(', '));
          loadFromFile(result.schemas);
        }
      };
      reader.readAsText(file);
    } else {
      const readers: Promise<{ name: string; content: string }>[] = [];
      for (let i = 0; i < files.length; i++) {
        readers.push(
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve({ name: files[i].name, content: ev.target?.result as string });
            reader.readAsText(files[i]);
          })
        );
      }
      Promise.all(readers).then((fileData) => {
        const schemas = parseSchemaFileMulti(fileData);
        if (schemas.length === 0) {
          setTsError('No schemas found in any of the selected files');
          addLog('No schemas found in selected .ts files', 'error');
        } else {
          addLog(`Parsed ${schemas.length} schema(s) from ${files.length} .ts files`, 'success', schemas.map((s) => s.componentKey).join(', '));
          loadFromFile(schemas);
        }
      });
    }
  };

  const handleParseJson = () => {
    const before = parsedSchemas.length;
    parseJson();
    const after = useComponentStore.getState().parsedSchemas.length;
    if (after > before) {
      addLog(`JSON parsed: ${after} schema(s)`, 'success', useComponentStore.getState().parsedSchemas.map((s) => s.componentKey).join(', '));
    } else if (useComponentStore.getState().parseError) {
      addLog(`JSON parse failed: ${useComponentStore.getState().parseError}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileCode className="w-5 h-5" />
          Component Schema Input
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {quickLoads.map((ql) => (
            <button
              key={ql.url}
              onClick={() => loadUrl(ql.url)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 text-white text-sm rounded-lg transition"
            >
              {loading ? '...' : ql.label}
            </button>
          ))}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer text-sm text-gray-700 dark:text-gray-300 transition">
            <FileCode className="w-4 h-4" />
            .ts
            <input
              type="file"
              accept=".ts"
              multiple
              className="hidden"
              onChange={handleTsUpload}
            />
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer text-sm text-gray-700 dark:text-gray-300 transition">
            .json
            <input type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            placeholder={`Paste JSON schema(s) here...\n\nSingle schema:\n{\n  "componentKey": "my-component",\n  "name": "My Component",\n  ...\n}\n\nOr array of schemas:\n[\n  { ... },\n  { ... }\n]`}
            className="w-full h-80 bg-gray-950 text-gray-100 font-mono text-sm rounded-xl border border-gray-800 p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-600"
          />
          <span className="absolute top-3 right-3 text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded">JSON</span>
        </div>

        <div className="relative">
          <textarea
            value={parsedSchemas.length > 0 ? JSON.stringify(parsedSchemas, null, 2) : ''}
            readOnly
            placeholder="Parsed schemas will appear here after clicking Parse..."
            className="w-full h-80 bg-gray-950 text-gray-100 font-mono text-sm rounded-xl border border-gray-800 p-4 focus:outline-none resize-none placeholder:text-gray-600"
          />
          <span className="absolute top-3 right-3 text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded">Preview</span>
        </div>
      </div>

      {tsError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          <strong>.ts Parse Error:</strong> {tsError}
        </div>
      )}

      {parseError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          <strong>Parse Error:</strong> {parseError}
        </div>
      )}

      {parsedSchemas.length > 0 && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 text-green-400 text-sm">
          {parsedSchemas.length} schema(s) parsed — {parsedSchemas.map((s) => s.componentKey).join(', ')}
        </div>
      )}

      <button
        onClick={handleParseJson}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
      >
        Parse JSON
      </button>
    </div>
  );
}