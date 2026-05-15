import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WorkspacePage from './pages/WorkspacePage';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/:id" element={<WorkspacePage />} />
      </Routes>
    </div>
  );
}

export default App;
