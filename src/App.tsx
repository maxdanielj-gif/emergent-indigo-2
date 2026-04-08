import React from 'react';
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
import JournalScreen from './screens/JournalScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import MobileDebugger from './components/MobileDebugger';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, authLoading } = useApp();

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

  if (!currentUser) {
    return <LoginScreen />;
  }

  return <>{children}</>;
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
