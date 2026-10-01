import { useState, useEffect, useRef } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './AdminPage.css';

export default function AdminPage({ onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(true);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showDeleteConfirmToast, setShowDeleteConfirmToast] = useState(false);
  const [clearingDb, setClearingDb] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const showToast = (content, type = 'info', icon = '✨') => {
    if (typeof content === 'string') {
      setToastMessage({ text: content, type, icon });
    } else {
      setToastMessage(content);
    }
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === (content.text || content) ? null : prev));
    }, 4500);
  };

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await presenceAPI.getAdminPresence();
      if (result.success) {
        setData(result);
        if (typeof result.isAttendanceOpen === 'boolean') {
          setIsAttendanceOpen(result.isAttendanceOpen);
        }
      } else {
        setError(result.message || 'Failed to load admin data');
      }
    } catch (err) {
      setError('Failed to connect to presence server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async () => {
    const targetStatus = !isAttendanceOpen;
    try {
      setTogglingAttendance(true);
      const res = await presenceAPI.toggleAttendance(targetStatus);
      if (res && res.success) {
        setIsAttendanceOpen(res.isOpen);
        showToast(
          res.isOpen ? 'Attendance is now OPEN for students' : 'Attendance is now CLOSED for students',
          res.isOpen ? 'success' : 'warning',
          res.isOpen ? '🟢' : '🔴'
        );
      } else {
        showToast('Failed to update attendance status', 'warning', '⚠️');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server to toggle attendance', 'error', '⚠️');
    } finally {
      setTogglingAttendance(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      setClearingDb(true);
      const res = await presenceAPI.clearDatabase();
      if (res && res.success) {
        setShowClearModal(false);
        setShowDeleteConfirmToast(false);
        await fetchAdminData();
        showToast(
          `Successfully cleared all ${res.deletedCount || 0} attendance records from the database!`,
          'danger-confirmed',
          '🗑️'
        );
      } else {
        alert(res?.message || 'Failed to clear database records.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server to clear database.');
    } finally {
      setClearingDb(false);
    }
  };



  const handleLogout = () => {
    if (confirm('Are you sure you want to logout from Admin Dashboard?')) {
      onLogout();
    }
  };

  const handleNavigateCheckin = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  const getInitials = (name) => {
    if (!name) return 'PX';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (loading && !data) {
    return (
      <div className="admin-loading-screen">
        <div className="spinner-large"></div>
        <p>Loading Admin Analytics Dashboard...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-error-screen">
        <div className="error-card">
          <h2>Connection Failure</h2>
          <p>{error}</p>
          <button onClick={fetchAdminData} className="btn-glow-primary">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const totalRegistered = data?.stats?.totalRegistered || 0;
  const totalPresent = data?.stats?.totalPresent || 0;
  const totalAbsent = data?.stats?.totalAbsent !== undefined
    ? data.stats.totalAbsent
    : Math.max(0, totalRegistered - totalPresent);
  const attendanceRate = totalRegistered > 0 ? Math.round((totalPresent / totalRegistered) * 100) : 0;

  const departments = Array.from(
    new Set((data?.allStudents || data?.presentStudents || []).map((s) => s.department).filter(Boolean))
  ).sort();

  const filteredStudents = (data?.presentStudents || []).filter((s) => {
    const query = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.name?.toLowerCase().includes(query) ||
      String(s.regno || '').toLowerCase().includes(query) ||
      (s.department && s.department.toLowerCase().includes(query)) ||
      (s.section && s.section.toLowerCase().includes(query)) ||
      (s.year && s.year.toLowerCase().includes(query));
    const matchesDept = selectedDepartment === 'all' || s.department === selectedDepartment;
    return matchesSearch && matchesDept;
  });

  const downloadCSV = (type = 'filtered') => {
    const presentStudents = data?.presentStudents || [];
    const allStudents = data?.allStudents || [];
    const dateStr = new Date().toISOString().split('T')[0];

    // Helper map of registered present students
    const presentMap = new Map();
    presentStudents.forEach((s) => {
      if (s.regno) {
        presentMap.set(String(s.regno).trim().toLowerCase(), s);
      }
    });

    let headers = [];
    let rows = [];
    let filename = `presencex_attendance_${dateStr}.csv`;
    let recordCount = 0;

    if (type === 'filtered') {
      if (!filteredStudents || filteredStudents.length === 0) {
        alert('No attendance records match your current filter to export.');
        return;
      }
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Year', 'Attendance Status', 'Check-in Time'];
      rows = filteredStudents.map((s, index) => [
        index + 1,
        `"${String(s.name || '').replace(/"/g, '""')}"`,
        `"${String(s.regno || '').replace(/"/g, '""')}"`,
        `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.year || 'N/A').replace(/"/g, '""')}"`,
        'PRESENT',
        `"${s.timestamp ? new Date(s.timestamp).toLocaleString().replace(/"/g, '""') : 'Recorded'}"`
      ]);
      filename = `presencex_filtered_attendance_${dateStr}.csv`;
      recordCount = filteredStudents.length;
    } else if (type === 'present') {
      if (!presentStudents || presentStudents.length === 0) {
        alert('No present students recorded yet.');
        return;
      }
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Year', 'Attendance Status', 'Check-in Time'];
      rows = presentStudents.map((s, index) => [
        index + 1,
        `"${String(s.name || '').replace(/"/g, '""')}"`,
        `"${String(s.regno || '').replace(/"/g, '""')}"`,
        `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.year || 'N/A').replace(/"/g, '""')}"`,
        'PRESENT',
        `"${s.timestamp ? new Date(s.timestamp).toLocaleString().replace(/"/g, '""') : 'Recorded'}"`
      ]);
      filename = `presencex_present_students_${dateStr}.csv`;
      recordCount = presentStudents.length;
    } else if (type === 'all') {
      if (!allStudents || allStudents.length === 0) {
        if (presentStudents.length === 0) {
          alert('No student records available.');
          return;
        }
        headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Year', 'Attendance Status', 'Check-in Time'];
        rows = presentStudents.map((s, index) => [
          index + 1,
          `"${String(s.name || '').replace(/"/g, '""')}"`,
          `"${String(s.regno || '').replace(/"/g, '""')}"`,
          `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
          `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
          `"${String(s.year || 'N/A').replace(/"/g, '""')}"`,
          'PRESENT',
          `"${s.timestamp ? new Date(s.timestamp).toLocaleString().replace(/"/g, '""') : 'Recorded'}"`
        ]);
        recordCount = presentStudents.length;
      } else {
        headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Year', 'Attendance Status', 'Check-in Time'];
        rows = allStudents.map((s, index) => {
          const queryKey = String(s.regno).trim().toLowerCase();
          const isPresent = presentMap.has(queryKey);
          const rec = isPresent ? presentMap.get(queryKey) : null;
          const timeStr = rec?.timestamp ? new Date(rec.timestamp).toLocaleString() : 'N/A';
          return [
            index + 1,
            `"${String(s.name || '').replace(/"/g, '""')}"`,
            `"${String(s.regno || '').replace(/"/g, '""')}"`,
            `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
            `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
            `"${String(s.year || 'N/A').replace(/"/g, '""')}"`,
            isPresent ? 'PRESENT' : 'ABSENT',
            `"${timeStr.replace(/"/g, '""')}"`
          ];
        });
        recordCount = allStudents.length;
      }
      filename = `presencex_master_attendance_report_${dateStr}.csv`;
    } else if (type === 'absent') {
      const absentStudents = allStudents.filter((s) => !presentMap.has(String(s.regno).trim().toLowerCase()));
      if (absentStudents.length === 0) {
        alert('All registered students have marked attendance! No absentees.');
        return;
      }
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Year', 'Attendance Status'];
      rows = absentStudents.map((s, index) => [
        index + 1,
        `"${String(s.name || '').replace(/"/g, '""')}"`,
        `"${String(s.regno || '').replace(/"/g, '""')}"`,
        `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.year || 'N/A').replace(/"/g, '""')}"`,
        'ABSENT'
      ]);
      filename = `presencex_absent_students_${dateStr}.csv`;
      recordCount = absentStudents.length;
    }

    // Prepend UTF-8 BOM for Microsoft Excel compatibility
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDropdownOpen(false);
    showToast(`✓ Downloaded ${recordCount} record${recordCount === 1 ? '' : 's'} to CSV!`);
  };

  const handleExportJSON = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const exportData = filteredStudents.map((s, index) => ({
      sno: index + 1,
      name: s.name,
      regno: s.regno,
      department: s.department || null,
      section: s.section || null,
      year: s.year || null,
      timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : null
    }));

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `presencex_attendance_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDropdownOpen(false);
    showToast(`✓ Exported ${filteredStudents.length} record(s) to JSON!`);
  };

  return (
    <div className="admin-dashboard-page">
      {/* Interactive Confirm Toast for Deleting Data */}
      {showDeleteConfirmToast && (
        <div className="admin-confirm-toast-banner" role="alertdialog" aria-live="assertive">
          <div className="confirm-toast-header">
            <div className="confirm-toast-icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div className="confirm-toast-body">
              <span className="confirm-toast-heading">Clear Attendance Data?</span>
              <span className="confirm-toast-subtitle">
                Permanently delete all <strong>{totalPresent}</strong> check-in records from MongoDB?
              </span>
            </div>
          </div>
          <div className="confirm-toast-actions-row">
            <button
              onClick={() => setShowDeleteConfirmToast(false)}
              disabled={clearingDb}
              className="confirm-toast-cancel-btn"
            >
              Cancel
            </button>
            <button
              onClick={handleClearDatabase}
              disabled={clearingDb}
              className="confirm-toast-delete-btn"
            >
              {clearingDb ? (
                <span className="btn-flex-center">
                  <span className="spinner-small"></span>
                  Clearing...
                </span>
              ) : (
                'Confirm Delete'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success / Status Notification Toast */}
      {toastMessage && (
        <div 
          className={`admin-toast-banner ${toastMessage.type ? `toast-${toastMessage.type}` : ''}`} 
          role="status" 
          aria-live="polite"
        >
          <span className="toast-icon">{toastMessage.icon || '✨'}</span>
          <div className="toast-content-wrapper">
            <span className="toast-text">{toastMessage.text || toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="toast-close-btn" aria-label="Close notification">✕</button>
        </div>
      )}

      {/* Navigation Header Bar */}
      <nav className="admin-nav-bar">
        <div className="nav-brand">
          <div className="brand-icon-wrapper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="nav-title-group">
            <span className="brand-title">Presence<span className="brand-highlight">X</span></span>
            <span className="nav-powered-line">Powered by TARA</span>
          </div>
          <span className="admin-pill-badge">ADMIN DASHBOARD</span>
        </div>

        <div className="nav-controls">
          <button onClick={handleNavigateCheckin} className="nav-btn-secondary" title="View Student form">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            Student Mode
          </button>

          <button onClick={handleLogout} className="nav-btn-danger">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Body */}
      <main className="admin-dashboard-body">
        {/* Top Header Summary */}
        <div className="dashboard-title-row">
          <div>
            <h1 className="dash-title">Attendance Overview</h1>
            <p className="dash-subtitle">Real-time check-in metrics and participant tracking</p>
          </div>

          <div className="header-actions-group">
            {/* Turn On/Off Attendance Button */}
            <button
              onClick={handleToggleAttendance}
              disabled={togglingAttendance}
              className={`attendance-toggle-btn ${isAttendanceOpen ? 'status-open' : 'status-closed'}`}
              title={isAttendanceOpen ? "Click to Close Attendance for students" : "Click to Open Attendance for students"}
            >
              <span className={`toggle-indicator-dot ${isAttendanceOpen ? 'dot-open' : 'dot-closed'}`}></span>
              <span className="toggle-btn-text">
                {togglingAttendance 
                  ? 'Updating...' 
                  : isAttendanceOpen 
                    ? 'Attendance: OPEN' 
                    : 'Attendance: CLOSED'}
              </span>
              <span className="toggle-switch-track">
                <span className={`toggle-switch-thumb ${isAttendanceOpen ? 'thumb-open' : 'thumb-closed'}`}></span>
              </span>
            </button>

            {/* Clear Database Button - Triggers Confirm Toast */}
            <button
              onClick={() => setShowDeleteConfirmToast(true)}
              className="clear-db-btn"
              title="Clear all recorded check-ins from database"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span>Clear Data</span>
            </button>

            <button
              onClick={() => downloadCSV('all')}
              className="download-csv-btn-primary"
              title="Download full master attendance report (CSV)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download CSV</span>
            </button>

            <button 
              onClick={fetchAdminData} 
              disabled={loading} 
              className="refresh-btn-glow"
              title="Refresh data from server"
            >
              <svg 
                className={loading ? 'spin-icon' : ''} 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5"
              >
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Analytics Cards Grid */}
        <div className="stats-grid">
          <div className="stat-card card-blue">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-indigo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </span>
              <span className="stat-label">Total Registered</span>
            </div>
            <div className="stat-number">{totalRegistered}</div>
            <span className="stat-foot-text">Total enrolled participants</span>
          </div>

          <div className="stat-card card-emerald">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-emerald">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </span>
              <span className="stat-label">Students Present</span>
            </div>
            <div className="stat-number text-emerald">{totalPresent}</div>
            <div className={`live-status-chip ${isAttendanceOpen ? 'chip-open' : 'chip-closed'}`}>
              <span className={isAttendanceOpen ? 'dot-green' : 'dot-red'}></span>
              {isAttendanceOpen ? 'Attendance Open' : 'Attendance Closed'}
            </div>
          </div>

          <div className="stat-card card-amber">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-amber">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </span>
              <span className="stat-label">Absentees</span>
            </div>
            <div className="stat-number text-amber">{totalAbsent}</div>
            <span className="stat-foot-text">Pending check-in</span>
          </div>

          <div className="stat-card card-purple">
            <div className="stat-card-header">
              <span className="stat-icon-wrapper icon-violet">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </span>
              <span className="stat-label">Attendance Rate</span>
            </div>
            <div className="stat-number">{attendanceRate}%</div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, attendanceRate)}%` }}></div>
            </div>
          </div>
        </div>

        {/* Presence Records Table Section */}
        <div className="table-glass-card">
          <div className="table-controls-header">
            <div className="table-title-group">
              <h2>Check-in Log</h2>
              <span className="records-count-pill">{filteredStudents.length} records</span>
            </div>

            <div className="filter-actions-group">
              <div className="search-box-wrapper">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search name, regno, team..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input-styled"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="clear-search-btn">✕</button>
                )}
              </div>

              {departments.length > 0 && (
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="select-team-styled"
                >
                  <option value="all">All Departments ({departments.length})</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              )}

              {/* Download CSV Split Dropdown Action */}
              <div className="export-dropdown-wrapper" ref={dropdownRef}>
                <div className="export-split-btn">
                  <button
                    onClick={() => downloadCSV('filtered')}
                    className="download-csv-action-btn"
                    title="Download currently filtered attendance list as CSV"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Download CSV</span>
                  </button>

                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={`dropdown-caret-btn ${dropdownOpen ? 'active' : ''}`}
                    title="More export options"
                    aria-expanded={dropdownOpen}
                    aria-label="Toggle export options menu"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>

                {dropdownOpen && (
                  <div className="export-dropdown-menu">
                    <div className="dropdown-section-title">CSV Download Options</div>
                    
                    <button
                      onClick={() => downloadCSV('filtered')}
                      className="dropdown-item"
                    >
                      <div className="item-icon-circle blue">📥</div>
                      <div className="item-text-group">
                        <span className="item-title">Current Table View (CSV)</span>
                        <span className="item-desc">{filteredStudents.length} filtered records</span>
                      </div>
                    </button>

                    <button
                      onClick={() => downloadCSV('all')}
                      className="dropdown-item"
                    >
                      <div className="item-icon-circle purple">📊</div>
                      <div className="item-text-group">
                        <span className="item-title">Full Master Attendance Sheet (CSV)</span>
                        <span className="item-desc">All {totalRegistered} registered (Present + Absent)</span>
                      </div>
                    </button>

                    <button
                      onClick={() => downloadCSV('present')}
                      className="dropdown-item"
                    >
                      <div className="item-icon-circle emerald">👥</div>
                      <div className="item-text-group">
                        <span className="item-title">All Present Students (CSV)</span>
                        <span className="item-desc">{totalPresent} checked-in participants</span>
                      </div>
                    </button>

                    <button
                      onClick={() => downloadCSV('absent')}
                      className="dropdown-item"
                    >
                      <div className="item-icon-circle amber">⏳</div>
                      <div className="item-text-group">
                        <span className="item-title">Absentee List (CSV)</span>
                        <span className="item-desc">{totalAbsent} not yet verified</span>
                      </div>
                    </button>

                    <div className="dropdown-divider"></div>

                    <button
                      onClick={handleExportJSON}
                      className="dropdown-item"
                    >
                      <div className="item-icon-circle gray">{'{ }'}</div>
                      <div className="item-text-group">
                        <span className="item-title">Export as JSON</span>
                        <span className="item-desc">Raw structured JSON format</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <div className="table-responsive-wrapper">
              <table className="custom-dashboard-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>#</th>
                    <th>Student Name</th>
                    <th>Registration No</th>
                    <th>Department</th>
                    <th>Section</th>
                    <th>Year</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, index) => (
                    <tr key={student.regno || index}>
                      <td className="col-index">{index + 1}</td>
                      <td className="col-student">
                        <div className="student-flex-cell">
                          <div className="mini-avatar">{getInitials(student.name)}</div>
                          <span className="student-name-text">{student.name}</span>
                        </div>
                      </td>
                      <td className="col-regno">
                        <span className="mono-badge">{student.regno}</span>
                      </td>
                      <td className="col-dept">
                        <span className="dept-pill-tag">{student.department || 'N/A'}</span>
                      </td>
                      <td className="col-sec">
                        <span className="sec-pill-tag">{student.section || 'A'}</span>
                      </td>
                      <td className="col-year">
                        <span className="sec-pill-tag">{student.year || '—'}</span>
                      </td>
                      <td className="col-time font-mono">
                        {student.timestamp 
                          ? new Date(student.timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })
                          : 'Recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-table-state">
              <div className="empty-icon-circle">📋</div>
              <h3>No Attendance Records Found</h3>
              <p>
                {data?.presentStudents?.length === 0
                  ? 'No students have checked in yet. Attendance records will appear here live as students verify.'
                  : 'No student check-ins match your current search query or department filter.'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Clear Database Confirmation Modal */}
      {showClearModal && (
        <div className="admin-modal-overlay" onClick={() => !clearingDb && setShowClearModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-danger-badge">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            
            <h2 className="modal-title">Clear Attendance Database?</h2>
            <p className="modal-desc">
              Are you sure you want to permanently clear all <strong>{totalPresent}</strong> recorded student check-in records from the database?
            </p>
            <div className="modal-warning-box">
              <span className="warning-icon">⚠️</span>
              <span>This will delete all live check-ins in MongoDB. Master participant data in data.json will remain untouched.</span>
            </div>

            <div className="modal-actions-row">
              <button
                onClick={() => setShowClearModal(false)}
                disabled={clearingDb}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDatabase}
                disabled={clearingDb}
                className="modal-confirm-danger-btn"
              >
                {clearingDb ? (
                  <span className="btn-flex-center">
                    <span className="spinner-small"></span>
                    Clearing Records...
                  </span>
                ) : (
                  'Yes, Clear All Data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



