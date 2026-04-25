import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ChatProvider } from './context/ChatContext';
import { useApp } from './context/AppContext';
import Layout from './components/Layout';
import ChatScreen from './screens/ChatScreen';
import HistoryScreen from './screens/HistoryScreen';
import AIProfileScreen from './screens/AIProfileScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import MemoryScreen from './screens/MemoryScreen';
import GalleryScreen from './screens/GalleryScreen';
import ImageGeneratorScreen from './screens/ImageGeneratorScreen';
import GeminiImageScreen from './screens/GeminiImageScreen';
import JournalScreen from './screens/JournalScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen, { SKIP_AUTH_KEY } from './screens/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import MobileDebugger from './components/MobileDebugger';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, authLoading } = useApp();
  const [skipped, setSkipped] = useState(() => localStorage.getItem(SKIP_AUTH_KEY) === 'true');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  // Not signed in and didn't skip → show login screen
  if (!currentUser && !skipped) {
    return <LoginScreen />;
  }

  const handleGoToLogin = () => {
    localStorage.removeItem(SKIP_AUTH_KEY);
    setSkipped(false);
  };

  return (
    <>
      {/* "Skipped auth" banner — shown until signed in or dismissed */}
      {!currentUser && skipped && !bannerDismissed && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 bg-amber-500 text-white text-xs px-4 py-2">
          <span>You're not signed in — cloud backup &amp; sync are disabled.</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={handleGoToLogin} className="font-semibold underline">
              Sign in
            </button>
            <button onClick={() => setBannerDismissed(true)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        </div>
      )}
      {children}
    </>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ChatProvider>
          <AuthGate>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={<ChatScreen />} />
                  <Route path="/history" element={<HistoryScreen />} />
                  <Route path="/ai-profile" element={<AIProfileScreen />} />
                  <Route path="/user-profile" element={<UserProfileScreen />} />
                  <Route path="/memory" element={<MemoryScreen />} />
                  <Route path="/gallery" element={<GalleryScreen />} />
                  <Route path="/image-generator" element={<ImageGeneratorScreen />} />
                  <Route path="/gemini-image" element={<GeminiImageScreen />} />
                  <Route path="/journal" element={<JournalScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                  <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
              </Layout>
              <MobileDebugger />
            </Router>
          </AuthGate>
        </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
};

export default App;
