const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

export interface Workspace {
  id: string;
  created_at: string;
  expires_at: string;
  items: WorkspaceItem[];
  isProtected?: boolean;
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

  const headers = new Headers(options?.headers);
  const token = sessionStorage.getItem('dp_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
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
  createWorkspace: (id?: string, password?: string) => 
    request<{ id: string; expiresAt: string; isProtected: boolean }>('/api/workspaces', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password })
    }),
  
  authWorkspace: async (id: string, password: string) => {
    const { token } = await request<{ token: string }>(`/api/workspaces/${id}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    sessionStorage.setItem('dp_token', token);
    return { token };
  },

  getWorkspace: (id: string) => request<Workspace>(`/api/workspaces/${id}`),
  
  checkWorkspaceExists: (id: string) => request<{ exists: boolean; isProtected: boolean }>(`/api/workspaces/${id}/exists`),
  
  deleteItem: (workspaceId: string, itemId: string) => request<{ success: true }>(`/api/workspaces/${workspaceId}/items/${itemId}`, {
    method: 'DELETE',
  }),

  requestPresignedUrl: (workspaceId: string, filename: string, contentType: string, size: number) => 
    request<{ uploadUrl: string; fileKey: string; itemId: string; expiresIn: number }>('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, filename, contentType, size }),
    }),

  completeUpload: (workspaceId: string, fileKey: string, filename: string, size: number, contentType: string, duration?: number) =>
    request<{ id: string; fileKey: string }>('/api/uploads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, fileKey, filename, size, contentType, duration }),
    }),

  initiateMultipart: (workspaceId: string, filename: string, contentType: string, size: number) =>
    request<{ uploadId: string; fileKey: string; itemId: string }>('/api/uploads/multipart/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, filename, contentType, size }),
    }),

  signPart: (workspaceId: string, uploadId: string, fileKey: string, partNumber: number) =>
    request<{ url: string }>('/api/uploads/multipart/sign-part', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, uploadId, fileKey, partNumber }),
    }),

  completeMultipart: (workspaceId: string, uploadId: string, fileKey: string, filename: string, size: number, contentType: string, parts: { PartNumber: number, ETag: string }[], duration?: number) =>
    request<{ id: string; fileKey: string }>('/api/uploads/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, uploadId, fileKey, filename, size, contentType, parts, duration }),
    }),

  uploadFileWithProgress: async (
    id: string, 
    file: File, 
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ id: string; fileKey: string }> => {
    if (file.size > MULTIPART_THRESHOLD) {
      return api.uploadMultipart(id, file, onProgress, signal);
    }
    return api.uploadSingle(id, file, onProgress, signal);
  },

  uploadSingle: async (
    id: string, 
    file: File, 
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ id: string; fileKey: string }> => {
    const startTime = Date.now();
    const { uploadUrl, fileKey } = await api.requestPresignedUrl(id, file.name, file.type, file.size);

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve(null) : reject(new ApiError('Upload failed', xhr.status)));
      xhr.addEventListener('error', () => reject(new ApiError('Network error', 500)));
      xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      if (signal) signal.addEventListener('abort', () => xhr.abort());
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });

    const duration = Date.now() - startTime;
    return api.completeUpload(id, fileKey, file.name, file.size, file.type, duration);
  },

  uploadMultipart: async (
    id: string, 
    file: File, 
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ id: string; fileKey: string }> => {
    const startTime = Date.now();
    console.debug(`[Upload] Starting multipart upload for ${file.name} (${file.size} bytes)`);
    const { uploadId, fileKey } = await api.initiateMultipart(id, file.name, file.type, file.size);
    console.debug(`[Upload] Initiated multipart. ID: ${uploadId}`);
    
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    const completedParts: { PartNumber: number, ETag: string }[] = [];
    let loadedBytes = 0;

    try {
      for (let i = 1; i <= totalParts; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const start = (i - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        // Part retry logic
        let partSuccess = false;
        let attempts = 0;
        let lastError = null;

        while (!partSuccess && attempts < 3) {
          attempts++;
          try {
            console.debug(`[Upload] Signing part ${i}/${totalParts} (Attempt ${attempts})`);
            const { url } = await api.signPart(id, uploadId, fileKey, i);
            
            const etag = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              
              xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                  const currentProgress = Math.round(((loadedBytes + e.loaded) / file.size) * 100);
                  onProgress(currentProgress);
                }
              });

              xhr.addEventListener('load', () => {
                console.debug(`[Upload] Part ${i} status: ${xhr.status}`);
                if (xhr.status >= 200 && xhr.status < 300) {
                  const etagHeader = xhr.getResponseHeader('ETag');
                  if (!etagHeader) {
                    console.warn(`[Upload] Part ${i} missing ETag header. This will cause CompleteMultipartUpload to fail.`);
                    reject(new ApiError(`ETag missing in response for part ${i}`, 500));
                  } else {
                    resolve(etagHeader);
                  }
                } else {
                  reject(new ApiError(`Part ${i} failed: ${xhr.status} ${xhr.responseText}`, xhr.status));
                }
              });

              xhr.addEventListener('error', () => reject(new ApiError(`Network error at part ${i}`, 500)));
              xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
              if (signal) signal.addEventListener('abort', () => xhr.abort());
              
              xhr.open('PUT', url);
              xhr.send(chunk);
            });

            completedParts.push({ PartNumber: i, ETag: etag });
            partSuccess = true;
            loadedBytes += chunk.size;
            console.debug(`[Upload] Part ${i} success. ETag: ${etag}`);
          } catch (err: any) {
            lastError = err;
            if (err.name === 'AbortError') throw err;
            console.warn(`[Upload] Part ${i} attempt ${attempts} failed:`, err.message);
            if (attempts < 3) await new Promise(r => setTimeout(r, 1000 * attempts)); // Exponential backoff
          }
        }

        if (!partSuccess) throw lastError || new Error(`Part ${i} failed after 3 attempts`);
      }

      console.debug(`[Upload] Completing multipart upload...`);
      const duration = Date.now() - startTime;
      return api.completeMultipart(id, uploadId, fileKey, file.name, file.size, file.type, completedParts, duration);
    } catch (err: any) {
      console.error(`[Upload] Multipart upload aborted:`, err.message);
      request(`/api/uploads/multipart/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: id, uploadId, fileKey })
      }).catch(e => console.error('[Upload] Failed to abort:', e.message));
      throw err;
    }
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
export const uploadFile = api.uploadFileWithProgress;
export const addNote = api.addNote;
export const getFileUrl = api.getFileUrl;
