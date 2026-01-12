import React from 'react';
import { Logo } from './Logo';

interface LayoutProps {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  hideHeader?: boolean;
  mode?: 'marketing' | 'app';
  onMenuClick?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  headerAction, 
  hideHeader = false, 
  mode = 'marketing',
  onMenuClick 
}) => {
  const isApp = mode === 'app';

  return (
    <div className={`bg-brand-bg text-brand-text font-sans selection:bg-brand-teal selection:text-brand-bg flex flex-col ${isApp ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      {/* Header */}
      {!hideHeader && (
        <header className={`z-50 bg-brand-bg/80 backdrop-blur-md border-b border-brand-border/50 h-16 flex items-center justify-between px-4 md:px-6 flex-none ${isApp ? '' : 'sticky top-0'}`}>
            <div className="flex items-center gap-3">
                {/* Mobile Menu Button (App Mode Only) */}
                {isApp && onMenuClick && (
                   <button onClick={onMenuClick} className="md:hidden text-brand-muted hover:text-white mr-2">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                   </button>
                )}
                {/* Centralized Logo */}
                <div className="flex items-center gap-2">
                   <div className="text-brand-teal">
                      <Logo className="w-6 h-6" />
                   </div>
                   <span className="font-semibold text-lg tracking-tight text-white font-serif hidden md:block">Eduvane AI</span>
                </div>
            </div>
            <div className="text-sm font-medium text-brand-muted">
                {headerAction || "Standalone MVP"}
            </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-grow w-full mx-auto ${isApp ? 'flex flex-col overflow-hidden relative' : 'max-w-5xl p-6 md:p-12'}`}>
        {children}
      </main>

      {/* Footer - Marketing Only */}
      {!isApp && (
        <footer className="py-12 text-center text-brand-muted text-sm border-t border-brand-border/30 mt-auto bg-brand-bg flex-none">
          <p>© {new Date().getFullYear()} Eduvane AI. Detova Labs.</p>
          <p className="mt-2 text-xs opacity-60">Turning student work into learning intelligence.</p>
        </footer>
      )}
    </div>
  );
};