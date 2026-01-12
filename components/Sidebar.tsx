import React from 'react';
import { HistoryItem } from '../types';

interface SidebarProps {
  history: HistoryItem[];
  onNewChat: () => void;
  onSelectHistory: (id: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  history, 
  onNewChat, 
  onSelectHistory, 
  isOpen,
  onCloseMobile
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity md:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onCloseMobile}
      />

      {/* Sidebar Container */}
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-72 bg-brand-bg md:bg-brand-bg/50 
          border-r border-brand-border/30
          flex flex-col h-full
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* 1. New Workspace Action (Primary) */}
        <div className="p-4 pt-20 md:pt-4 flex-none">
          <button 
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-brand-surface hover:bg-brand-card border border-brand-border/50 hover:border-brand-teal/50 text-white rounded-xl transition-all group shadow-sm"
          >
            <div className="bg-brand-teal/10 p-1.5 rounded-lg text-brand-teal group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </div>
            <span className="font-medium text-sm">New Workspace</span>
          </button>
        </div>

        {/* 2. History List (Scrollable) */}
        <div className="flex-grow overflow-y-auto min-h-0 px-3 pb-4 custom-scrollbar">
          <div className="text-xs font-bold text-brand-muted uppercase tracking-wider px-3 mb-2 mt-2">Recent</div>
          
          <div className="space-y-1">
            {history.length === 0 ? (
               <div className="px-3 py-4 text-xs text-brand-muted opacity-50 italic">
                 No history yet.
               </div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectHistory(item.id);
                    onCloseMobile();
                  }}
                  className="w-full text-left p-3 rounded-lg hover:bg-brand-surface/50 text-brand-muted hover:text-white transition-colors group relative"
                >
                  <div className="text-sm font-medium truncate pr-4">{item.subject || "Untitled"}</div>
                  <div className="text-[10px] opacity-60 truncate">{item.topic || new Date(item.date).toLocaleDateString()}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 3. Bottom Profile/Meta Area (Optional) */}
        <div className="p-4 border-t border-brand-border/30 flex-none">
           <div className="text-[10px] text-brand-muted text-center opacity-40">
              Eduvane AI • v1.1
           </div>
        </div>
      </aside>
    </>
  );
};