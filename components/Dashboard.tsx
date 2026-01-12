import React, { useRef } from 'react';
import { HistoryItem } from '../types';

interface DashboardProps {
  isGuest: boolean;
  history: HistoryItem[];
  onUploadSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateQuestions: () => void;
  onViewHistoryItem: (id: string) => void;
  onSignIn: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  isGuest,
  history,
  onUploadSelect,
  onGenerateQuestions,
  onViewHistoryItem,
  onSignIn
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-3xl mx-auto py-8 animate-fade-in">
      
      {/* 1. Top Orientation / Context Section */}
      <div className="mb-10 text-center md:text-left">
        {isGuest ? (
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-border/30 text-brand-muted border border-brand-border/50">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-amber"></span>
              Guest session
            </span>
            <p className="text-brand-muted text-lg font-light">
              You can analyze work and get feedback instantly. Progress won’t be saved.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center md:items-start gap-2">
            <h2 className="text-xl font-medium text-white">Welcome back.</h2>
            <p className="text-brand-muted text-lg font-light">
              Here’s where your learning left off.
            </p>
          </div>
        )}
      </div>

      {/* 2. Primary Action Zone (Shared) */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {/* Primary Card: Upload */}
        <button 
          onClick={handleUploadClick}
          className="group relative flex flex-col items-start p-6 rounded-2xl bg-brand-card border border-brand-border hover:border-brand-teal/50 hover:bg-brand-surface transition-all text-left shadow-sm hover:shadow-md"
        >
          <div className="mb-4 p-3 rounded-xl bg-brand-teal/10 text-brand-teal group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Upload work</h3>
          <p className="text-sm text-brand-muted mb-6 leading-relaxed">
            Upload a photo or PDF of your work to receive feedback and insights.
          </p>
          <span className="mt-auto text-sm font-medium text-brand-teal flex items-center gap-1">
            Upload
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </span>
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/png, image/jpeg, image/webp, application/pdf"
            onChange={onUploadSelect}
          />
        </button>

        {/* Secondary Card: Generate Questions */}
        <button 
          onClick={onGenerateQuestions}
          className="group relative flex flex-col items-start p-6 rounded-2xl bg-brand-card border border-brand-border hover:border-brand-text/30 hover:bg-brand-surface transition-all text-left shadow-sm hover:shadow-md"
        >
          <div className="mb-4 p-3 rounded-xl bg-brand-border/30 text-white group-hover:scale-110 transition-transform duration-300">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Generate practice questions</h3>
          <p className="text-sm text-brand-muted mb-6 leading-relaxed">
            Create focused questions to test your understanding.
          </p>
          <span className="mt-auto text-sm font-medium text-white flex items-center gap-1 opacity-80 group-hover:opacity-100">
            Generate questions
          </span>
        </button>
      </div>

      {/* 3. Continuity Section (Registered Only) */}
      {!isGuest && history.length > 0 && (
        <div className="mb-12 animate-fade-in">
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4 pl-1">Recent work</h3>
          <div className="space-y-3">
             {history.slice(0, 5).map((item) => (
               <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-brand-card/50 border border-brand-border/50 hover:bg-brand-card hover:border-brand-border transition-colors">
                  <div className="flex flex-col">
                     <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">{item.subject}</span>
                        <span className="text-xs text-brand-muted px-2 py-0.5 rounded bg-brand-bg border border-brand-border/30">{item.topic}</span>
                     </div>
                     <div className="text-xs text-brand-muted flex items-center gap-2">
                        <span>{new Date(item.date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-brand-teal/80">{item.scoreLabel}</span>
                     </div>
                  </div>
                  <button 
                    onClick={() => onViewHistoryItem(item.id)}
                    className="text-sm text-brand-muted hover:text-white px-3 py-2 rounded-lg hover:bg-brand-surface transition-colors"
                  >
                    View feedback
                  </button>
               </div>
             ))}
          </div>
          {/* Optional Progress Signal */}
          <div className="mt-4 pl-1 text-xs text-brand-muted opacity-60">
             You have analyzed {history.length} items. Keep building your understanding.
          </div>
        </div>
      )}

      {/* 4. Value Reminder (Guest Only) */}
      {isGuest && (
        <div className="text-center border-t border-brand-border/30 pt-8 mt-4">
          <p className="text-sm text-brand-muted">
            <button onClick={onSignIn} className="text-brand-teal hover:underline font-medium">Create a free account</button>
            {" "}to save your feedback and track learning over time.
          </p>
        </div>
      )}

      {/* 5. Utility Links (Registered Only - Low Prominence) */}
      {!isGuest && (
         <div className="flex gap-6 mt-12 pl-1 border-t border-brand-border/30 pt-8">
            <button className="text-sm text-brand-muted hover:text-white transition-colors">My Progress</button>
            <button className="text-sm text-brand-muted hover:text-white transition-colors">Settings</button>
         </div>
      )}
    </div>
  );
};