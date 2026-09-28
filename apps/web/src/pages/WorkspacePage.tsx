import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Room } from '../lib/api';
import { useUpload } from '../lib/useUpload';
import { useSharedText } from '../lib/useSharedText';
import { useState, useCallback, useEffect } from 'react';
import { 
  File as FileIcon, Type, Upload, ArrowLeft, Download, Clock, 
  ExternalLink, Loader2, AlertCircle, Copy, QrCode, X, 
  RotateCcw, ImageIcon, FileText, Trash2, CheckCircle, Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow, isBefore, formatDistanceStrict } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: room, isLoading, error } = useQuery({
    queryKey: ['room', id],
    queryFn: () => api.getRoom(id!),
    enabled: !!id,
    retry: 2,
  });

  // Poll for item count changes
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.pollRoom(id);
        const currentItems = queryClient.getQueryData<Room>(['room', id])?.items?.length || 0;
        if (res.itemCount !== currentItems) {
          queryClient.invalidateQueries({ queryKey: ['room', id] });
        }
      } catch (err) {
        console.error('Failed to poll items', err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-gray-500 font-medium">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    const apiErr = error as any;
    const isExpired = apiErr?.status === 410;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border text-center">
          <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isExpired ? 'Room Expired' : 'Room Error'}
          </h2>
          <p className="text-gray-500 mb-6 leading-relaxed">
            {isExpired 
              ? 'This room has reached its time limit and has been deleted for your privacy.'
              : apiErr?.message || 'We could not load the room you are looking for.'}
          </p>
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
          >
            <ArrowLeft size={18} /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return <RoomContent room={room} />;
}

