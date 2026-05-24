import type {
  ApiResponse,
  LoginResponse,
  RefreshResponse,
  CreateComponentResponse,
  ComponentSchemaPayload,
  ComponentsListResponse,
  ExistingComponent,
  UpdateResult,
  ThemeItem,
  LandingItem,
  FlowItem,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.orderlek.com';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function getAccessToken() {
  return accessToken || localStorage.getItem('access_token');
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function loadTokens() {
  accessToken = localStorage.getItem('access_token');
  refreshToken = localStorage.getItem('refresh_token');
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/owner/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data: ApiResponse<RefreshResponse> = await res.json();
    if (data.success && data.data) {
      setTokens(data.data.access_token, data.data.refresh_token);
      return true;
    }
  } catch {
    // ignore
  }
  clearTokens();
  return false;
}

async function fetchWithAuth<T>(
  path: string,
  options: RequestInit & { _retry?: boolean } = {}
): Promise<ApiResponse<T>> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && !options._retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return fetchWithAuth<T>(path, { ...options, _retry: true });
    }
  }

  return res.json();
}

export async function login(email: string, password: string) {
  const data = await fetchWithAuth<LoginResponse>('/api/v1/owner/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.success && data.data) {
    setTokens(data.data.access_token, data.data.refresh_token);
  }
  return data;
}

export async function createComponent(schema: ComponentSchemaPayload) {
  return fetchWithAuth<CreateComponentResponse>('/api/v1/owner/components', {
    method: 'POST',
    body: JSON.stringify(schema),
  });
}

export async function createComponents(schemas: ComponentSchemaPayload[]) {
  const results = [];
  for (const schema of schemas) {
    const res = await createComponent(schema);
    results.push({
      schema,
      success: res.success,
      message: res.message,
      id: res.data?.id,
      errorCode: res.errorCode,
    });
  }
  return results;
}

export async function getComponents(page = 1, limit = 50): Promise<ApiResponse<ComponentsListResponse>> {
  return fetchWithAuth<ComponentsListResponse>(`/api/v1/owner/components?page=${page}&limit=${limit}`);
}

export async function getAllComponents(): Promise<ExistingComponent[]> {
  const all: ExistingComponent[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await getComponents(page, 50);
    if (res.success && res.data) {
      all.push(...res.data.components);
      totalPages = res.data.pagination.totalPages;
      page++;
    } else {
      break;
    }
  }

  return all;
}

export async function updateComponent(id: string, schema: ComponentSchemaPayload): Promise<ApiResponse<{ id: string }>> {
  // Strip componentKey from the payload (as requested)
  const { componentKey, ...updateBody } = schema;
  return fetchWithAuth<{ id: string }>(`/api/v1/owner/components/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updateBody),
  });
}

export async function updateComponents(
  updates: { id: string; schema: ComponentSchemaPayload }[],
  delayMs = 0
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  for (let i = 0; i < updates.length; i++) {
    const { id, schema } = updates[i];
    const res = await updateComponent(id, schema);
    results.push({
      componentKey: schema.componentKey,
      componentId: id,
      success: res.success,
      message: res.message,
      errorCode: res.errorCode,
    });

    if (delayMs > 0 && i < updates.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// Themes
export async function getThemes(): Promise<ApiResponse<{ items: ThemeItem[] }>> {
  return fetchWithAuth<{ items: ThemeItem[] }>('/api/v1/owner/themes');
}

export async function updateTheme(id: string, payload: unknown): Promise<ApiResponse<{ id: string }>> {
  return fetchWithAuth<{ id: string }>(`/api/v1/owner/themes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Landings
export async function getLandings(): Promise<ApiResponse<{ items: LandingItem[] }>> {
  return fetchWithAuth<{ items: LandingItem[] }>('/api/v1/owner/landings');
}

export async function updateLanding(id: string, payload: unknown): Promise<ApiResponse<{ id: string }>> {
  return fetchWithAuth<{ id: string }>(`/api/v1/owner/landings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Flows
export async function getFlows(): Promise<ApiResponse<{ items: FlowItem[] }>> {
  return fetchWithAuth<{ items: FlowItem[] }>('/api/v1/owner/flows');
}

export async function updateFlow(id: string, payload: unknown): Promise<ApiResponse<{ id: string }>> {
  return fetchWithAuth<{ id: string }>(`/api/v1/owner/flows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}