import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHealth,
  predictCustomer,
  getQueue,
  getCustomer360,
} from '../api';
import type { PredictionPayload } from '../types';

const mockPayload: PredictionPayload = {
  tenure: 2,
  MonthlyCharges: 89.5,
  TotalCharges: 179.0,
  SeniorCitizen: 0,
  Contract: 'Month-to-month',
  InternetService: 'Fiber optic',
  OnlineSecurity: 'No',
  OnlineBackup: 'No',
  DeviceProtection: 'No',
  TechSupport: 'No',
  StreamingTV: 'Yes',
  StreamingMovies: 'Yes',
  PaymentMethod: 'Electronic check',
  gender: 'Female',
  Partner: 'No',
  Dependents: 'No',
  PhoneService: 'Yes',
  MultipleLines: 'No',
  PaperlessBilling: 'Yes',
};

describe('Frontend API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getHealth returns health status on success', async () => {
    const mockHealth = { status: 'ok', model_loaded: true, model_version: 'v2026-test' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealth,
    } as Response);

    const data = await getHealth();
    expect(data.status).toBe('ok');
    expect(data.model_loaded).toBe(true);
  });

  it('predictCustomer sends JSON payload and returns prediction response with decision fields', async () => {
    const mockResponse = {
      request_id: 'test-req-123',
      model_version: 'v2026-test',
      calibrated_churn_probability: 0.654,
      conformal_prediction_set: [1],
      recommended_arm: 'discount',
      counterfactual_status: 'pending',
      priority_score: 82.5,
      recommended_action: 'Prioritize for Diagnostic Review',
      decision_confidence: 'high',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await predictCustomer(mockPayload);
    expect(result.request_id).toBe('test-req-123');
    expect(result.calibrated_churn_probability).toBe(0.654);
    expect(result.priority_score).toBe(82.5);
    expect(result.recommended_action).toBe('Prioritize for Diagnostic Review');
  });

  it('getQueue returns priority queue with ranked customers', async () => {
    const mockQueue = {
      status: 'ok',
      total_customers: 7043,
      showing: 1,
      offset: 0,
      risk_bands: { '95_plus': 342, '80_to_95': 684, '50_to_80': 1250, below_50: 4767 },
      customers: [
        {
          customer_id: 'CUST-001',
          calibrated_probability: 0.92,
          conformal_set: [1],
          priority: { score: 94.2 },
          recommended_action: 'Prioritize for Diagnostic Review',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockQueue,
    } as Response);

    const data = await getQueue(10, 0);
    expect(data.status).toBe('ok');
    expect(data.customers[0].customer_id).toBe('CUST-001');
    expect(data.customers[0].priority.score).toBe(94.2);
  });

  it('getCustomer360 returns comprehensive analytical object', async () => {
    const mockCustomer = {
      customer_id: 'CUST-001',
      calibrated_probability: 0.88,
      conformal_set: [1],
      customer_value: 1200,
      priority: { score: 91.5 },
      recommended_action: 'Prioritize for Diagnostic Review',
      decision_confidence: 'high',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCustomer,
    } as Response);

    const data = await getCustomer360('CUST-001');
    expect(data.customer_id).toBe('CUST-001');
    expect(data.customer_value).toBe(1200);
  });

  it('handles API errors gracefully with descriptive message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Invalid customer features' }),
    } as Response);

    await expect(predictCustomer(mockPayload)).rejects.toThrow('Invalid customer features');
  });
});
