import { create } from 'zustand';
import type { ComponentSchemaPayload, SubmitResult } from '../types';
import { createComponents } from '../api/client';

interface ComponentState {
  rawJson: string;
  parsedSchemas: ComponentSchemaPayload[];
  parseError: string | null;
  results: SubmitResult[];
  isSubmitting: boolean;
  setRawJson: (json: string) => void;
  parseJson: () => void;
  submitAll: () => Promise<void>;
  clearResults: () => void;
  loadFromFile: (schemas: ComponentSchemaPayload[]) => void;
}

export const useComponentStore = create<ComponentState>((set, get) => ({
  rawJson: '',
  parsedSchemas: [],
  parseError: null,
  results: [],
  isSubmitting: false,

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
        // Try newline-separated JSON objects
        const lines = trimmed.split('\n').filter((l) => l.trim().startsWith('{'));
        if (lines.length === 0) throw new Error('No valid JSON objects found');
        schemas = lines.map((l) => JSON.parse(l.trim()));
      }

      if (!Array.isArray(schemas)) {
        schemas = [schemas];
      }

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
    const { parsedSchemas } = get();
    if (parsedSchemas.length === 0) return;

    set({ isSubmitting: true });
    const results = await createComponents(parsedSchemas);
    set({ results, isSubmitting: false });
  },

  clearResults: () => set({ results: [] }),

  loadFromFile: (schemas) => {
    set({ parsedSchemas: schemas, rawJson: JSON.stringify(schemas, null, 2), parseError: null });
  },
}));
