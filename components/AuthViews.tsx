import React, { useState } from 'react';
import { Layout } from './Layout';
import { UserRole } from '../types';
import { saveUserProfile, getUserProfile } from '../services/persistenceService';

interface AuthProps {
  mode: 'SIGN_IN' | 'SIGN_UP';
  onComplete: () => void;
  onSwitch: () => void;
  onBack: () => void;
}

export const AuthView: React.FC<AuthProps> = ({ mode, onComplete, onSwitch, onBack }) => {
  const isSignUp = mode === 'SIGN_UP';
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp && selectedRole) {
        saveUserProfile({ name, role: selectedRole });
    }
    // For Sign In, we assume successful auth matches existing profile
    setTimeout(onComplete, 800);
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    
    // Simulate Network Delay & Google OAuth Response
    setTimeout(() => {
        // Mocked Google Identity Data
        const googleUser = {
            given_name: "Alex",
            family_name: "Rivera",
            email: "alex.rivera@example.com",
            sub: "google-oauth-mock-id-8823"
        };
        
        let roleToSave = selectedRole;
        
        // Strategy: 
        // 1. If Sign Up, we use selectedRole (if any).
        // 2. If Sign In, we try to preserve existing role if on same device.
        // 3. If no role is found (New device + Sign In via Google), role is undefined 
        //    and Orchestrator will ask "Are you a Teacher or Student?" later.
        
        if (!isSignUp) {
            const existing = getUserProfile();
            if (existing?.role) roleToSave = existing.role;
        }

        saveUserProfile({
            name: `${googleUser.given_name} ${googleUser.family_name}`,
            email: googleUser.email,
            googleId: googleUser.sub,
            role: roleToSave || undefined
        });

        setIsLoading(false);
        onComplete();
    }, 1000);
  };

  return (
    <Layout headerAction={<button onClick={onBack} className="text-sm text-brand-muted hover:text-white">← Back</button>}>
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto">
        <div className="w-full bg-brand-card p-8 rounded-2xl shadow-xl border border-brand-border/50">
          <h2 className="text-2xl font-serif text-white mb-2">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-brand-muted mb-8 text-sm">
            {isSignUp 
              ? 'Save your progress and track learning over time.' 
              : 'Sign in to access your learning history.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Name Input (Sign Up Only) */}
            {isSignUp && (
              <div className="animate-fade-in">
                <label className="block text-xs font-medium text-brand-muted uppercase tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  required 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-brand-bg border border-brand-border text-white focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal outline-none transition-all placeholder-brand-muted/30"
                  placeholder="Jane Doe"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-brand-muted uppercase tracking-wider mb-1">Email</label>
              <input 
                type="email" 
                required 
                className="w-full px-4 py-3 rounded-lg bg-brand-bg border border-brand-border text-white focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal outline-none transition-all placeholder-brand-muted/30"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-muted uppercase tracking-wider mb-1">Password</label>
              <input 
                type="password" 
                required 
                className="w-full px-4 py-3 rounded-lg bg-brand-bg border border-brand-border text-white focus:ring-2 focus:ring-brand-teal/50 focus:border-brand-teal outline-none transition-all placeholder-brand-muted/30"
                placeholder="••••••••"
              />
            </div>
            
            {/* Role Selection (Sign Up Only) */}
            {isSignUp && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-xs font-medium text-brand-muted uppercase tracking-wider mb-2">
                  I am a...
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('TEACHER')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedRole === 'TEACHER' 
                        ? 'bg-brand-teal/10 border-brand-teal text-white ring-1 ring-brand-teal' 
                        : 'bg-brand-bg border-brand-border text-brand-muted hover:border-brand-muted'
                    }`}
                  >
                    <div className="font-medium text-sm mb-0.5">Teacher</div>
                    <div className="text-[10px] opacity-70 leading-tight">Review and analyze student work</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('STUDENT')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedRole === 'STUDENT' 
                        ? 'bg-brand-teal/10 border-brand-teal text-white ring-1 ring-brand-teal' 
                        : 'bg-brand-bg border-brand-border text-brand-muted hover:border-brand-muted'
                    }`}
                  >
                    <div className="font-medium text-sm mb-0.5">Student</div>
                    <div className="text-[10px] opacity-70 leading-tight">Practice and receive feedback</div>
                  </button>
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={isSignUp && (!selectedRole || !name)}
              className="w-full bg-brand-surface border border-brand-border/50 text-white py-3 rounded-lg font-medium mt-6 hover:bg-brand-border transition-colors hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          
          {/* Google Sign In Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-brand-border/50"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-brand-card px-2 text-brand-muted">Or continue with</span>
            </div>
          </div>

          {/* Google Button */}
          <button 
             onClick={handleGoogleSignIn}
             disabled={isLoading}
             className="w-full bg-white text-gray-900 py-3 rounded-lg font-medium flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-70"
          >
             {isLoading ? (
                 <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
             ) : (
                <>
                 <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                 </svg>
                 Sign {isSignUp ? 'up' : 'in'} with Google
                </>
             )}
          </button>

          <div className="mt-6 text-center text-sm text-brand-muted">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button onClick={onSwitch} className="text-brand-teal hover:text-white transition-colors font-medium">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};