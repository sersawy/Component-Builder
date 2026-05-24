export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  messageAr: string;
  data?: T;
  errorCode?: string;
  timestamp: string;
}

export interface ThemeItem {
  id: string;
  key: string;
  name: string;
  nameAr: string | null;
  version: string;
  description: string;
  previewImage: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  isDefaultAr: boolean;
  isDefaultEn: boolean;
  isPremium: boolean;
  price: number;
}

export interface DefaultComponent {
  id: string;
  componentId: string;
  componentKey: string;
  region: string;
  sortOrder: number;
  config: Record<string, unknown>;
  slot?: string;
  parentId?: string;
}

export interface LandingItem {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  previewImage: string;
  previewLink: string | null;
  isActive: boolean;
  isPremium: boolean;
  price: string;
  createdAt: string;
  updatedAt: string;
  defaultComponents?: DefaultComponent[];
}

export interface FlowItem {
  id: string;
  key: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  previewImage: string;
  previewLink: string | null;
  isActive: boolean;
  isPremium: boolean;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationItem {
  defaultComponentId: string;
  componentKey: string;
  apiComponentId: string | null;
  status: 'matched' | 'missing_api' | 'mismatch' | 'missing_id' | 'extra';
  message: string;
  suggestedId?: string;
  path: string; // e.g. "defaultHomepageComponents[2].slots.items[0]"
}

export interface ValidationReport {
  items: ValidationItem[];
  summary: { total: number; matched: number; errors: number; missingIds: number };
}

export interface EntityUpdateResult {
  success: boolean;
  message: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface CreateComponentResponse {
  id: string;
}

export interface Section {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ExistingComponent {
  id: string;
  componentKey: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  contexts: string[];
  sectionSlugs: string[];
  props: Record<string, PropDefinition>;
  previewImage: string;
  isActive: boolean;
  isPublic: boolean;
  isPremium: boolean;
  sections: Section[];
  createdAt: string;
  updatedAt: string;
}

export interface ComponentsListResponse {
  components: ExistingComponent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PropDefinition {
  type: 'string' | 'number' | 'boolean' | 'image' | 'color' | 'select' | 'array' | 'object' | 'date';
  label?: string;
  labelAr?: string;
  description?: string;
  descriptionAr?: string;
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  itemSchema?: PropDefinition | Record<string, PropDefinition>;
  propertySchema?: Record<string, PropDefinition>;
}

export interface ComponentSchemaPayload {
  componentKey: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  previewImage?: string;
  contexts: string[];
  sectionSlugs: string[];
  props?: Record<string, PropDefinition>;
  region?: string;
}

export interface SubmitResult {
  schema: ComponentSchemaPayload;
  success: boolean;
  message: string;
  id?: string;
  errorCode?: string;
}

export interface UpdateResult {
  componentKey: string;
  componentId: string;
  success: boolean;
  message: string;
  errorCode?: string;
}

export type LogLevel = 'info' | 'success' | 'error' | 'warn';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: LogLevel;
  detail?: string;
}