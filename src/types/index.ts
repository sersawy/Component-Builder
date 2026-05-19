export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  messageAr: string;
  data?: T;
  errorCode?: string;
  timestamp: string;
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
