import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/MainLayout';
import ConnectionPage from '@/pages/ConnectionPage';
import ExplorerPage from '@/pages/ExplorerPage';
import SamplingPage from '@/pages/SamplingPage';
import WorkloadPage from '@/pages/WorkloadPage';
import AnalysisPage from '@/pages/AnalysisPage';
import ReportPage from '@/pages/ReportPage';
import GuidePage from '@/pages/GuidePage';
import { useAtlasConnection } from '@/hooks/useAtlasConnection';

function App() {
  const { isConnected } = useAtlasConnection();

  return (
    <>
      <Routes>
        <Route path="/connect" element={<ConnectionPage />} />
        <Route element={<MainLayout />}>
          <Route
            path="/explorer"
            element={isConnected ? <ExplorerPage /> : <Navigate to="/connect" />}
          />
          <Route
            path="/sampling"
            element={isConnected ? <SamplingPage /> : <Navigate to="/connect" />}
          />
          <Route
            path="/workload"
            element={isConnected ? <WorkloadPage /> : <Navigate to="/connect" />}
          />
          <Route
            path="/analysis"
            element={isConnected ? <AnalysisPage /> : <Navigate to="/connect" />}
          />
          <Route
            path="/report"
            element={isConnected ? <ReportPage /> : <Navigate to="/connect" />}
          />
          <Route path="/guide" element={<GuidePage />} />
        </Route>
        <Route path="/" element={<Navigate to="/connect" />} />
        <Route path="*" element={<Navigate to="/connect" />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
