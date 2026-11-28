import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { StudentManagementView } from './views/StudentManagementView';
import { AcademicPromotionView } from './views/AcademicPromotionView';
import { FeeManagementView } from './views/FeeManagementView';
import { ReportsView } from './views/ReportsView';
import { SettingsPlaceholderView } from './views/SettingsPlaceholderView';
import { NavigationTab, ISystemInfo, IDatabaseHealth, IAuthSession } from '../shared/types';
import { I18nProvider } from './context/I18nContext';

export const AppContent: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<IAuthSession | null>(null);
  const [hasUsers, setHasUsers] = useState<boolean>(true);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [systemInfo, setSystemInfo] = useState<ISystemInfo | null>(null);
  const [dbHealth, setDbHealth] = useState<IDatabaseHealth | null>(null);

  const refreshAuthState = useCallback(async () => {
    if (window.api) {
      try {
        const [userRes, hasUsersRes] = await Promise.all([
          window.api.getCurrentUser(),
          window.api.hasUsers()
        ]);
        if (userRes?.success) {
          setCurrentUser(userRes.data || null);
        }
        if (hasUsersRes?.success) {
          setHasUsers(Boolean(hasUsersRes.data));
        }
      } catch (err) {
        console.error('Failed to check auth state:', err);
      } finally {
        setIsAuthChecking(false);
      }
    } else {
      setIsAuthChecking(false);
    }
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    if (window.api && currentUser) {
      try {
        const [infoRes, healthRes] = await Promise.all([
          window.api.getSystemInfo(),
          window.api.getDatabaseHealth(),
        ]);
        if (infoRes?.success && infoRes.data) {
          setSystemInfo(infoRes.data);
        }
        if (healthRes?.success && healthRes.data) {
          setDbHealth(healthRes.data);
        }
      } catch (err) {
        console.error('Failed to load diagnostics:', err);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    refreshAuthState();
  }, [refreshAuthState]);

  useEffect(() => {
    if (currentUser) {
      refreshDiagnostics();
    }
  }, [currentUser, refreshDiagnostics]);

  // Prevent Staff from accessing settings tab
  useEffect(() => {
    if (currentUser && currentUser.role === 'Staff' && activeTab === 'settings') {
      setActiveTab('dashboard');
    }
  }, [currentUser, activeTab]);

  // Keyboard navigation shortcuts (Ctrl+1 through Ctrl+5)
  useEffect(() => {
    if (!currentUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('dashboard'); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('students'); }
        if (e.key === '3') { e.preventDefault(); setActiveTab('fees'); }
        if (e.key === '4') { e.preventDefault(); setActiveTab('reports'); }
        if (e.key === '5' && currentUser.role === 'Admin') { 
          e.preventDefault(); 
          setActiveTab('settings'); 
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  const handleLogout = async () => {
    if (window.api) {
      await window.api.logout();
    }
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-slate-400 select-none text-xs">
        Initializing CurtissSMS Secure Environment...
      </div>
    );
  }

  // Not authenticated: Show Login Screen or Initial Admin Setup
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setHasUsers(true);
        }}
        hasUsers={hasUsers}
        onRefreshHasUsers={refreshAuthState}
      />
    );
  }

  // Authenticated: Render Main Application Desktop Shell
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* Top Header / Titlebar */}
      <Header
        systemInfo={systemInfo}
        dbHealth={dbHealth}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          userRole={currentUser.role}
        />

        {/* Content View */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                systemInfo={systemInfo}
                dbHealth={dbHealth}
                onRefreshHealth={refreshDiagnostics}
              />
            )}
            {activeTab === 'students' && <StudentManagementView currentUser={currentUser} />}
            {activeTab === 'promotions' && <AcademicPromotionView currentUser={currentUser} />}
            {activeTab === 'fees' && <FeeManagementView currentUser={currentUser} />}
            {activeTab === 'reports' && <ReportsView currentUser={currentUser} />}
            {activeTab === 'settings' && currentUser.role === 'Admin' && (
              <SettingsPlaceholderView systemInfo={systemInfo} dbHealth={dbHealth} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

export default App;
