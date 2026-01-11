import React from 'react';
import { AnalysisResult, FeedbackItem, Insight, GuidanceStep, HandwritingAnalysis, OwnershipContext } from '../types';

// Compact Sub-components for Chat Stream

const ScoreSummary: React.FC<{ score: AnalysisResult['score'] }> = ({ score }) => {
  if (!score) return null;
  return (
    <div className="bg-brand-card/50 border border-brand-border/50 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-bold text-brand-teal uppercase tracking-wider mb-1">Assessment</div>
        <div className="text-white font-serif font-medium leading-tight">{score.label}</div>
      </div>
      <div className="bg-brand-surface rounded-lg h-12 w-12 flex items-center justify-center border border-brand-border text-white font-bold text-lg shrink-0">
        {score.value}
      </div>
    </div>
  );
};

const HandwritingCard: React.FC<{ handwriting?: HandwritingAnalysis }> = ({ handwriting }) => {
  if (!handwriting) return null;
  return (
    <div className="bg-brand-card/30 border border-brand-border/30 rounded-xl p-3 mb-4 flex items-start gap-3">
       <div className="mt-1 text-brand-muted">
         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
       </div>
       <div>
         <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-0.5">Handwriting & Layout</div>
         <p className="text-xs text-brand-text opacity-90 leading-relaxed">{handwriting.feedback}</p>
       </div>
    </div>
  );
};

const FeedbackList: React.FC<{ items: FeedbackItem[] }> = ({ items }) => {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className={`p-3 rounded-lg border text-sm ${item.type === 'strength' ? 'border-brand-teal/20 bg-brand-teal/5' : item.type === 'gap' ? 'border-brand-amber/20 bg-brand-amber/5' : 'border-brand-border/30 bg-brand-surface'}`}>
          <div className="flex items-center gap-2 mb-1">
             <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${item.type === 'strength' ? 'bg-brand-teal text-brand-bg' : item.type === 'neutral' ? 'bg-brand-muted text-brand-bg' : 'bg-brand-amber text-brand-bg'}`}>
               {item.type}
             </span>
          </div>
          <p className="text-brand-text opacity-90">{item.text}</p>
        </div>
      ))}
    </div>
  );
};

const InsightsList: React.FC<{ insights: Insight[] }> = ({ insights }) => {
  if (!insights || !Array.isArray(insights) || insights.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">Key Insights</h4>
      <div className="space-y-2">
        {insights.map((insight, idx) => (
          <div key={idx} className="bg-brand-surface border-l-2 border-brand-teal p-3 rounded-r-lg text-sm">
             <div className="font-semibold text-white mb-0.5">{insight.title}</div>
             <p className="text-brand-muted text-xs leading-relaxed">{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const GuidanceList: React.FC<{ steps: GuidanceStep[] }> = ({ steps }) => {
  if (!steps || !Array.isArray(steps) || steps.length === 0) return null;
  return (
    <div>
       <h4 className="text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">Recommended Path</h4>
       <div className="bg-brand-surface/30 rounded-lg border border-brand-border/30 divide-y divide-brand-border/30 text-sm">
        {steps.slice(0, 3).map((step, idx) => (
          <div key={idx} className="p-3 flex gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-surface text-brand-teal border border-brand-teal/20 flex items-center justify-center font-bold text-xs">
              {idx + 1}
            </div>
            <div>
              <div className="font-medium text-white">{step.step}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StudentHeader: React.FC<{ ownership?: OwnershipContext }> = ({ ownership }) => {
    // Only show header if explicitly in teacher mode AND we have student details
    if (!ownership || ownership.type !== 'teacher_uploaded_student_work' || !ownership.student?.name) {
        return null;
    }

    return (
        <div className="mb-4 px-1 flex flex-col">
            <div className="text-[10px] font-bold text-brand-teal uppercase tracking-wider">Analysis Summary</div>
            <div className="text-lg font-serif text-white flex items-center gap-2">
                {ownership.student.name}
                {ownership.student.class && (
                    <span className="text-sm text-brand-muted font-sans font-normal opacity-70">
                        ({ownership.student.class})
                    </span>
                )}
            </div>
        </div>
    )
}

export const AnalysisCard: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  if (!result) return null;
  return (
    <div className="w-full max-w-2xl bg-brand-card border border-brand-border rounded-2xl p-5 shadow-sm animate-fade-in my-2">
       
       <StudentHeader ownership={result.ownership} />

       {/* Topic/Subject Header */}
       <div className="flex items-center gap-2 mb-4 text-xs text-brand-muted">
         <span className="bg-brand-surface px-2 py-0.5 rounded border border-brand-border/50 text-white">{result.subject}</span>
         <span className="opacity-50">•</span>
         <span>{result.topic}</span>
       </div>

       <ScoreSummary score={result.score} />
       <HandwritingCard handwriting={result.handwriting} />
       <FeedbackList items={result.feedback} />
       
       <div className="grid md:grid-cols-2 gap-4">
         <InsightsList insights={result.insights} />
         <GuidanceList steps={result.guidance} />
       </div>
    </div>
  );
};

export const ResultsView = AnalysisCard;