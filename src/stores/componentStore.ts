import { create } from 'zustand';
import type { ComponentSchemaPayload, SubmitResult, ExistingComponent, UpdateResult, LogEntry, LogLevel } from '../types';
import { createComponent, getAllComponents, updateComponent } from '../api/client';

interface ComponentState {
  rawJson: string;
  parsedSchemas: ComponentSchemaPayload[];
  parseError: string | null;
  results: SubmitResult[];
  isSubmitting: boolean;

  // Update panel
  existingComponents: ExistingComponent[];
  selectedComponents: ExistingComponent[];
  updateResults: UpdateResult[];
  isLoadingComponents: boolean;
  isUpdating: boolean;
  updateDelay: number;
  localSchemas: ComponentSchemaPayload[];
  autoMatchReport: { matched: ExistingComponent[]; missing: ExistingComponent[] } | null;
  updateProgress: { current: number; total: number } | null;
  logs: LogEntry[];

  setRawJson: (json: string) => void;
  parseJson: () => void;
  submitAll: () => Promise<void>;
  clearResults: () => void;
  loadFromFile: (schemas: ComponentSchemaPayload[]) => void;

  loadComponents: () => Promise<void>;
  toggleSelectComponent: (component: ExistingComponent) => void;
  toggleSelectAll: (components: ExistingComponent[]) => void;
  clearSelection: () => void;
  updateSelected: (newSchema: ComponentSchemaPayload) => Promise<void>;
  updateSelectedBulk: (schemas: ComponentSchemaPayload[]) => Promise<void>;
  setUpdateDelay: (delay: number) => void;
  clearUpdateResults: () => void;
  autoLoadMatchingSchemas: () => Promise<void>;
  addLog: (message: string, level?: LogLevel, detail?: string) => void;
  clearLogs: () => void;
  setUpdateProgress: (progress: { current: number; total: number } | null) => void;
  clearAutoMatchReport: () => void;
}

