import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getHealth, predictCustomer, getCounterfactual, ApiError } from '../api';
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

  it('predictCustomer sends JSON payload and returns prediction response', async () => {
    const mockResponse = {
      request_id: 'test-req-123',
      model_version: 'v2026-test',
      calibrated_churn_probability: 0.654,
      conformal_prediction_set: [1],
      recommended_arm: 'discount',
      counterfactual_status: 'pending',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await predictCustomer(mockPayload);
    expect(result.request_id).toBe('test-req-123');
    expect(result.calibrated_churn_probability).toBe(0.654);
    expect(result.recommended_arm).toBe('discount');
  });

  it('handles server errors by throwing ApiError with detail message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Validation failed on field tenure' }),
    } as Response);

    await expect(predictCustomer(mockPayload)).rejects.toThrow(ApiError);
  });

  it('getCounterfactual returns status payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ready', raw_changes: { ContractCommitmentMonths: 12 } }),
    } as Response);

    const cf = await getCounterfactual('req-123');
    expect(cf.status).toBe('ready');
    expect(cf.raw_changes).toBeDefined();
  });
});
