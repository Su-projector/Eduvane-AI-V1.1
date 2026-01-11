import React from 'react';
import { AnalysisPhase } from '../types';

interface OrchestratorDisplayProps {
  phase: AnalysisPhase;
}

export const OrchestratorDisplay: React.FC<OrchestratorDisplayProps> = ({ phase }) => {
  if (phase === AnalysisPhase.IDLE || phase === AnalysisPhase.COMPLETE || phase === AnalysisPhase.ERROR) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-transparent w-fit my-2">
        <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 bg-brand-teal rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
            <div className="w-1.5 h-1.5 bg-brand-teal rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
            <div className="w-1.5 h-1.5 bg-brand-teal rounded-full animate-pulse" style={{ animationDelay: '0.6s' }}></div>
        </div>
    </div>
  );
};