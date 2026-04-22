import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const SKIP_AUTH_KEY = 'indigo_skip_auth';

const LoginScreen: React.FC = () => {
  const { signInWithGoogle, firebaseProjectId } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const projectId = firebaseProjectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || null;
  const hostname  = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const handleSignIn = async () => {
    setIsLoading(true);
    setErrorCode(null);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const code = e?.code as string | undefined;
      setErrorCode(code || null);
      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in cancelled.');
      } else {
        setErrorMsg(e?.message || 'Sign-in failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(SKIP_AUTH_KEY, 'true');
    // Force a page reload so the AuthGate re-evaluates the skip flag
    window.location.reload();
  };

  const isUnauthorizedDomain = errorCode === 'auth/unauthorized-domain';

  const consoleLink = projectId
    ? `https://console.firebase.google.com/project/${projectId}/authentication/settings`
    : 'https://console.firebase.google.com';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / name */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
            <img src="/indigo-icon.png" alt="indigo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Indigo</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your personal AI companion</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to access your data and cloud sync.</p>

          {/* Generic error */}
          {errorMsg && !isUnauthorizedDomain && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Unauthorized domain — detailed fix instructions */}
          {isUnauthorizedDomain && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-2">
              <p className="font-semibold">Domain not authorized in Firebase</p>
              <p>Add this domain to your Firebase project's authorized list:</p>
              <div className="font-mono bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 text-xs break-all">
                {hostname}
              </div>
              {projectId && (
                <p className="text-xs">
                  Firebase Project ID: <span className="font-mono">{projectId}</span>
                </p>
              )}
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open the <a href={consoleLink} target="_blank" rel="noreferrer" className="underline font-medium">Firebase Console{projectId ? ` → ${projectId}` : ''}</a></li>
                <li>Go to <strong>Authentication → Settings → Authorized domains</strong></li>
                <li>Click <strong>Add domain</strong> and enter <span className="font-mono">{hostname}</span></li>
                <li>Return here and try signing in again</li>
              </ol>
              <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                Can't access Firebase Console right now?{' '}
                <button onClick={handleSkip} className="underline font-medium">
                  Continue without signing in
                </button>{' '}
                to reach Settings and check your Firebase config.
              </p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              /* Google "G" logo */
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {isLoading ? 'Signing in…' : 'Sign in with Google'}
          </button>

          {!isUnauthorizedDomain && (
            <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
              <button onClick={handleSkip} className="underline hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Continue without signing in
              </button>
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Your data is stored locally on this device. Sign in to enable cloud backup and restore.
        </p>
      </div>
    </div>
  );
};

export { SKIP_AUTH_KEY };
export default LoginScreen;
