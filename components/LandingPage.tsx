import React from 'react';
import { Layout } from './Layout';
import { Logo } from './Logo';

interface LandingPageProps {
  onSignUp: () => void;
  onSignIn: () => void;
  onGuestAccess: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignUp, onSignIn, onGuestAccess }) => {
  return (
    <Layout 
      headerAction={
        <button onClick={onSignIn} className="text-sm font-medium text-brand-muted hover:text-white transition-colors">
          Sign in
        </button>
      }
    >
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] py-12 text-center max-w-4xl mx-auto animate-fade-in-up">
        
        {/* Large Central Logo */}
        <div className="mb-10 text-brand-teal">
             <Logo className="w-16 h-16 mx-auto" />
        </div>

        {/* Primary Headline */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8 leading-[1.1]">
          Turning student work into <br className="hidden md:block" /> learning intelligence.
        </h1>

        {/* Supporting Copy */}
        <p className="text-lg md:text-xl text-brand-muted mb-12 max-w-2xl mx-auto leading-relaxed">
          Snap a photo of your work to get clear feedback, or generate targeted practice questions for any subject. No setup required.
        </p>

        {/* Action Area - Stacked Buttons */}
        <div className="flex flex-col gap-4 w-full max-w-xs mx-auto mb-8">
          {/* Get Started */}
          <button 
            onClick={onSignUp}
            className="group w-full bg-brand-surface hover:bg-brand-border text-white py-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border border-brand-border/50"
          >
            Get started
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>

          {/* Sign In */}
          <button 
             onClick={onSignIn}
             className="group w-full bg-brand-card/50 hover:bg-brand-card border border-brand-border/30 text-white py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
             <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
             Sign in
          </button>
        </div>

        {/* Guest Access Link */}
        <button 
            onClick={onGuestAccess}
            className="text-sm text-brand-muted hover:text-white transition-colors mb-20 font-medium"
        >
            Try without signing in
        </button>

        {/* Value Cards */}
        <div className="grid md:grid-cols-2 gap-6 w-full text-left">
           {/* Card 1 */}
           <div className="bg-brand-card border border-brand-border/50 p-8 rounded-2xl hover:border-brand-border transition-colors">
              <div className="text-brand-teal mb-4">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Learning from your work</h3>
              <p className="text-brand-muted leading-relaxed">
                Upload any assignment or test. Eduvane recognizes the subject automatically to provide scores and clear steps for improvement.
              </p>
           </div>
           
           {/* Card 2 */}
           <div className="bg-brand-card border border-brand-border/50 p-8 rounded-2xl hover:border-brand-border transition-colors">
              <div className="text-brand-teal mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Targeted practice</h3>
              <p className="text-brand-muted leading-relaxed">
                Create focused questions for any topic to test your understanding and sharpen your skills.
              </p>
           </div>
        </div>

      </div>
    </Layout>
  );
};