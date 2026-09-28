import React, { useEffect, useState } from 'react';
import { Layers, Activity, Satellite, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface HealthStatus {
  status: string;
  service: string;
  stage: string;
  timestamp?: string;
}

export const Header: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthStatus) => {
        setHealth(data);
        setHealthLoading(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthLoading(false);
      });
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap select-none">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded bg-slate-900 text-white font-semibold shadow-xs shrink-0">
          <Satellite className="w-4 h-4 text-blue-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold tracking-tight text-slate-900">SatQuery AI</h1>
            <span className="text-[11px] font-medium uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
              SIH26167 · ISRO
            </span>
            <span className="hidden md:inline text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
              Stage 1 Foundation
            </span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 font-normal">
            Interactive vision-language assistant for multimodal remote-sensing image analysis
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 text-xs flex-wrap justify-end">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-medium">GIS Workstation</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500">API Health:</span>
          {healthLoading ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
              checking...
            </span>
          ) : health && health.status === 'ok' ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Connected (200 OK)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
              <AlertCircle className="w-3 h-3 text-amber-600" />
              Backend Standby
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
