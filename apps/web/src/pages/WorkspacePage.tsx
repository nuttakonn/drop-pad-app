import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useUpload } from '../lib/useUpload';
import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  File as FileIcon, Type, Upload, ArrowLeft, Download, Clock, 
  ExternalLink, Loader2, AlertCircle, Copy, QrCode, X, 
  RotateCcw, ImageIcon, FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { formatDistanceToNow, isBefore } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => api.getWorkspace(id!),
    enabled: !!id,
    refetchInterval: 5000,
    retry: 1,
  });

  const { uploads, uploadFile, cancelUpload, retryUpload } = useUpload(id!, () => {
    queryClient.invalidateQueries({ queryKey: ['workspace', id] });
  });

  // Countdown effect
  useEffect(() => {
    if (!workspace) return;
    
    const timer = setInterval(() => {
      const expiry = new Date(workspace.expires_at);
      const now = new Date();
      
      if (isBefore(expiry, now)) {
        setIsExpired(true);
        setTimeLeft('Expired');
        clearInterval(timer);
      } else {
        setTimeLeft(formatDistanceToNow(expiry, { addSuffix: true }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [workspace]);

  // Clipboard support
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let found = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          uploadFile(file);
          found = true;
          toast.success('Pasted image from clipboard');
        }
      } else if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          uploadFile(file);
          found = true;
          toast.success('Pasted file from clipboard');
        }
      }
    }
    
    if (found) e.preventDefault();
  }, [uploadFile]);

  const noteMutation = useMutation({
    mutationFn: (content: string) => api.addNote(id!, content),
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['workspace', id] });
      toast.success('Note added');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to add note');
    }

  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => uploadFile(file));
  }, [uploadFile]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied');
  };

  const copyNote = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Note copied');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-gray-500 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error || isExpired) {
    const apiErr = error as any;
    const isReallyExpired = isExpired || (apiErr && apiErr.status === 410);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border text-center">
          <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isReallyExpired ? 'Workspace Expired' : 'Workspace Error'}
          </h2>
          <p className="text-gray-500 mb-6 leading-relaxed">
            {isReallyExpired 
              ? 'This workspace has reached its time limit and has been deleted for your privacy.'
              : apiErr?.message || 'We could not load the workspace you are looking for.'}
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

  if (!workspace) return null;

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
                Workspace <span className="text-blue-600 font-mono tracking-tight">{id}</span>
              </h1>
              <div className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 font-medium">
                <Clock size={12} className={isExpired ? 'text-red-500' : 'text-blue-500'} />
                <span>Expires {timeLeft}</span>
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
        {/* Input Area */}
        <div className="bg-white rounded-3xl shadow-sm border p-5 mb-8 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold uppercase tracking-wider">
                <Type size={14} /> Note
              </div>
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors">
                <Upload size={14} /> Upload
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
            {noteMutation.isPending && (
              <div className="flex items-center gap-2 text-blue-600 text-xs font-bold animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                SAVING...
              </div>
            )}
          </div>
          
          <textarea
            ref={textAreaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type or paste anything here... Markdown is supported!"
            className="w-full min-h-[140px] p-0 text-gray-800 focus:outline-none resize-none text-base leading-relaxed placeholder:text-gray-300"
          />
          
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-50">
            <p className="text-[10px] text-gray-400 font-medium">
              Pro tip: You can paste images or files directly with Ctrl+V
            </p>
            <button
              onClick={() => note && noteMutation.mutate(note)}
              disabled={!note || noteMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-2xl font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95"
            >
              Post Note
            </button>
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

        {/* Item List */}
        <div className="space-y-6">
          {workspace.items.map((item) => (
            <div key={item.id} className="bg-white rounded-3xl border p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${item.type === 'note' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                    {item.type === 'note' ? <Type size={18} /> : <FileIcon size={18} />}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">
                      {item.type === 'note' ? 'Text Note' : 'Shared File'}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.type === 'note' && (
                    <button 
                      onClick={() => copyNote(item.content)}
                      className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-xl transition-all"
                      title="Copy content"
                    >
                      <Copy size={18} />
                    </button>
                  )}
                </div>
              </div>
              
              {item.type === 'note' ? (
                <div className="prose prose-blue prose-sm max-w-none text-gray-800 leading-relaxed font-medium">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white text-blue-600 rounded-2xl border shadow-sm">
                      {item.content.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? <ImageIcon size={24} /> : <FileText size={24} />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate max-w-[180px] sm:max-w-md">{item.content}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Ready for download</p>
                    </div>
                  </div>
                  <a 
                    href={api.getFileUrl(id!, item.id)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-3 bg-white hover:bg-blue-600 hover:text-white text-blue-600 rounded-2xl border shadow-sm transition-all hover:scale-105 active:scale-95"
                    title="Download File"
                  >
                    <Download size={22} />
                  </a>
                </div>
              )}
            </div>
          ))}

          {workspace.items.length === 0 && uploads.length === 0 && (
            <div className="text-center py-24 bg-gray-50/50 rounded-[3rem] border-4 border-dashed border-gray-100">
              <div className="inline-block p-6 bg-white shadow-xl shadow-gray-100 rounded-3xl mb-6 text-gray-300 border border-gray-50">
                <Upload size={40} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Drop it like it's hot</h3>
              <p className="text-gray-400 text-sm max-w-xs mx-auto font-medium">
                Paste an image, drop a file, or type a note. Everything stays here for 24 hours.
              </p>
            </div>
          )}
        </div>
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
              Open your camera on another device to instantly access this workspace.
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
