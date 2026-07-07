import React from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Positions } from './pages/Positions';
import { Transactions } from './pages/Transactions';
import { Settings } from './pages/Settings';
import { PlaceholderPage } from './pages/PlaceholderPage';

// New Pages
import { TradesList } from './pages/TradesList';
import { Orders } from './pages/Orders';
import { AccountGrowth } from './pages/AccountGrowth';
import { OverallStatistics } from './pages/OverallStatistics';
import { EquityCurve } from './pages/EquityCurve';
import { ProfitLossCharts } from './pages/ProfitLossCharts';
import { WinRateCharts } from './pages/WinRateCharts';
import { CalendarView } from './pages/CalendarView';
import { JournalNotes } from './pages/JournalNotes';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  
  if (loading) return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="text-gradient">Loading...</div>
    </div>
  );
  
  if (!session) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  
  if (loading) return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="text-gradient">Loading...</div>
    </div>
  );
  
  if (session) return <Navigate to="/" replace />;
  
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="positions" element={<Positions />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="orders" element={<Orders />} />
        <Route path="trades" element={<TradesList />} />
        <Route path="settings" element={<Settings />} />
        
        {/* New TradesViz Routes */}
        <Route path="calendar" element={<CalendarView />} />
        <Route path="journal/notes" element={<JournalNotes />} />
        <Route path="journal/plans" element={<PlaceholderPage title="Trade / Day Plans" />} />
        <Route path="reports/equity" element={<EquityCurve />} />
        <Route path="reports/growth" element={<AccountGrowth />} />
        <Route path="reports/statistics" element={<OverallStatistics />} />
        <Route path="reports/pnl" element={<ProfitLossCharts />} />
        <Route path="reports/winrate" element={<WinRateCharts />} />
        <Route path="reports/tags" element={<PlaceholderPage title="Tags" />} />
        <Route path="ai" element={<PlaceholderPage title="AI Q&A" />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
