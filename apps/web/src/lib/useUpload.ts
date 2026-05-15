import { useState, useCallback } from 'react';
import { api } from './api';
import toast from 'react-hot-toast';

export interface UploadStatus {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  controller?: AbortController;
}

export function useUpload(workspaceId: string, onSuccess: () => void) {
  const [uploads, setUploads] = useState<UploadStatus[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const uploadId = crypto.randomUUID();
    const controller = new AbortController();

    const newUpload: UploadStatus = {
      id: uploadId,
      file,
      progress: 0,
      status: 'uploading',
      controller,
    };

    setUploads((prev) => [...prev, newUpload]);

    try {
      // We need to update api.uploadFile to support progress and abort
      await api.uploadFileWithProgress(workspaceId, file, (progress) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
        );
      }, controller.signal);

      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId ? { ...u, status: 'completed', progress: 100 } : u
        )
      );
      
      onSuccess();
      
      // Auto-remove completed upload after 3 seconds
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      }, 3000);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'cancelled' } : u))
        );
      } else {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'error', error: err.message } : u))
        );
        if (err.status === 403) {
          toast.error(`Quota exceeded: ${err.message}`);
        } else {
          toast.error(`Upload failed: ${file.name}`);
        }
      }
    }
  }, [workspaceId, onSuccess]);

  const cancelUpload = useCallback((id: string) => {
    setUploads((prev) => {
      const upload = prev.find((u) => u.id === id);
      if (upload?.controller) {
        upload.controller.abort();
      }
      return prev.map((u) => (u.id === id ? { ...u, status: 'cancelled' } : u));
    });
  }, []);

  const retryUpload = useCallback((id: string) => {
    const upload = uploads.find((u) => u.id === id);
    if (upload) {
      setUploads((prev) => prev.filter((u) => u.id !== id));
      uploadFile(upload.file);
    }
  }, [uploads, uploadFile]);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== 'completed'));
  }, []);

  return {
    uploads,
    uploadFile,
    cancelUpload,
    retryUpload,
    clearCompleted,
  };
}
