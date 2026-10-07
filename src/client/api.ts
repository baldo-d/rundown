import type {
  CustomField,
  Day,
  Entry,
  EntryInput,
  EventSettings,
  Meta,
  Rundown,
  RundownWithEntries,
  Stage,
} from '../shared/types';

/** Identifies this browser tab, so it can ignore its own change notifications. */
export const clientId =
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Called when the server says the session is no longer valid. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-client-id': clientId,
      ...(body !== undefined && !isRaw ? { 'content-type': 'application/json' } : {}),
      ...(isRaw ? { 'content-type': 'application/octet-stream' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : undefined;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return data as T;
}

export const api = {
  me: () => request<{ authenticated: boolean }>('GET', '/api/auth/me'),
  login: (pin: string) => request<{ ok: true }>('POST', '/api/auth/login', { pin }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  meta: () => request<Meta>('GET', '/api/meta'),
  updateSettings: (patch: Partial<EventSettings>) => request<EventSettings>('PATCH', '/api/settings', patch),

  createDay: (input: Partial<Pick<Day, 'label' | 'date'>>) => request<Day>('POST', '/api/days', input),
  updateDay: (id: string, patch: Partial<Pick<Day, 'label' | 'date'>>) =>
    request<Day>('PATCH', `/api/days/${id}`, patch),
  deleteDay: (id: string) => request('DELETE', `/api/days/${id}`),
  reorderDays: (ids: string[]) => request('POST', '/api/days/reorder', { ids }),

  createStage: (input: Partial<Pick<Stage, 'name' | 'color'>>) => request<Stage>('POST', '/api/stages', input),
  updateStage: (id: string, patch: Partial<Pick<Stage, 'name' | 'color'>>) =>
    request<Stage>('PATCH', `/api/stages/${id}`, patch),
  deleteStage: (id: string) => request('DELETE', `/api/stages/${id}`),
  reorderStages: (ids: string[]) => request('POST', '/api/stages/reorder', { ids }),

  createCustomField: (input: Partial<Pick<CustomField, 'label' | 'color'>>) =>
    request<CustomField>('POST', '/api/custom-fields', input),
  updateCustomField: (id: string, patch: Partial<Pick<CustomField, 'label' | 'color'>>) =>
    request<CustomField>('PATCH', `/api/custom-fields/${id}`, patch),
  deleteCustomField: (id: string) => request('DELETE', `/api/custom-fields/${id}`),
  reorderCustomFields: (ids: string[]) => request('POST', '/api/custom-fields/reorder', { ids }),

  rundown: (dayId: string, stageId: string) =>
    request<RundownWithEntries>('GET', `/api/rundowns/${dayId}/${stageId}`),
  updateRundown: (id: string, patch: { startTime: number }) => request<Rundown>('PATCH', `/api/rundowns/${id}`, patch),
  createEntry: (rundownId: string, input: EntryInput & { afterId?: string | null }) =>
    request<Entry>('POST', `/api/rundowns/${rundownId}/entries`, input),
  reorder: (rundownId: string, ids: string[]) => request<Rundown>('POST', `/api/rundowns/${rundownId}/reorder`, { ids }),
  importEntries: (
    rundownId: string,
    body: { mode: 'replace' | 'append'; startTime?: number; entries: EntryInput[] },
  ) => request<RundownWithEntries>('POST', `/api/rundowns/${rundownId}/import`, body),
  updateEntry: (id: string, patch: EntryInput) => request<Entry>('PATCH', `/api/entries/${id}`, patch),
  batchUpdate: (ids: string[], patch: EntryInput) => request('POST', '/api/entries/batch', { ids, patch }),
  deleteEntries: (ids: string[]) => request('POST', '/api/entries/delete', { ids }),
  duplicateEntries: (ids: string[]) => request<Entry[]>('POST', '/api/entries/duplicate', { ids }),

  previewImport: (file: File) =>
    request<{ sheets: { name: string; rows: string[][] }[] }>('POST', '/api/import/preview', file, {
      'x-filename': encodeURIComponent(file.name),
    }),
  restoreBackup: (file: File) => request('POST', '/api/import/json', file),
};
