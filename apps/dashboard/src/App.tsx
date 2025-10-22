import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { KPIsPage } from './pages/KPIsPage';
import { EmailsPage } from './pages/EmailsPage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { ErrorBreakdownPage } from './pages/ErrorBreakdownPage';
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
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<KPIsPage />} />
              <Route path="emails" element={<EmailsPage />} />
              <Route path="emails/:id" element={<EmailDetailPage />} />
              <Route path="errors" element={<ErrorBreakdownPage />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;