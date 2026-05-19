import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Plus, ArrowRight, Hash, Lock as LockIcon, ShieldCheck, Shield as ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function LandingPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const createMutation = useMutation({
    mutationFn: ({ id, password }: { id?: string, password?: string }) => api.createWorkspace(id, password),
    onSuccess: (data: { id: string }) => {
      navigate(`/${data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create workspace');
    }
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => api.checkWorkspaceExists(id),
    onSuccess: (data, variables) => {
      if (data.exists) {
        navigate(`/${variables}`);
      } else {
        toast.error('Workspace ID not found or expired');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to join workspace');
    }
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = roomId.trim().toLowerCase();
    if (!id) return;
    if (id.length < 3) {
      toast.error('Workspace ID must be at least 3 characters');
      return;
    }
    joinMutation.mutate(id);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
        DropPad
      </h1>
      <p className="text-xl text-gray-600 mb-12 max-w-md">
        Temporary workspace for your team. Share notes, code, and files instantly.
      </p>
      
      <div className="w-full max-w-md space-y-6">
        {/* Quick Create */}
        <div className="space-y-4">
          <button
            onClick={() => createMutation.mutate({ password: password.trim() || undefined })}
            disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-xl shadow-blue-100"
          >
            {createMutation.isPending && !roomId ? (
              'Creating...'
            ) : (
              <>
                <Plus size={24} />
                Create New Workspace
              </>
            )}
          </button>

          <div className="text-left">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-gray-400 hover:text-blue-500 uppercase tracking-widest flex items-center gap-2 px-1 transition-colors"
            >
              {showAdvanced ? <ShieldCheck size={14} /> : <ShieldIcon size={14} />}
              {showAdvanced ? 'Hide Security Options' : 'Secure with Password'}
            </button>
            
            {showAdvanced && (
              <div className="mt-3 relative animate-in slide-in-from-top-2 duration-200">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <LockIcon size={16} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional password"
                  className="w-full pl-11 pr-4 py-3 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all font-medium text-gray-900 shadow-sm text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-50 px-2 text-gray-400 font-bold tracking-widest">Or join existing</span>
          </div>
        </div>

        {/* Join by Name */}
        <form onSubmit={handleJoin} className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
            <Hash size={20} />
          </div>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Workspace ID"
            className="w-full pl-12 pr-32 py-4 bg-white border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:outline-none transition-all font-medium text-gray-900 shadow-sm"
          />
          <button
            type="submit"
            disabled={joinMutation.isPending || !roomId.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 transition-all disabled:opacity-30"
          >
            {joinMutation.isPending ? 'Joining...' : (
              <>
                Join <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
      
      <p className="mt-12 text-sm text-gray-400 font-medium">
        No account required. Auto-expires in 24 hours.
      </p>
    </div>
  );
}
