import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getHealth } from './api';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { HomePage } from './pages/HomePage';
import { PriorityQueuePage } from './pages/PriorityQueuePage';
import { Customer360Page } from './pages/Customer360Page';
import { RiskAssessmentPage } from './pages/RiskAssessmentPage';
import { ScenarioLabPage } from './pages/ScenarioLabPage';
import { ModelEvidencePage } from './pages/ModelEvidencePage';
import { MonitoringPage } from './pages/MonitoringPage';
import { GovernancePage } from './pages/GovernancePage';
import type { ApiHealth, PredictionPayload, PredictionResponse, ScoredAssessment } from './types';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [assessments, setAssessments] = useState<ScoredAssessment[]>([]);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      setHealth(await getHealth());
      setHealthError(null);
    } catch (error) {
      setHealth(null);
      setHealthError(error instanceof Error ? error.message : 'Could not reach the model service.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const interval = window.setInterval(() => {
      void refreshHealth();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refreshHealth]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handlePrediction = (response: PredictionResponse, payload: PredictionPayload) => {
    setAssessments((current) => [{ response, payload, createdAt: new Date() }, ...current]);
    setToastMessage(`Decision generated: ${response.recommended_action || 'Prioritize for Diagnostic Review'}`);
    void refreshHealth();
  };

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          health={health}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <TopHeader
            health={health}
            healthError={healthError}
            healthLoading={healthLoading}
            onRefreshHealth={() => void refreshHealth()}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
          />

          {toastMessage && (
            <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-xs sm:mx-8 sm:mt-6">
              <div className="flex items-center gap-3 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                {toastMessage}
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="ml-4 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <Routes>
            {/* 1. Decision Layer */}
            <Route path="/" element={<HomePage health={health} assessmentCount={assessments.length} />} />
            <Route path="/queue" element={<PriorityQueuePage />} />
            <Route path="/customer/:id" element={<Customer360Page />} />
            <Route path="/assess" element={<RiskAssessmentPage onPrediction={handlePrediction} />} />
            <Route path="/scenarios" element={<ScenarioLabPage />} />

            {/* 2. ML Platform & Trust */}
            <Route path="/evaluation" element={<ModelEvidencePage />} />
            <Route path="/evidence" element={<Navigate to="/evaluation" replace />} />
            <Route path="/monitoring" element={<MonitoringPage />} />

            {/* 3. Governance & Lineage */}
            <Route path="/governance" element={<GovernancePage />} />
            <Route path="/about" element={<Navigate to="/governance" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
