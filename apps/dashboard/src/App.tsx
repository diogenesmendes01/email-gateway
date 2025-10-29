import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { KPIsPage } from './pages/KPIsPage';
import { EmailsPage } from './pages/EmailsPage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { ErrorBreakdownPage } from './pages/ErrorBreakdownPage';
import { SendEmailPage } from './pages/SendEmailPage';
import { DomainsPage } from './pages/DomainsPage'; // TASK-032
import { AdminPage } from './pages/AdminPage'; // TASK-035
import { RegisterPage } from './pages/RegisterPage'; // TASK-036
import { ProfilePage } from './pages/ProfilePage'; // TASK-037
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<KPIsPage />} />
              <Route path="emails" element={<EmailsPage />} />
              <Route path="emails/:id" element={<EmailDetailPage />} />
              <Route path="send" element={<SendEmailPage />} />
              <Route path="domains" element={<DomainsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="errors" element={<ErrorBreakdownPage />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;