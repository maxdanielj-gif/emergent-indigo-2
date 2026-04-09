import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, User, Brain, Image as ImageIcon, Book, Settings, Camera, Menu, X, BookOpen, History as HistoryIcon, RefreshCw, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ToastContainer from './ToastContainer';
import { useApp } from '../context/AppContext';
import ThemeToggle from './ThemeToggle';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isSyncing } = useApp();

  const navItems = [
    { path: '/chat', icon: MessageSquare, label: 'Chat' },
    { path: '/history', icon: HistoryIcon, label: 'History' },
    { path: '/ai-profile', icon: Brain, label: 'AI Persona' },
    { path: '/user-profile', icon: User, label: 'User Profile' },
    { path: '/memory', icon: Book, label: 'Memory' },
    { path: '/gallery', icon: ImageIcon, label: 'Gallery' },
    { path: '/image-generator', icon: Camera, label: 'Generate Image' },
    { path: '/journal', icon: BookOpen, label: 'Journal' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const toggleMenu = () => {
    try {
      setIsMenuOpen(!isMenuOpen);
    } catch (e) {
      console.error("Error toggling menu:", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-indigo-900 dark:text-indigo-50 font-sans">
      <ToastContainer />
      {/* Header with Hamburger */}
      <header className="bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-50 p-4 flex items-center justify-between shadow-md z-20 border-b border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center space-x-3">
          <button onClick={toggleMenu} className="p-2 rounded-md hover:bg-indigo-600/20 focus:outline-none">
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <h1 className="text-xl font-bold tracking-wide lowercase">indigo AI</h1>
          {isSyncing && (
            <div className="flex items-center ml-4 px-2 py-1 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Syncing
            </div>
          )}
        </div>
        <ThemeToggle />
      </header>
      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Navigation Drawer (Hamburger Menu) */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                className="absolute inset-0 bg-black z-10"
              />
              
              {/* Drawer */}
              <motion.nav
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute top-0 left-0 bottom-0 w-64 bg-indigo-50 dark:bg-indigo-950 shadow-xl z-20 flex flex-col border-r border-indigo-200 dark:border-indigo-800"
              >
                <div className="flex-1 overflow-y-auto py-4">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMenuOpen(false)}
                      className={`flex items-center px-6 py-3 transition-colors ${
                        location.pathname === item.path
                          ? 'bg-indigo-600/10 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-r-4 border-indigo-600 dark:border-indigo-500'
                          : 'text-indigo-900 dark:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-900 hover:text-indigo-600 dark:hover:text-indigo-400'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 mr-3 ${location.pathname === item.path ? 'text-indigo-600 dark:text-indigo-400' : 'text-indigo-900 dark:text-indigo-100'}`} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
                <div className="p-4 border-t border-indigo-200 dark:border-indigo-800 text-xs text-center text-indigo-700 dark:text-indigo-300">
                  v1.0.0
                </div>
              </motion.nav>
            </>
          )}
        </AnimatePresence>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-transparent w-full h-full">
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
