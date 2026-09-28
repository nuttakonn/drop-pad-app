import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowRight, Hash } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function LandingPage() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  
  const joinMutation = useMutation({
    mutationFn: (name: string) => api.joinRoom(name),
    onSuccess: (data) => {
      navigate(`/${data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to join room');
    }
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) return;
    if (name.length > 50) {
      toast.error('Room name must be 50 characters or less');
      return;
    }
    joinMutation.mutate(name);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/20">
        <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent drop-shadow-sm tracking-tight">
          DropPad
        </h1>
        <p className="text-lg text-gray-600 mb-8 font-medium">
          Share anything with your team, instantly.
        </p>
        
        <form onSubmit={handleJoin} className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
            <Hash size={20} />
          </div>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="ชื่อห้อง / Room name..."
            className="w-full pl-12 pr-32 py-4 bg-white border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-semibold text-gray-900 shadow-inner"
            disabled={joinMutation.isPending}
            autoFocus
          />
          <button
            type="submit"
            disabled={joinMutation.isPending || !roomName.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-md"
          >
            {joinMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                เข้าห้อง <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        
        <p className="mt-6 text-sm text-gray-500 font-medium bg-gray-50/50 py-2 px-4 rounded-lg inline-block border border-gray-100/50">
          พิมพ์ชื่อเดียวกัน = เข้าห้องเดียวกัน • หมดอายุใน 7 วัน
        </p>
      </div>
    </div>
  );
}