function RoomContent({ room }: { room: Room }) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [activeTab, setActiveTab] = useState<'note' | 'upload'>('note');

  const { text, setText, saveStatus } = useSharedText({
    roomId: room.id,
    initialContent: room.content || '',
    initialVersion: room.contentVersion || 0
  });

  const { uploads, uploadFile, cancelUpload, retryUpload, removeUpload } = useUpload(room.id, () => {
    queryClient.invalidateQueries({ queryKey: ['room', room.id] });
  });

  // Countdown effect
  useEffect(() => {
    const timer = setInterval(() => {
      const expiry = new Date(room.expiresAt);
      const now = new Date();
      
      if (isBefore(expiry, now)) {
        setIsExpired(true);
        setTimeLeft('Expired');
        clearInterval(timer);
      } else {
        setTimeLeft(formatDistanceStrict(expiry, now, { addSuffix: true }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [room.expiresAt]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    // If active in text area, let native paste handle text, but still catch files
    const items = e.clipboardData.items;
    let foundFile = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          uploadFile(file);
          setActiveTab('upload');
          foundFile = true;
          toast.success('Pasted file from clipboard');
        }
      }
    }
    
    // Only prevent default if we handled a file, so text pasting in textarea works normally
    if (foundFile) e.preventDefault();
  }, [uploadFile]);

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.deleteRoomItem(room.id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room', room.id] });
      toast.success('Item deleted');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete item');
    }
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => uploadFile(file));
      setActiveTab('upload');
    }
  }, [uploadFile]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied');
  };

  const copyImageToClipboard = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      let pngBlob = blob;
      
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        
        pngBlob = await new Promise<Blob>((resolve) => 
          canvas.toBlob(b => resolve(b!), 'image/png')
        );
        URL.revokeObjectURL(img.src);
      }
      
      const htmlBlob = new Blob([`<img src="${imageUrl}" />`], { type: 'text/html' });
      
      await navigator.clipboard.write([
        new ClipboardItem({ 
          'image/png': pngBlob,
          'text/html': htmlBlob 
        })
      ]);
      toast.success('Copied image to clipboard!');
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('Failed to copy image');
    }
  };

  const isImageFile = (filename: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename || '');

  return (
    <div 
      className={`min-h-screen pb-20 transition-all ${isDragging ? 'bg-blue-50/50' : 'bg-gray-50'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2 text-gray-900 leading-none mb-1">
                {room.name}
              </h1>
              <div className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-2 font-medium">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-mono">{room.id}</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} className={isExpired ? 'text-red-500' : 'text-blue-500'} />
                  {timeLeft}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowQr(true)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
              title="Show QR Code"
            >
              <QrCode size={20} />
            </button>
            <button 
              onClick={copyLink}
              className="hidden sm:flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors font-semibold text-sm"
            >
              <ExternalLink size={14} /> Share
            </button>
            <button 
              onClick={copyLink}
              className="sm:hidden p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            >
              <ExternalLink size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Main Input/Upload Card */}
        <div className="bg-white rounded-3xl shadow-sm border overflow-hidden mb-8">
          <div className="flex border-b border-gray-100">
            <button 
              onClick={() => setActiveTab('note')}
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'note' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Type size={16} /> Shared Text
            </button>
            <button 
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'upload' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Upload size={16} /> Upload Files
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'note' ? (
              <div className="relative">
                <div className="absolute top-2 right-2 z-10 flex items-center justify-end">
                  {saveStatus === 'saving' && (
                    <div className="flex items-center gap-1.5 text-blue-500 bg-blue-50 px-2 py-1 rounded-md text-xs font-semibold animate-pulse">
                      <Loader2 size={12} className="animate-spin" /> Saving...
                    </div>
                  )}
                  {saveStatus === 'saved' && (
                    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-md text-xs font-semibold animate-in fade-in duration-300">
                      <CheckCircle size={12} /> Saved
                    </div>
                  )}
                  {saveStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-md text-xs font-semibold">
                      <AlertCircle size={12} /> Error
                    </div>
                  )}
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="พิมพ์อะไรก็ได้ที่นี่... ทุกคนในห้องจะเห็นเหมือนกัน"
                  className="w-full min-h-[200px] p-4 text-gray-800 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-blue-200 rounded-2xl focus:outline-none resize-y text-base leading-relaxed transition-all"
                />
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <div className="inline-block p-4 bg-white shadow-sm rounded-full mb-4 text-blue-500">
                  <Upload size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Upload Files</h3>
                <p className="text-sm text-gray-500 mb-6">Drag and drop files here, or click to browse</p>
                <label className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium cursor-pointer transition-colors shadow-sm inline-flex items-center gap-2">
                  <FileIcon size={18} /> Browse Files
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach(file => uploadFile(file));
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Upload Progress Queue */}
        {uploads.length > 0 && (
          <div className="mb-8 space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 flex items-center gap-2">
              <Upload size={12} /> Uploading {uploads.length} item{uploads.length > 1 ? 's' : ''}
            </h3>
            <div className="space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className="bg-white rounded-2xl border p-4 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      {u.file.type.startsWith('image/') ? <ImageIcon size={20} /> : <FileIcon size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-bold text-gray-900 truncate">{u.file.name}</span>
                        <span className="text-xs font-bold text-blue-600">{u.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${u.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`} 
                          style={{ width: `${u.progress}%` }} 
                        />
                      </div>
                      {u.status === 'error' && (
                        <p className="text-[10px] text-red-500 mt-1 font-bold">{u.error || 'Upload failed'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(u.status === 'error' || u.status === 'cancelled') && (
                      <button onClick={() => removeUpload(u.id)} className="p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500 rounded-xl" title="Remove">
                        <Trash2 size={18} />
                      </button>
                    )}
                    {u.status === 'error' && (
                      <button onClick={() => retryUpload(u.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl" title="Retry">
                        <RotateCcw size={18} />
                      </button>
                    )}
                    {(u.status === 'uploading' || u.status === 'pending') && (
                      <button onClick={() => cancelUpload(u.id)} className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-xl" title="Cancel">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Item List (Files only now) */}
        {room.items.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-1">Files ({room.items.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {room.items.map((item) => {
                const isImg = isImageFile(item.content || '');
                const fileUrl = api.getFileUrl(room.id, item.id, true);
                
                return (
                  <div key={item.id} className="bg-white rounded-3xl border shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col">
                    {isImg ? (
                      <div className="bg-gray-100 flex items-center justify-center relative overflow-hidden border-b border-gray-100 group-hover:bg-gray-200 transition-colors">
                        <img 
                          src={fileUrl} 
                          alt={item.content || 'Image preview'} 
                          className="max-h-60 w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="h-32 bg-gray-50 flex flex-col items-center justify-center border-b border-gray-100">
                        <div className="p-4 bg-white text-blue-500 rounded-2xl shadow-sm">
                          <FileText size={32} />
                        </div>
                      </div>
                    )}
                    
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex-1 min-w-0 mb-4">
                        <p className="font-bold text-gray-900 truncate text-sm" title={item.content || ''}>
                          {item.content}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium mt-1">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isImg && (
                          <button 
                            onClick={() => copyImageToClipboard(fileUrl)}
                            className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 border border-gray-200"
                          >
                            <Copy size={14} /> Copy
                          </button>
                        )}
                        <a 
                          href={api.getFileUrl(room.id, item.id)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 border border-blue-100"
                        >
                          <Download size={14} /> Save
                        </a>
                        <button 
                          onClick={() => {
                            if (confirm('Delete this file?')) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all disabled:opacity-50 border border-transparent"
                          title="Delete file"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-blue-600/10 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 border-4 border-blue-500 scale-110 transition-all duration-300">
            <div className="p-6 bg-blue-50 text-blue-600 rounded-full animate-bounce">
                <Upload size={56} />
            </div>
            <p className="text-3xl font-black text-blue-900 tracking-tight">Drop to Share</p>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900">Scan to Share</h3>
              <button onClick={() => setShowQr(false)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="bg-gray-50 p-6 rounded-3xl flex items-center justify-center mb-6 border border-gray-100">
              <QRCodeSVG 
                value={window.location.href} 
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>
            <p className="text-center text-sm text-gray-500 font-medium leading-relaxed">
              Open your camera on another device to instantly access this room.
            </p>
            <button 
              onClick={copyLink}
              className="w-full mt-6 bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
            >
              <Copy size={18} /> Copy URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
