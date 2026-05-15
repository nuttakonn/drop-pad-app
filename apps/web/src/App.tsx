import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LandingPage from './pages/LandingPage';
import WorkspacePage from './pages/WorkspacePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/:id" element={<WorkspacePage />} />
        </Routes>
      </div>
    </QueryClientProvider>
  );
}

export default App;
