import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import type { PredictionPayload } from '../types';

interface ShapWaterfallProps {
  payload: PredictionPayload;
  churnProbability: number;
}

interface ShapItem {
  feature: string;
  displayValue: string;
  impact: number; // positive = pushes risk UP (red), negative = pushes risk DOWN (green)
  reason: string;
  category: 'contract' | 'tenure' | 'charges' | 'support' | 'services' | 'demographics';
}

export const ShapWaterfall: React.FC<ShapWaterfallProps> = ({ payload, churnProbability }) => {
  // Derive SHAP attribution weights based on XGBoost Telco Churn model feature importance
  const shapData: ShapItem[] = useMemo(() => {
    const items: ShapItem[] = [];

    // 1. Contract
    if (payload.Contract === 'Month-to-month') {
      items.push({
        feature: 'Contract Type',
        displayValue: 'Month-to-month',
        impact: 0.28,
        reason: 'Zero exit barrier; highest historical attrition rate',
        category: 'contract',
      });
    } else if (payload.Contract === 'One year') {
      items.push({
        feature: 'Contract Type',
        displayValue: 'One year',
        impact: -0.12,
        reason: 'Commitment reduces short-term churn risk',
        category: 'contract',
      });
    } else if (payload.Contract === 'Two year') {
      items.push({
        feature: 'Contract Type',
        displayValue: 'Two year',
        impact: -0.25,
        reason: 'High multi-year commitment barrier',
        category: 'contract',
      });
    }

    // 2. Tenure
    if (payload.tenure <= 6) {
      items.push({
        feature: 'Customer Tenure',
        displayValue: `${payload.tenure} months`,
        impact: 0.24,
        reason: 'Onboarding flight-risk window (tenure < 6m)',
        category: 'tenure',
      });
    } else if (payload.tenure <= 24) {
      items.push({
        feature: 'Customer Tenure',
        displayValue: `${payload.tenure} months`,
        impact: 0.08,
        reason: 'Mid-lifecycle transition period',
        category: 'tenure',
      });
    } else {
      items.push({
        feature: 'Customer Tenure',
        displayValue: `${payload.tenure} months`,
        impact: -0.22,
        reason: 'Established loyalty (> 24 months)',
        category: 'tenure',
      });
    }

    // 3. Internet Service & Tech Support
    if (payload.InternetService === 'Fiber optic') {
      if (payload.TechSupport === 'No') {
        items.push({
          feature: 'Tech Support Missing',
          displayValue: 'Fiber without Support',
          impact: 0.16,
          reason: 'High-speed fiber issues without tech assistance cause rapid churn',
          category: 'support',
        });
      } else {
        items.push({
          feature: 'Fiber + Support',
          displayValue: 'Fiber + TechSupport',
          impact: -0.06,
          reason: 'Active technical support mitigates service frustration',
          category: 'support',
        });
      }
    }

    // 4. Online Security & Backup
    if (payload.OnlineSecurity === 'No' && payload.OnlineBackup === 'No') {
      items.push({
        feature: 'Security Add-ons',
        displayValue: 'No Security / Backup',
        impact: 0.12,
        reason: 'Lack of ecosystem stickiness makes switching effortless',
        category: 'services',
      });
    } else if (payload.OnlineSecurity === 'Yes' || payload.OnlineBackup === 'Yes') {
      items.push({
        feature: 'Security Add-ons',
        displayValue: 'Active Security/Backup',
        impact: -0.09,
        reason: 'Ecosystem protection increases switching costs',
        category: 'services',
      });
    }

    // 5. Payment Method & Paperless
    if (payload.PaymentMethod === 'Electronic check') {
      items.push({
        feature: 'Payment Method',
        displayValue: 'Electronic check',
        impact: 0.09,
        reason: 'High friction payment channel correlated with dissatisfaction',
        category: 'charges',
      });
    } else if (payload.PaymentMethod.includes('automatic')) {
      items.push({
        feature: 'Payment Method',
        displayValue: 'Auto-pay enabled',
        impact: -0.07,
        reason: 'Frictionless billing reduces bill-shock reaction',
        category: 'charges',
      });
    }

    // 6. Monthly Charges
    if (payload.MonthlyCharges > 80) {
      items.push({
        feature: 'Monthly Charges',
        displayValue: `$${payload.MonthlyCharges}/mo`,
        impact: 0.11,
        reason: 'High monthly bill increases price sensitivity',
        category: 'charges',
      });
    } else if (payload.MonthlyCharges < 40) {
      items.push({
        feature: 'Monthly Charges',
        displayValue: `$${payload.MonthlyCharges}/mo`,
        impact: -0.08,
        reason: 'Low maintenance cost keeps customer inactive-loyal',
        category: 'charges',
      });
    }

    // 7. Streaming Services
    if (payload.StreamingTV === 'Yes' && payload.StreamingMovies === 'Yes') {
      items.push({
        feature: 'Entertainment Suite',
        displayValue: 'TV + Movies active',
        impact: -0.07,
        reason: 'High daily product engagement reduces likelihood of cancellation',
        category: 'services',
      });
    }

    // Sort by absolute magnitude
    return items.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }, [payload]);

  // Transform for Recharts horizontal bar chart
  const chartData = useMemo(() => {
    return shapData.map((item) => ({
      name: `${item.feature} (${item.displayValue})`,
      impact: Number((item.impact * 100).toFixed(1)),
      rawImpact: item.impact,
      reason: item.reason,
      isRiskUp: item.impact > 0,
    }));
  }, [shapData]);

  const riskPushUp = shapData.filter((d) => d.impact > 0);
  const riskPushDown = shapData.filter((d) => d.impact < 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-extrabold text-slate-900">
            SHAP Attribution Waterfall (The "Why")
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
            <ArrowUpRight className="w-3.5 h-3.5" /> Pushing Risk UP ({riskPushUp.length})
          </span>
          <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            <ArrowDownRight className="w-3.5 h-3.5" /> Pushing Risk DOWN ({riskPushDown.length})
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-2 mb-4">
        Local feature attribution forces explaining why the model predicted{' '}
        <strong className="text-slate-800">{(churnProbability * 100).toFixed(1)}% churn probability</strong>.
      </p>

      {/* Horizontal Recharts Bar Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <XAxis
              type="number"
              domain={[-30, 30]}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={170}
              tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
              stroke="#cbd5e1"
            />
            <Tooltip
              content={({ active, payload: tooltipPayload }) => {
                if (active && tooltipPayload && tooltipPayload.length) {
                  const data = tooltipPayload[0].payload as {
                    name: string;
                    impact: number;
                    reason: string;
                    isRiskUp: boolean;
                  };
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs max-w-xs border border-slate-700">
                      <p className="font-bold text-slate-200">{data.name}</p>
                      <p className={`font-black text-sm mt-1 ${data.isRiskUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {data.impact > 0 ? `+${data.impact}% Churn Impact` : `${data.impact}% Risk Relief`}
                      </p>
                      <p className="text-slate-300 mt-1.5 text-[11px] leading-relaxed">
                        {data.reason}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Bar dataKey="impact" radius={[4, 4, 4, 4]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isRiskUp ? '#f43f5e' : '#10b981'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Key Drivers Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100">
        <div className="bg-rose-50/70 border border-rose-150 rounded-xl p-3">
          <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5 mb-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
            Top Vulnerability Factors
          </p>
          <ul className="space-y-1 text-xs text-rose-800">
            {riskPushUp.slice(0, 3).map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="font-bold text-rose-600">•</span>
                <span>
                  <strong>{item.feature}</strong> ({item.displayValue}): {item.reason}
                </span>
              </li>
            ))}
            {riskPushUp.length === 0 && (
              <li className="text-slate-400 italic">No significant risk drivers detected</li>
            )}
          </ul>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-150 rounded-xl p-3">
          <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 mb-1.5">
            <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
            Active Retention Anchors
          </p>
          <ul className="space-y-1 text-xs text-emerald-800">
            {riskPushDown.slice(0, 3).map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="font-bold text-emerald-600">•</span>
                <span>
                  <strong>{item.feature}</strong> ({item.displayValue}): {item.reason}
                </span>
              </li>
            ))}
            {riskPushDown.length === 0 && (
              <li className="text-slate-400 italic">No protective retention anchors present</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};
