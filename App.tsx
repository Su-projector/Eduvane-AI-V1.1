import React, { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { AuthView } from './components/AuthViews';
import { MainApp } from './components/MainApp';

type ViewState = 'LANDING' | 'SIGN_UP' | 'SIGN_IN' | 'APP';

function App() {
  const [view, setView] = useState<ViewState>('LANDING');
  const [isGuest, setIsGuest] = useState(false);

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

  // Routing Logic
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