import { create } from 'zustand';
import type { ComponentSchemaPayload, SubmitResult, ExistingComponent, UpdateResult, LogEntry, LogLevel, ThemeItem, LandingItem, FlowItem, ValidationReport, ValidationItem, EntityUpdateResult } from '../types';
import { createComponent, getAllComponents, updateComponent } from '../api/client';
import { getThemes, updateTheme, getLandings, updateLanding, getFlows, updateFlow } from '../api/client';

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

  // Entity panel (themes, landings, flows)
  entityType: 'component' | 'theme' | 'landing' | 'flow';
  existingThemes: ThemeItem[];
  existingLandings: LandingItem[];
  existingFlows: FlowItem[];
  selectedTheme: ThemeItem | null;
  selectedLanding: LandingItem | null;
  selectedFlow: FlowItem | null;
  isLoadingThemes: boolean;
  isLoadingLandings: boolean;
  isLoadingFlows: boolean;
  targetEntityJson: string;
  targetParseError: string | null;
  validationReport: ValidationReport | null;
  isValidating: boolean;
  isUpdatingEntity: boolean;
  entityUpdateResults: EntityUpdateResult[];

  setEntityType: (type: 'component' | 'theme' | 'landing' | 'flow') => void;
  loadThemes: () => Promise<void>;
  loadLandings: () => Promise<void>;
  loadFlows: () => Promise<void>;
  selectTheme: (theme: ThemeItem | null) => void;
  selectLanding: (landing: LandingItem | null) => void;
  selectFlow: (flow: FlowItem | null) => void;
  setTargetEntityJson: (json: string) => void;
  validateTargetEntity: () => Promise<void>;
  updateTargetEntity: (force: boolean) => Promise<void>;
  clearEntityState: () => void;
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

  entityType: 'component' as const,
  existingThemes: [],
  existingLandings: [],
  existingFlows: [],
  selectedTheme: null,
  selectedLanding: null,
  selectedFlow: null,
  isLoadingThemes: false,
  isLoadingLandings: false,
  isLoadingFlows: false,
  targetEntityJson: '',
  targetParseError: null,
  validationReport: null,
  isValidating: false,
  isUpdatingEntity: false,
  entityUpdateResults: [],

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

  // Entity panel actions
  setEntityType: (entityType) => set({ entityType }),

  loadThemes: async () => {
    const { addLog } = get();
    set({ isLoadingThemes: true });
    addLog('Fetching themes from API...', 'info');
    try {
      const res = await getThemes();
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : (res.data as { items: unknown[] }).items ?? [];
        set({ existingThemes: items as ThemeItem[] });
        addLog(`Loaded ${items.length} themes`, 'success');
      } else {
        addLog(`Failed to load themes: ${res.message}`, 'error');
      }
    } catch (e) {
      addLog(`Theme load error: ${(e as Error).message}`, 'error');
    } finally {
      set({ isLoadingThemes: false });
    }
  },

  loadLandings: async () => {
    const { addLog } = get();
    set({ isLoadingLandings: true });
    addLog('Fetching landings from API...', 'info');
    try {
      const res = await getLandings();
      if (res.success && res.data) {
        const data = res.data as unknown;
        const items = Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? []);
        set({ existingLandings: items as LandingItem[] });
        addLog(`Loaded ${items.length} landings`, 'success');
      } else {
        addLog(`Failed to load landings: ${res.message}`, 'error');
      }
    } catch (e) {
      addLog(`Landing load error: ${(e as Error).message}`, 'error');
    } finally {
      set({ isLoadingLandings: false });
    }
  },

  loadFlows: async () => {
    const { addLog } = get();
    set({ isLoadingFlows: true });
    addLog('Fetching flows from API...', 'info');
    try {
      const res = await getFlows();
      if (res.success && res.data) {
        const data = res.data as unknown;
        const items = Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? []);
        set({ existingFlows: items as FlowItem[] });
        addLog(`Loaded ${items.length} flows`, 'success');
      } else {
        addLog(`Failed to load flows: ${res.message}`, 'error');
      }
    } catch (e) {
      addLog(`Flow load error: ${(e as Error).message}`, 'error');
    } finally {
      set({ isLoadingFlows: false });
    }
  },

  selectTheme: (theme) => set({ selectedTheme: theme, validationReport: null }),
  selectLanding: (landing) => set({ selectedLanding: landing, validationReport: null }),
  selectFlow: (flow) => set({ selectedFlow: flow, validationReport: null }),

  setTargetEntityJson: (targetEntityJson) => set({ targetEntityJson, targetParseError: null, validationReport: null }),

  validateTargetEntity: async () => {
    const { targetEntityJson, existingComponents, addLog } = get();
    set({ isValidating: true });
    addLog('Validating entity JSON...', 'info');

    try {
      const parsed = JSON.parse(targetEntityJson);

      const defaultComponents = parsed.defaultComponents || parsed.defaultHomepageComponents || [];

      if (!Array.isArray(defaultComponents) || defaultComponents.length === 0) {
        set({ targetParseError: 'No defaultComponents or defaultHomepageComponents found in JSON', isValidating: false });
        addLog('Validation failed: no components found in JSON', 'error');
        return;
      }

      const componentIdMap = new Map(existingComponents.map((c) => [c.id, c]));
      const componentKeyMap = new Map(existingComponents.map((c) => [c.componentKey, c]));

      type FlatComponent = { componentKey: string; componentId: string; path: string };
      const flatComponents: FlatComponent[] = [];

      function flatten(items: unknown[], path: string) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i] as Record<string, unknown>;
          if (!item || typeof item !== 'object') continue;
          const key = item.componentKey as string;
          const id = item.componentId as string;
          if (key) {
            flatComponents.push({ componentKey: key, componentId: id || '', path: `${path}[${i}]` });
          }
          const slots = item.slots as Record<string, unknown[]> | undefined;
          if (slots) {
            for (const [slotName, slotItems] of Object.entries(slots)) {
              if (Array.isArray(slotItems)) {
                flatten(slotItems, `${path}[${i}].slots.${slotName}`);
              }
            }
          }
        }
      }

      flatten(defaultComponents, parsed.defaultComponents ? 'defaultComponents' : 'defaultHomepageComponents');

      const items: ValidationItem[] = [];
      for (const fc of flatComponents) {
        const { componentKey, componentId, path } = fc;
        const existingById = componentId ? componentIdMap.get(componentId) : undefined;
        const existingByKey = componentKeyMap.get(componentKey);

        if (existingById && existingById.componentKey === componentKey) {
          items.push({ defaultComponentId: componentId, componentKey, apiComponentId: componentId, status: 'matched', message: 'Component key and ID match', path });
        } else if (existingById && existingById.componentKey !== componentKey) {
          items.push({ defaultComponentId: componentId, componentKey, apiComponentId: existingById.id, status: 'mismatch', message: `Key mismatch: JSON="${componentKey}" API="${existingById.componentKey}"`, suggestedId: existingById.id, path });
        } else if (existingByKey && !componentId) {
          items.push({ defaultComponentId: componentId || '', componentKey, apiComponentId: existingByKey.id, status: 'missing_id', message: 'Component key found — componentId missing in JSON', suggestedId: existingByKey.id, path });
        } else if (existingByKey) {
          items.push({ defaultComponentId: componentId || '', componentKey, apiComponentId: existingByKey.id, status: 'matched', message: 'Component key matched — componentId completed from API', suggestedId: existingByKey.id, path });
        } else {
          items.push({ defaultComponentId: componentId || '', componentKey, apiComponentId: null, status: 'missing_api', message: 'Component key not found in loaded components', path });
        }
      }

      const matched = items.filter((i) => i.status === 'matched').length;
      const errors = items.filter((i) => ['mismatch', 'missing_api'].includes(i.status)).length;
      const missingIds = items.filter((i) => i.status === 'missing_id').length;

      const report: ValidationReport = { items, summary: { total: items.length, matched, errors, missingIds } };
      set({ validationReport: report, targetParseError: null });
      const warn = errors > 0 || missingIds > 0;
      addLog(`Validation: ${matched}/${items.length} matched, ${errors} errors, ${missingIds} missing IDs`, warn ? 'warn' : 'success');
    } catch (e) {
      set({ targetParseError: `Invalid JSON: ${(e as Error).message}`, isValidating: false });
      addLog(`Validation parse error: ${(e as Error).message}`, 'error');
      return;
    }

    set({ isValidating: false });
  },

  updateTargetEntity: async (_force) => {
    const { entityType, selectedTheme, selectedLanding, selectedFlow, targetEntityJson, addLog } = get();
    set({ isUpdatingEntity: true });
    addLog(`Updating ${entityType}...`, 'info');

    try {
      const parsed = JSON.parse(targetEntityJson);
      let id: string | null = null;
      let updater: (id: string, payload: unknown) => Promise<unknown> = async () => { throw new Error('No updater'); };

      if (entityType === 'theme') { id = selectedTheme?.id ?? null; updater = updateTheme; }
      else if (entityType === 'landing') { id = selectedLanding?.id ?? null; updater = updateLanding; }
      else if (entityType === 'flow') { id = selectedFlow?.id ?? null; updater = updateFlow; }

      if (!id) {
        addLog(`No ${entityType} selected`, 'error');
        set({ isUpdatingEntity: false });
        return;
      }

      const res = await (updater as (id: string, payload: unknown) => Promise<{ success: boolean; message: string }>)(id, parsed);

      const result: EntityUpdateResult = { success: res.success, message: res.message };
      set({ entityUpdateResults: [result] });

      if (res.success) {
        addLog(`${entityType} updated successfully`, 'success');
      } else {
        addLog(`Failed to update ${entityType}: ${res.message}`, 'error');
      }
    } catch (e) {
      addLog(`Update error: ${(e as Error).message}`, 'error');
      set({ entityUpdateResults: [{ success: false, message: (e as Error).message }] });
    }

    set({ isUpdatingEntity: false });
  },

  clearEntityState: () => set({
    selectedTheme: null, selectedLanding: null, selectedFlow: null,
    targetEntityJson: '', targetParseError: null, validationReport: null,
    entityUpdateResults: [],
  }),
}));