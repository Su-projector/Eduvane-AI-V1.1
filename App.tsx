import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LandingPage } from './components/LandingPage';
import { AuthView } from './components/AuthViews';
import { MainApp } from './components/MainApp';

type ViewState = 'LANDING' | 'SIGN_UP' | 'SIGN_IN' | 'APP';

function App() {
  const [view, setView] = useState<ViewState>('LANDING');
  const [isGuest, setIsGuest] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  useEffect(() => {
    // Basic check for API key availability via env or injected global
    if (!process.env.API_KEY) {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
           window.aistudio.hasSelectedApiKey().then(has => {
               if (!has) setApiKeyMissing(true);
           });
        }
    }
  }, []);

  const handleApiKeySelect = async () => {
      if (window.aistudio) {
          await window.aistudio.openSelectKey();
          setApiKeyMissing(false);
      }
  };

  const navigateToSignUp = () => setView('SIGN_UP');
  const navigateToSignIn = () => setView('SIGN_IN');
  
  const startGuestSession = () => {
    setIsGuest(true);
    setView('APP');
  };

  const completeAuth = () => {
    setIsGuest(false);
    setView('APP');
  };

  const handleSignOut = () => {
    setIsGuest(false);
    setView('LANDING');
  };

  // 1. API Key Guard (Global)
  if (apiKeyMissing) {
      return (
          <Layout hideHeader>
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center pt-20">
                  <h2 className="text-2xl font-bold text-brand-blue mb-4">Access Required</h2>
                  <p className="text-slate-600 mb-6 max-w-md">
                      Eduvane AI requires a valid API key to function. Please select a key associated with a paid project to ensure full model capabilities.
                  </p>
                  <button onClick={handleApiKeySelect} className="bg-brand-blue text-white px-6 py-3 rounded-lg hover:bg-brand-blue/90">
                      Select API Key
                  </button>
                  <p className="mt-4 text-xs text-slate-400">
                      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-brand-teal">Billing Documentation</a>
                  </p>
              </div>
          </Layout>
      )
  }

  // 2. Routing Logic
  switch (view) {
    case 'APP':
      return <MainApp isGuest={isGuest} onSignOut={handleSignOut} />;
    
    case 'SIGN_UP':
      return (
        <AuthView 
          mode="SIGN_UP" 
          onComplete={completeAuth} 
          onSwitch={navigateToSignIn}
          onBack={handleSignOut} 
        />
      );

    case 'SIGN_IN':
      return (
        <AuthView 
          mode="SIGN_IN" 
          onComplete={completeAuth} 
          onSwitch={navigateToSignUp}
          onBack={handleSignOut} 
        />
      );

    case 'LANDING':
    default:
      return (
        <LandingPage 
          onSignUp={navigateToSignUp}
          onSignIn={navigateToSignIn}
          onGuestAccess={startGuestSession}
        />
      );
  }
}

export default App;