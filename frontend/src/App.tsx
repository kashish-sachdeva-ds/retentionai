import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getHealth, submitFeedback } from './api';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { HomePage } from './pages/HomePage';
import { RiskAssessmentPage } from './pages/RiskAssessmentPage';
import { ModelEvidencePage } from './pages/ModelEvidencePage';
import { AboutPage } from './pages/AboutPage';
import type { ApiHealth, PredictionPayload, PredictionResponse, ScoredAssessment } from './types';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [assessments, setAssessments] = useState<ScoredAssessment[]>([]);
  const [feedbackRequestId, setFeedbackRequestId] = useState<string | null>(null);

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
    setToastMessage(`Live prediction created with the ${response.recommended_arm} policy arm.`);
    void refreshHealth();
  };

  const handleFeedback = async (assessment: ScoredAssessment, retained: boolean) => {
    setFeedbackRequestId(assessment.response.request_id);
    try {
      await submitFeedback(assessment.response.request_id, assessment.response.recommended_arm, retained);
      setAssessments((current) =>
        current.map((item) =>
          item.response.request_id === assessment.response.request_id
            ? { ...item, feedback: { retained, recordedAt: new Date() } }
            : item
        )
      );
      setToastMessage(`Outcome recorded: customer ${retained ? 'retained' : 'churned'}. The bandit posterior is updated.`);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Unable to record feedback.');
    } finally {
      setFeedbackRequestId(null);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
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
            <Route
              path="/"
              element={<HomePage health={health} assessmentCount={assessments.length} />}
            />
            <Route
              path="/assess"
              element={
                <RiskAssessmentPage
                  onPrediction={handlePrediction}
                  assessments={assessments}
                  onRecordFeedback={(assessment, retained) => void handleFeedback(assessment, retained)}
                  feedbackRequestId={feedbackRequestId}
                />
              }
            />
            <Route path="/evidence" element={<ModelEvidencePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
