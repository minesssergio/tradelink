import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { FilterBar } from '../components/FilterBar';
import { FilterProvider } from '../context/FilterContext';

// Pages where the global account/date filters don't apply
const UNFILTERED_ROUTES = ['/settings', '/journal', '/ai'];

export const DashboardLayout: React.FC = () => {
  const { pathname } = useLocation();
  const showFilters = !UNFILTERED_ROUTES.some(r => pathname.startsWith(r));

  return (
    <FilterProvider>
      <div className="app-container animate-fade-in">
        <Sidebar />
        <main className="main-content">
          {showFilters && <FilterBar />}
          <Outlet />
        </main>
      </div>
    </FilterProvider>
  );
};