export const useComponentStore = create<ComponentState>((set, get) => ({
  rawJson: '',
  parsedSchemas: [],
  parseError: null,
  results: [],
  isSubmitting: false,

  existingComponents: [],
  selectedComponents: [],
  updateResults: [],
  isLoadingComponents: false,
  isUpdating: false,
  updateDelay: 0,
  localSchemas: [],
  autoMatchReport: null,
  logs: [] as LogEntry[],
  updateProgress: null as { current: number; total: number } | null,

  setRawJson: (rawJson) => set({ rawJson, parseError: null }),

  parseJson: () => {
    const { rawJson } = get();
    try {
      const trimmed = rawJson.trim();
      let schemas: ComponentSchemaPayload[];

      if (trimmed.startsWith('[')) {
        schemas = JSON.parse(trimmed);
      } else if (trimmed.startsWith('{')) {
        schemas = [JSON.parse(trimmed)];
      } else {
        const lines = trimmed.split('\n').filter((l) => l.trim().startsWith('{'));
        if (lines.length === 0) throw new Error('No valid JSON objects found');
        schemas = lines.map((l) => JSON.parse(l.trim()));
      }

      if (!Array.isArray(schemas)) schemas = [schemas];

      for (const s of schemas) {
        if (!s.componentKey) throw new Error('Each schema must have a componentKey');
        if (!s.name) throw new Error('Each schema must have a name');
        if (!s.contexts) throw new Error('Each schema must have contexts array');
        if (!s.sectionSlugs) throw new Error('Each schema must have sectionSlugs array');
      }

      set({ parsedSchemas: schemas, parseError: null });
    } catch (e) {
      set({ parseError: (e as Error).message, parsedSchemas: [] });
    }
  },

  submitAll: async () => {
    const { parsedSchemas, addLog, setUpdateProgress } = get();
    if (parsedSchemas.length === 0) return;

    set({ isSubmitting: true });
    addLog(`Submitting ${parsedSchemas.length} schema(s)...`, 'info');
    const results = [];
    const total = parsedSchemas.length;

    for (let i = 0; i < parsedSchemas.length; i++) {
      const schema = parsedSchemas[i];
      setUpdateProgress({ current: i + 1, total });
      const res = await createComponent(schema);
      const result: SubmitResult = {
        schema,
        success: res.success,
        message: res.message,
        id: res.data?.id,
        errorCode: res.errorCode,
      };
      results.push(result);
      if (res.success) {
        addLog(`Created: ${schema.componentKey}`, 'success');
      } else {
        addLog(`Failed to create ${schema.componentKey}: ${res.message}`, res.errorCode === 'DUPLICATE_COMPONENT_KEY' ? 'warn' : 'error');
      }
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    addLog(`Submit done: ${ok} created, ${fail} failed`, fail > 0 ? 'warn' : 'success');

    set({ results, isSubmitting: false, updateProgress: null });
  },

  clearResults: () => set({ results: [] }),

  loadFromFile: (schemas) => {
    set({ parsedSchemas: schemas, rawJson: JSON.stringify(schemas, null, 2), parseError: null });
  },

  loadComponents: async () => {
    const { addLog } = get();
    set({ isLoadingComponents: true });
    addLog('Fetching existing components from API...', 'info');
    try {
      const components = await getAllComponents();
      addLog(`Loaded ${components.length} existing component(s)`, 'success');
      set({ existingComponents: components });
    } catch (e) {
      addLog(`Failed to load components: ${(e as Error).message}`, 'error');
      set({ existingComponents: [] });
    } finally {
      set({ isLoadingComponents: false });
    }
  },

  toggleSelectComponent: (component) => {
    const { selectedComponents } = get();
    const isSelected = selectedComponents.some((c) => c.id === component.id);
    if (isSelected) {
      set({ selectedComponents: selectedComponents.filter((c) => c.id !== component.id) });
    } else {
      set({ selectedComponents: [...selectedComponents, component] });
    }
  },

  toggleSelectAll: (components) => {
    const { selectedComponents } = get();
    const allSelected = components.every((c) => selectedComponents.some((sc) => sc.id === c.id));
    if (allSelected) {
      set({ selectedComponents: selectedComponents.filter((c) => !components.some((comp) => comp.id === c.id)) });
    } else {
      const newSelected = [...selectedComponents];
      for (const c of components) {
        if (!newSelected.some((sc) => sc.id === c.id)) {
          newSelected.push(c);
        }
      }
      set({ selectedComponents: newSelected });
    }
  },

  clearSelection: () => set({ selectedComponents: [], updateResults: [], autoMatchReport: null, localSchemas: [], parsedSchemas: [] }),

  updateSelected: async (newSchema) => {
    const { selectedComponents, updateDelay, addLog, setUpdateProgress } = get();
    if (selectedComponents.length === 0) return;

    set({ isUpdating: true });
    addLog(`Starting update of ${selectedComponents.length} component(s) with "${newSchema.componentKey}" (delay: ${updateDelay}ms)`, 'info');
    const updates = selectedComponents.map((c) => ({ id: c.id, schema: newSchema }));

    const results: UpdateResult[] = [];
    const total = updates.length;
    setUpdateProgress({ current: 0, total });

    for (let i = 0; i < updates.length; i++) {
      const { id, schema } = updates[i];
      const res = await updateComponent(id, schema);
      const result: UpdateResult = {
        componentKey: schema.componentKey,
        componentId: id,
        success: res.success,
        message: res.message,
        errorCode: res.errorCode,
      };
      results.push(result);

      if (res.success) {
        addLog(`Updated: ${schema.componentKey} (${id.slice(0, 8)}...)`, 'success');
      } else {
        addLog(`Failed: ${schema.componentKey} — ${res.message}`, 'error');
      }

      setUpdateProgress({ current: i + 1, total });

      if (updateDelay > 0 && i < updates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, updateDelay));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    addLog(`Update complete: ${successCount} succeeded, ${failCount} failed`, failCount > 0 ? 'warn' : 'success');

    set({ updateResults: results, isUpdating: false, updateProgress: null });
  },

  setUpdateDelay: (updateDelay) => set({ updateDelay }),

  clearUpdateResults: () => set({ updateResults: [] }),

  setUpdateProgress: (progress) => set({ updateProgress: progress }),

  autoLoadMatchingSchemas: async () => {
    const { selectedComponents, addLog } = get();
    if (selectedComponents.length === 0) return;

    addLog(`Auto-matching schemas for ${selectedComponents.length} selected components...`, 'info');
    try {
      const res = await fetch('/api/schemas/all');
      if (!res.ok) {
        addLog('Failed to fetch schemas from /api/schemas/all', 'error');
        return;
      }
      const allLocal: ComponentSchemaPayload[] = await res.json();

      const selectedKeys = new Set(selectedComponents.map((c) => c.componentKey));
      const matched = allLocal.filter((s) => selectedKeys.has(s.componentKey));

      const matchedComps = selectedComponents.filter((c) =>
        matched.some((m) => m.componentKey === c.componentKey)
      );
      const missingComps = selectedComponents.filter((c) =>
        !matched.some((m) => m.componentKey === c.componentKey)
      );

      set({
        autoMatchReport: { matched: matchedComps, missing: missingComps },
        localSchemas: matched,
        parsedSchemas: matched,
      });

      if (matched.length > 0) {
        addLog(`Matched ${matched.length}/${selectedComponents.length} — ${missingComps.length} missing locally`, missingComps.length > 0 ? 'warn' : 'success');
      } else {
        addLog('No schemas matched the selected components', 'warn');
      }
    } catch (e) {
      addLog(`Auto-match error: ${(e as Error).message}`, 'error');
    }
  },

  addLog: (message, level = 'info', detail) => {
    const { logs } = get();
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      message,
      level,
      detail,
    };
    set({ logs: [...logs.slice(-99), entry] });
  },

  clearLogs: () => set({ logs: [] }),

  clearAutoMatchReport: () => set({ autoMatchReport: null }),

  updateSelectedBulk: async (schemas) => {
    const { selectedComponents, updateDelay, addLog, setUpdateProgress } = get();
    if (selectedComponents.length === 0 || schemas.length === 0) return;

    // 1-to-1 match: each component gets its own schema by componentKey
    const schemaMap = new Map(schemas.map((s) => [s.componentKey, s]));
    const matched = selectedComponents
      .map((c) => ({ component: c, schema: schemaMap.get(c.componentKey) }))
      .filter((item): item is { component: ExistingComponent; schema: ComponentSchemaPayload } => !!item.schema);

    if (matched.length === 0) {
      addLog('No schemas matched selected components', 'warn');
      return;
    }

    set({ isUpdating: true });
    addLog(`Bulk update: ${matched.length} matched pairs`, 'info');

    const total = matched.length;
    let processed = 0;
    const results: UpdateResult[] = [];

    for (const { component: comp, schema } of matched) {
      const res = await updateComponent(comp.id, schema);
      const result: UpdateResult = {
        componentKey: schema.componentKey,
        componentId: comp.id,
        success: res.success,
        message: res.message,
        errorCode: res.errorCode,
      };
      results.push(result);
      processed++;
      setUpdateProgress({ current: processed, total });

      if (res.success) {
        addLog(`Updated ${comp.componentKey}`, 'success');
      } else {
        addLog(`Failed ${comp.componentKey}: ${res.message}`, 'error');
      }

      if (updateDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, updateDelay));
      }
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    addLog(`Bulk update done: ${ok} succeeded, ${fail} failed`, fail > 0 ? 'warn' : 'success');

    set({ updateResults: results, isUpdating: false, updateProgress: null });
  },
}));