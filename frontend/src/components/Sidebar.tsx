import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity, LayoutDashboard, List, Calendar as CalendarIcon,
  BookOpen, BarChart2, MessageSquare, Download, Plus,
  Settings, LogOut, ChevronDown, ChevronRight, Wallet, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user, signOut } = useAuth();
  const [journalOpen, setJournalOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(true);

  return (
    <aside className="sidebar" style={{ width: '260px', overflowY: 'auto' }}>
      <div className="brand" style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
        <Activity className="brand-icon" size={28} />
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Tradelink</span>
      </div>

      <nav className="nav-links" style={{ gap: '0.25rem', padding: '0 0.75rem' }}>
        <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
          <LayoutDashboard size={18} />
          <span>Overview</span>
        </NavLink>
        
        <NavLink to="/trades" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <List size={18} />
          <span>Trades</span>
        </NavLink>
        
        <NavLink to="/positions" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Wallet size={18} />
          <span>Positions</span>
        </NavLink>

        <NavLink to="/transactions" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <FileText size={18} />
          <span>Transactions</span>
        </NavLink>

        <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <CalendarIcon size={18} />
          <span>Calendar</span>
        </NavLink>
        
        {/* Journal Accordion */}
        <div className="nav-accordion">
          <button className="nav-link w-full text-left flex justify-between items-center" onClick={() => setJournalOpen(!journalOpen)}>
            <div className="flex items-center gap-3">
              <BookOpen size={18} />
              <span>Journal</span>
            </div>
            {journalOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {journalOpen && (
            <div className="nav-sublinks" style={{ paddingLeft: '2.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
              <NavLink to="/journal/notes" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Notes</NavLink>
              <NavLink to="/journal/plans" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Trade/Day Plans</NavLink>
            </div>
          )}
        </div>

        {/* Reports Accordion */}
        <div className="nav-accordion mt-2">
          <button className="nav-link w-full text-left flex justify-between items-center" onClick={() => setReportsOpen(!reportsOpen)}>
            <div className="flex items-center gap-3">
              <BarChart2 size={18} />
              <span>Reports</span>
            </div>
            {reportsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {reportsOpen && (
            <div className="nav-sublinks" style={{ paddingLeft: '2.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
              <NavLink to="/reports/equity" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Equity Curve</NavLink>
              <NavLink to="/reports/statistics" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Overall Statistics</NavLink>
              <NavLink to="/reports/pnl" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Profit & Loss Charts</NavLink>
              <NavLink to="/reports/winrate" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Win-Rate Charts</NavLink>
              <NavLink to="/reports/tags" className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'active' : ''}`}>Tags</NavLink>
            </div>
          )}
        </div>

        <NavLink to="/ai" className={({ isActive }) => `nav-link mt-2 ${isActive ? 'active' : ''}`}>
          <MessageSquare size={18} />
          <span>AI Q&A</span>
        </NavLink>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', padding: '0 0.5rem' }}>
          <button className="btn btn-glass" style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}>
            <Download size={16} /> Import
          </button>
          <button className="btn btn-glass" style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}>
            <Plus size={16} /> Add Trade
          </button>
        </div>

        <div style={{ flex: 1, minHeight: '2rem' }} />
        
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="user-profile" style={{ marginTop: 'auto' }}>
        <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '0.9rem' }}>
          {user?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {user?.email}
          </div>
        </div>
        <button onClick={signOut} className="btn" style={{ padding: '0.4rem', background: 'transparent', color: 'var(--text-muted)' }} title="Sign Out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
