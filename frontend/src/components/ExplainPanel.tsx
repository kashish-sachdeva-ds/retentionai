import React from 'react';
import { Sparkles, Bot, ShieldAlert, CheckCircle2, ChevronRight } from 'lucide-react';
import type { PredictionPayload, PredictionResponse } from '../types';

interface ExplainPanelProps {
  payload: PredictionPayload;
  result: PredictionResponse;
}

export const ExplainPanel: React.FC<ExplainPanelProps> = ({ payload, result }) => {
  const prob = result.calibrated_churn_probability;
  const pct = (prob * 100).toFixed(1);

  // Generate deterministic domain-aware natural language summary based on features
  const generateNarrative = () => {
    const drivers: string[] = [];
    const anchors: string[] = [];

    // Contract
    if (payload.Contract === 'Month-to-month') {
      drivers.push('a month-to-month contract offering zero barrier to exit');
    } else {
      anchors.push(`a locked-in ${payload.Contract.toLowerCase()} agreement`);
    }

    // Tenure
    if (payload.tenure <= 4) {
      drivers.push(`fragile early tenure (${payload.tenure} months) in the high-attrition onboarding window`);
    } else if (payload.tenure >= 24) {
      anchors.push(`well-established customer relationship (${payload.tenure} months)`);
    }

    // Support / Addons
    if (payload.TechSupport === 'No' && payload.OnlineSecurity === 'No') {
      drivers.push('an absence of technical support or security ecosystem add-ons');
    } else if (payload.TechSupport === 'Yes' || payload.OnlineSecurity === 'Yes') {
      anchors.push('active security/support service attachments');
    }

    // Fiber / Monthly Charges
    if (payload.InternetService === 'Fiber optic' && payload.MonthlyCharges >= 75) {
      drivers.push(`premium fiber optic pricing ($${payload.MonthlyCharges}/mo) without value bundling`);
    }

    // Entertainment
    if (payload.StreamingTV === 'Yes' && payload.StreamingMovies === 'Yes') {
      anchors.push('daily multi-service entertainment engagement');
    }

    if (prob >= 0.6) {
      return {
        tone: 'critical',
        headline: `High Probability Attrition Risk (${pct}%)`,
        summary: `This account exhibits severe flight risk. The primary drivers are ${drivers.slice(0, 2).join(' alongside ')}.${drivers.length > 2 ? ` Furthermore, ${drivers[2]} compounds the vulnerability.` : ''} Without a targeted proactive intervention within 72 hours, attrition is statistically imminent.`,
        recommendation: `Deploy the recommended ${result.recommended_arm} intervention immediately to establish contract stability and service adhesion.`,
      };
    } else if (prob >= 0.2) {
      return {
        tone: 'moderate',
        headline: `Elevated Triage Risk (${pct}%)`,
        summary: `This customer demonstrates moderate sensitivity. While protected by ${anchors.length > 0 ? anchors[0] : 'core service usage'}, the risk profile is elevated by ${drivers.length > 0 ? drivers[0] : 'recent usage trends'}.`,
        recommendation: `Monitor billing interactions and consider proactive support onboarding before contract renewal.`,
      };
    } else {
      return {
        tone: 'safe',
        headline: `Strong Retention Anchor (${pct}%)`,
        summary: `This account is highly stable, anchored by ${anchors.slice(0, 2).join(' and ')}. Minimal intervention is required; focus outreach budget on higher-risk priority segments.`,
        recommendation: `Maintain existing service quality and use standard automated lifecycle engagement.`,
      };
    }
  };

  const narrative = generateNarrative();

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-md border border-indigo-900/40 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-indigo-900/60 relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/20 rounded-lg border border-indigo-400/30">
            <Bot className="w-4 h-4 text-indigo-300" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-200">
              Executive AI Synthesis
            </h3>
            <p className="text-[10px] text-indigo-400/80">
              Domain-Grounded Causal Reasoning Engine
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-400/30">
          <Sparkles className="w-3 h-3 text-indigo-300 animate-pulse" />
          Real-time Audit
        </span>
      </div>

      {/* Content */}
      <div className="mt-4 space-y-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            {narrative.tone === 'critical' ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <h4 className="text-sm font-extrabold text-white">
              {narrative.headline}
            </h4>
          </div>
          <p className="mt-1.5 text-xs text-indigo-100/90 leading-relaxed font-normal">
            {narrative.summary}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-xs flex items-start gap-2.5">
          <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <strong className="text-indigo-200 font-bold">Action Directive: </strong>
            <span className="text-slate-300">{narrative.recommendation}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
