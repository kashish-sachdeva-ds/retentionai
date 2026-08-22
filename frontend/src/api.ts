import type {
  ApiHealth,
  BanditPosteriorResponse,
  CounterfactualResponse,
  DriftResponse,
  ModelCardResponse,
  PredictionPayload,
  PredictionResponse,
} from './types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
let resolvedBaseUrl = (configuredBaseUrl || '/api/v1').replace(/\/$/, '');
if (
  resolvedBaseUrl &&
  !resolvedBaseUrl.startsWith('http://') &&
  !resolvedBaseUrl.startsWith('https://') &&
  !resolvedBaseUrl.startsWith('/')
) {
  resolvedBaseUrl = `https://${resolvedBaseUrl}`;
}
if (
  resolvedBaseUrl.startsWith('http') &&
  !resolvedBaseUrl.endsWith('/api/v1') &&
  !resolvedBaseUrl.endsWith('/api')
) {
  resolvedBaseUrl = `${resolvedBaseUrl}/api/v1`;
}
const API_BASE_URL = resolvedBaseUrl;

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
