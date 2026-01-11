import React, { useState, useEffect } from 'react';
import { Layout } from './Layout';
import { HistoryItem, Submission } from '../types';
import { getHistory, getSubmissionById } from '../services/persistenceService';
import { Workspace } from './Workspace';
import { Sidebar } from './Sidebar';

interface MainAppProps {
  isGuest: boolean;
  onSignOut: () => void;
}

export const MainApp: React.FC<MainAppProps> = ({ isGuest, onSignOut }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Session State
  // We use a key to force re-mounting of Workspace when starting a new chat or loading history
  const [sessionKey, setSessionKey] = useState<string>(crypto.randomUUID());
  const [initialSubmission, setInitialSubmission] = useState<Submission | undefined>(undefined);

  const refreshHistory = () => {
    if (!isGuest) {
      setHistory(getHistory());
    } else {
      setHistory([]);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, [isGuest, sessionKey]); // Refresh history when session changes (e.g. after a save)

  const handleNewChat = () => {
    setInitialSubmission(undefined);
    setSessionKey(crypto.randomUUID());
  };

  const handleLoadHistory = (id: string) => {
    const submission = getSubmissionById(id);
    if (submission) {
        setInitialSubmission(submission);
        setSessionKey(crypto.randomUUID());
    }
  };

  return (
    <Layout 
      mode="app"
      onMenuClick={() => setSidebarOpen(true)}
      headerAction={
        <div className="flex items-center gap-4">
           {!isGuest && (
             <div className="hidden md:flex items-center gap-2 text-xs text-brand-muted bg-brand-surface/50 px-2 py-1 rounded border border-brand-border/30">
                <span className="w-2 h-2 bg-brand-teal rounded-full animate-pulse"></span>
                Standard Plan
             </div>
           )}
           <button onClick={onSignOut} className="text-sm text-brand-muted hover:text-white transition-colors">
             {isGuest ? 'Exit Guest' : 'Sign Out'}
           </button>
        </div>
      }
    >
      <div className="flex h-full w-full overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar 
          history={history}
          isOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelectHistory={handleLoadHistory}
        />

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col h-full min-w-0 relative bg-brand-bg">
          <Workspace 
            key={sessionKey} // Force reset on session change
            isGuest={isGuest} 
            initialSubmission={initialSubmission}
          />
        </div>
      </div>
    </Layout>
  );
};