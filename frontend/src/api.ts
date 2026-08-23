import type {
  ApiHealth,
  AuditRecordData,
  BanditPosteriorResponse,
  CounterfactualResponse,
  Customer360Data,
  DecisionTraceData,
  DriftHistoryResponse,
  DriftResponse,
  ExperimentsResponse,
  FullModelCard,
  ModelCardResponse,
  ModelRegistryResponse,
  PredictionPayload,
  PredictionResponse,
  QueueResponse,
  QueueSummary,
  ScenarioRequestData,
  ScenarioResponseData,
  StrategyComparisonData,
  SystemHealthData,
} from './types';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured && configured.startsWith('http') && !configured.includes('retentionai-api:')) {
    return configured.endsWith('/api/v1') ? configured : `${configured.replace(/\/$/, '')}/api/v1`;
  }
  // When deployed on Render static site (e.g. retentionai-web.onrender.com)
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com')) {
    const apiHost = window.location.hostname.replace(/^retentionai-web/, 'retentionai-api');
    return `https://${apiHost}/api/v1`;
  }
  // When deployed on Vercel (e.g. *.vercel.app) or custom domain without explicit ENV
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://retentionai-api.onrender.com/api/v1';
  }
  let base = (configured || '/api/v1').replace(/\/$/, '');
  if (base && !base.startsWith('http://') && !base.startsWith('https://') && !base.startsWith('/')) {
    base = `https://${base}`;
  }
  if (base.startsWith('http') && !base.endsWith('/api/v1') && !base.endsWith('/api')) {
    base = `${base}/api/v1`;
  }
  return base;
}

const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('The decision intelligence service is temporarily unavailable. Start the API service, then try again.');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String(payload.detail)
        : `Request failed with status ${response.status}.`;
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Core Decision Intelligence Endpoints
// ---------------------------------------------------------------------------

export function getHealth() {
  return request<ApiHealth>('/health');
}

export function getSystemHealth() {
  return request<SystemHealthData>('/system/health');
}

export function getQueue(limit: number = 100, offset: number = 0) {
  return request<QueueResponse>(`/queue?limit=${limit}&offset=${offset}`);
}

export function getQueueSummary() {
  return request<QueueSummary>('/queue/summary');
}

export function getCustomer360(customerId: string) {
  return request<Customer360Data>(`/customer/${encodeURIComponent(customerId)}`);
}

export function predictCustomer(payload: PredictionPayload) {
  return request<PredictionResponse>('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getCounterfactual(requestId: string) {
  return request<CounterfactualResponse>(`/counterfactual/${encodeURIComponent(requestId)}`);
}

export function runScenario(scenario: ScenarioRequestData) {
  return request<ScenarioResponseData>('/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  });
}

export function compareBudgetStrategies(budget: number = 100) {
  return request<StrategyComparisonData>(`/scenario/compare?budget=${budget}`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Observability & Traces
// ---------------------------------------------------------------------------

export function listTraces(limit: number = 50) {
  return request<{ traces: DecisionTraceData[]; total: number }>(`/traces?limit=${limit}`);
}

export function getTrace(traceId: string) {
  return request<DecisionTraceData>(`/traces/${encodeURIComponent(traceId)}`);
}

// ---------------------------------------------------------------------------
// Governance & Audit
// ---------------------------------------------------------------------------

export function listAuditRecords(limit: number = 50) {
  return request<{ records: AuditRecordData[]; total: number }>(`/audit?limit=${limit}`);
}

export function getAuditRecord(decisionId: string) {
  return request<AuditRecordData>(`/audit/${encodeURIComponent(decisionId)}`);
}

export function updateAuditReview(
  decisionId: string,
  status: 'pending' | 'approved' | 'rejected' | 'escalated',
  reviewer: string = 'ops_reviewer'
) {
  return request<AuditRecordData>(`/audit/${encodeURIComponent(decisionId)}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reviewer }),
  });
}

export function getModelCard() {
  return request<ModelCardResponse>('/model-card');
}

export function getFullModelCard() {
  return request<FullModelCard>('/model-card/full');
}

// ---------------------------------------------------------------------------
// ML Platform & Experiments
// ---------------------------------------------------------------------------

export function getModelRegistry() {
  return request<ModelRegistryResponse>('/registry');
}

export function getModelVersionDetail(version: string) {
  return request<{ version: string; is_current: boolean; manifest: Record<string, unknown>; evaluation: unknown }>(
    `/registry/${encodeURIComponent(version)}`
  );
}

export function getExperiments() {
  return request<ExperimentsResponse>('/experiments');
}

export function getBanditPosteriors() {
  return request<BanditPosteriorResponse>('/bandit/posteriors');
}

export function getDrift(includeBenchmark: boolean = false) {
  return request<DriftResponse>(`/monitoring/drift?include_benchmark=${includeBenchmark}`);
}

export function getDriftHistory(sourceType?: string) {
  const query = sourceType ? `?source_type=${encodeURIComponent(sourceType)}` : '';
  return request<DriftHistoryResponse>(`/monitoring/drift/history${query}`);
}

export function triggerDriftSnapshot() {
  return request<DriftResponse>('/monitoring/drift/snapshot', {
    method: 'POST',
  });
}

export function submitFeedback(requestId: string, arm: string, retained: boolean) {
  return request<{ status: string; arm: string; retained: boolean }>(`/feedback/${encodeURIComponent(arm)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, retained }),
  });
}
