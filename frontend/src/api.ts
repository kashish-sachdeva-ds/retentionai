import type {
  ApiHealth,
  BanditPosteriorResponse,
  CounterfactualResponse,
  DriftResponse,
  ModelCardResponse,
  PredictionPayload,
  PredictionResponse,
} from './types';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured && configured.startsWith('http') && !configured.includes('retentionai-api:')) {
    return configured.endsWith('/api/v1') ? configured : `${configured.replace(/\/$/, '')}/api/v1`;
  }
  // When deployed on Render static site (e.g. retentionai-web.onrender.com or retentionai-web-xxxx.onrender.com),
  // automatically route API calls to the corresponding retentionai-api web service domain.
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com')) {
    const apiHost = window.location.hostname.replace(/^retentionai-web/, 'retentionai-api');
    return `https://${apiHost}/api/v1`;
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
    throw new ApiError('The model service is unavailable. Start the API and Redis services, then try again.');
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

export function submitFeedback(requestId: string, arm: string, retained: boolean) {
  return request<{ status: string; arm: string; retained: boolean }>(`/feedback/${encodeURIComponent(arm)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, retained }),
  });
}

export function getHealth() {
  return request<ApiHealth>('/health');
}

export function getModelCard() {
  return request<ModelCardResponse>('/model-card');
}

export function getBanditPosteriors() {
  return request<BanditPosteriorResponse>('/bandit/posteriors');
}

export function getDrift() {
  return request<DriftResponse>('/monitoring/drift');
}
