const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

export interface Workspace {
  id: string;
  created_at: string;
  expires_at: string;
  items: WorkspaceItem[];
}

export interface WorkspaceItem {
  id: string;
  workspace_id: string;
  type: 'note' | 'file';
  content: string;
  file_key?: string;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000); // Increased to 30s

  try {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal || controller.signal,
    });

    clearTimeout(id);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        data.error || response.statusText,
        response.status,
        data.code
      );
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out or cancelled', 408, 'TIMEOUT');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message || 'Unknown network error', 500, 'NETWORK_ERROR');
  }
}

export const api = {
  createWorkspace: (id?: string) => request<{ id: string; expiresAt: string }>('/api/workspaces', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: id ? JSON.stringify({ id }) : undefined
  }),
  
  getWorkspace: (id: string) => request<Workspace>(`/api/workspaces/${id}`),
  
  checkWorkspaceExists: (id: string) => request<{ exists: boolean }>(`/api/workspaces/${id}/exists`),
  
  deleteItem: (workspaceId: string, itemId: string) => request<{ success: true }>(`/api/workspaces/${workspaceId}/items/${itemId}`, {
    method: 'DELETE',
  }),

  uploadFile: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ id: string; fileKey: string }>(`/api/workspaces/${id}/files`, {
      method: 'POST',
      body: formData,
    });
  },

  uploadFileWithProgress: (
    id: string, 
    file: File, 
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ id: string; fileKey: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${API_BASE_URL}/api/workspaces/${id}/files`;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new ApiError(data.error || 'Upload failed', xhr.status, data.code));
          }
        } catch (e) {
          reject(new ApiError('Invalid response from server', 500));
        }
      });

      xhr.addEventListener('error', () => reject(new ApiError('Network error', 500)));
      xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));

      if (signal) {
        signal.addEventListener('abort', () => xhr.abort());
      }

      xhr.open('POST', url);
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  },
  
  addNote: (id: string, content: string) => request<{ id: string }>(`/api/workspaces/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }),
  
  getFileUrl: (workspaceId: string, itemId: string) => `${API_BASE_URL}/api/files/${workspaceId}/${itemId}`,
};

// For backward compatibility
export const createWorkspace = api.createWorkspace;
export const getWorkspace = api.getWorkspace;
export const uploadFile = api.uploadFile;
export const addNote = api.addNote;
export const getFileUrl = api.getFileUrl;
