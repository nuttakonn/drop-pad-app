import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Plus } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: (data: { id: string }) => {
      navigate(`/${data.id}`);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
        DropPad
      </h1>
      <p className="text-xl text-gray-600 mb-12 max-w-md">
        Temporary workspace for your team. Share notes, code, and files instantly.
      </p>
      
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shadow-xl shadow-blue-200"
      >
        {mutation.isPending ? (
          'Creating...'
        ) : (
          <>
            <Plus size={24} />
            Create Workspace
          </>
        )}
      </button>
      
      <p className="mt-8 text-sm text-gray-400">
        No account required. Auto-expires in 24 hours.
      </p>
    </div>
  );
}
