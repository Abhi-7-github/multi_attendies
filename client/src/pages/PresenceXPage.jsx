import { useState, useEffect } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './PresenceXPage.css';

export default function PresenceXPage() {
  const [step, setStep] = useState('input'); // input, verified, success, error
  const [registration, setRegistration] = useState('');
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentRegs, setRecentRegs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [timestamp, setTimestamp] = useState('');
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(true);
  const [, setInitialChecked] = useState(false);

  // Check attendance open/closed status on mount and poll every 3.5s
  useEffect(() => {
    let isMounted = true;

    const checkStatus = async () => {
      try {
        const res = await presenceAPI.getAttendanceStatus();
        if (isMounted && res && typeof res.isOpen === 'boolean') {
          setIsAttendanceOpen(res.isOpen);
          setInitialChecked(true);
        }
      } catch (err) {
        if (isMounted) setInitialChecked(true);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Load recent registration numbers on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('presenceX_recent_regs');
      if (saved) {
        setRecentRegs(JSON.parse(saved).slice(0, 4));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveRecentReg = (regno) => {
    try {
      const updated = [regno, ...recentRegs.filter((r) => r !== regno)].slice(0, 4);
      setRecentRegs(updated);
      localStorage.setItem('presenceX_recent_regs', JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();

    const cleanReg = registration.trim();
    if (!cleanReg) {
      setError('Please enter your registration number');
      setStep('error');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.verifyStudent(cleanReg);

      if (result.success) {
        setStudent(result.student);
        saveRecentReg(cleanReg);
        setStep('verified');
      } else {
        if (result.isClosed) {
          setIsAttendanceOpen(false);
        }
        setError(result.message || 'Registration number not found in our database');
        setStep('error');
      }
    } catch (err) {
      setError('Unable to connect to presence server. Please verify your connection.');
      setStep('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (regno) => {
    setRegistration(regno);
  };

  const handleMarkPresence = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await presenceAPI.markPresence(student.regno);

      if (result.success) {
        setTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setStep('success');
      } else {
        if (result.isClosed) {
          setIsAttendanceOpen(false);
        }
        setError(result.message || 'Failed to mark presence');
        setStep('error');
      }
    } catch (err) {
      setError('Unable to connect to server. Please try again.');
      setStep('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('input');
    setRegistration('');
    setStudent(null);
    setError('');
    setCopied(false);
  };

  const copyTicketDetails = () => {
    if (!student) return;
    const text = `PresenceX Check-in Pass\nName: ${student.name}\nReg No: ${student.regno}\nDepartment: ${student.department || 'N/A'}\nSection: ${student.section || 'N/A'}\nMobile: ${student.mobile || student.mobileNumber || 'N/A'}\nTime: ${timestamp}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getInitials = (name) => {
    if (!name) return 'PX';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getCurrentStepNum = () => {
    if (step === 'input') return 1;
    if (step === 'verified') return 2;
    if (step === 'success') return 3;
    return 1;
  };

  return (
    <div className="presencex-page">
      <div className="presencex-container">
        {/* Editorial Masthead */}
        <header className="presencex-masthead">
          <div className="brand-editorial">
            <h1 className="brand-name">
              Presence<span className="brand-accent">X</span>
            </h1>
            <p className="brand-powered-line">Powered by TARA</p>
          </div>
        </header>

        {/* When Attendance is Closed */}
        {!isAttendanceOpen ? (
          <main className="presencex-card closed-card-editorial">
            <div className="card-top-tag">NOTICE &bull; 00</div>
            <div className="closed-content">
              <div className="editorial-icon-box">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="1" ry="1"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <h2 className="editorial-heading">Attendance Session Paused</h2>
              <p className="editorial-subtext">
                The administrator has closed check-ins for the ongoing session. Verification and submission are temporarily suspended.
              </p>
              <div className="editorial-note-box">
                <span className="note-title">STANDBY</span>
                <p>This registry will refresh automatically as soon as the session is reopened.</p>
              </div>
            </div>
          </main>
        ) : (
          <>
            {/* Step Progress Tracker */}
            {step !== 'error' && (
              <nav className="editorial-step-tracker" aria-label="Progress">
                <div className={`step-node ${getCurrentStepNum() >= 1 ? 'is-active' : ''} ${getCurrentStepNum() > 1 ? 'is-complete' : ''}`}>
                  <span className="step-num">01</span>
                  <span className="step-name">Identify</span>
                </div>
                <div className={`step-rule ${getCurrentStepNum() >= 2 ? 'is-active' : ''}`}></div>
                <div className={`step-node ${getCurrentStepNum() >= 2 ? 'is-active' : ''} ${getCurrentStepNum() > 2 ? 'is-complete' : ''}`}>
                  <span className="step-num">02</span>
                  <span className="step-name">Verify</span>
                </div>
                <div className={`step-rule ${getCurrentStepNum() >= 3 ? 'is-active' : ''}`}></div>
                <div className={`step-node ${getCurrentStepNum() >= 3 ? 'is-active' : ''}`}>
                  <span className="step-num">03</span>
                  <span className="step-name">Confirm</span>
                </div>
              </nav>
            )}

            <main className="presencex-card">
              {/* STEP 1: Input Registration */}
              {step === 'input' && (
                <div className="step-content">
                  <div className="card-top-tag">STEP 01 &bull; REGISTRATION IDENTIFIER</div>
                  <div className="step-header">
                    <h2 className="editorial-heading">Mark Your Presence</h2>
                    <p className="editorial-subtext">
                      Provide your assigned institutional registration number to retrieve your credentials.
                    </p>
                  </div>

                  <form onSubmit={handleVerify} className="attendance-form">
                    <div className="input-group">
                      <label htmlFor="registration-input" className="input-label">
                        REGISTRATION NUMBER
                      </label>
                      <div className="input-frame">
                        <input
                          id="registration-input"
                          type="text"
                          placeholder="e.g. 9921004123"
                          value={registration}
                          onChange={(e) => setRegistration(e.target.value)}
                          disabled={loading}
                          className="editorial-input"
                          autoFocus
                          autoComplete="off"
                        />
                        {registration && (
                          <button
                            type="button"
                            onClick={() => setRegistration('')}
                            className="input-clear-btn"
                            aria-label="Clear input"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      <div className="input-footer-hint">
                        <span>Press <kbd>Return &crarr;</kbd> to query registry</span>
                      </div>
                    </div>

                    {recentRegs.length > 0 && (
                      <div className="recent-section">
                        <span className="recent-title">RECENT ENTRIES</span>
                        <div className="recent-list">
                          {recentRegs.map((reg) => (
                            <button
                              key={reg}
                              type="button"
                              className="recent-tag"
                              onClick={() => handleQuickSelect(reg)}
                            >
                              {reg}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="form-action-row">
                      <button
                        type="submit"
                        disabled={loading || !registration.trim()}
                        className="btn-primary-solid"
                      >
                        {loading ? (
                          <span className="btn-state-flex">
                            <span className="editorial-spinner"></span>
                            Querying Database...
                          </span>
                        ) : (
                          <span className="btn-state-flex">
                            Proceed to Verification &rarr;
                          </span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STEP 2: Verify Student Information */}
              {step === 'verified' && student && (
                <div className="step-content">
                  <div className="card-top-tag">STEP 02 &bull; CONFIRM IDENTITY</div>
                  <div className="verified-header">
                    <div className="avatar-monogram">{getInitials(student.name)}</div>
                    <div>
                      <h2 className="student-name">{student.name}</h2>
                      <div className="student-regno-badge font-mono">{student.regno}</div>
                    </div>
                  </div>

                  <div className="editorial-data-table">
                    <div className="data-row">
                      <span className="data-label">Department</span>
                      <span className="data-value">{student.department || 'General'}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Section</span>
                      <span className="data-value">Section {student.section || 'A'}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Mobile Number</span>
                      <span className="data-value font-mono">{student.mobile || student.mobileNumber || 'N/A'}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Registration ID</span>
                      <span className="data-value font-mono">{student.regno}</span>
                    </div>
                  </div>

                  <div className="action-row">
                    <button
                      onClick={handleMarkPresence}
                      disabled={loading}
                      className="btn-primary-solid"
                    >
                      {loading ? (
                        <span className="btn-state-flex">
                          <span className="editorial-spinner"></span>
                          Logging Attendance...
                        </span>
                      ) : (
                        <span className="btn-state-flex">
                          Confirm & Mark Present &rarr;
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Success Confirmation */}
              {step === 'success' && (
                <div className="step-content">
                  <div className="card-top-tag">STEP 03 &bull; RECORD CONFIRMED</div>

                  <div className="success-banner">
                    <div className="success-stamp">LOGGED</div>
                    <h2 className="editorial-heading">Presence Recorded</h2>
                    <p className="editorial-subtext">
                      Attendance has been verified and registered in the institutional master file.
                    </p>
                  </div>

                  <div className="editorial-docket">
                    <div className="docket-header">
                      <span className="docket-title">DIGITAL ATTENDANCE PASS</span>
                      <span className="docket-status">OFFICIAL</span>
                    </div>

                    <div className="docket-body">
                      <div className="docket-item">
                        <span className="docket-k">Student Name</span>
                        <span className="docket-v">{student?.name}</span>
                      </div>
                      <div className="docket-item">
                        <span className="docket-k">Registration</span>
                        <span className="docket-v font-mono">{student?.regno}</span>
                      </div>
                      <div className="docket-item">
                        <span className="docket-k">Department</span>
                        <span className="docket-v">{student?.department || 'General'}</span>
                      </div>
                      <div className="docket-item">
                        <span className="docket-k">Section</span>
                        <span className="docket-v">{student?.section ? `Section ${student.section}` : 'N/A'}</span>
                      </div>
                      <div className="docket-item">
                        <span className="docket-k">Time Recorded</span>
                        <span className="docket-v font-mono">{timestamp || 'Just now'}</span>
                      </div>
                    </div>

                    <div className="docket-actions">
                      <button onClick={copyTicketDetails} className="btn-secondary-solid">
                        {copied ? '✓ Copied Pass to Clipboard' : 'Copy Pass Details'}
                      </button>
                      <button onClick={handleReset} className="btn-link-action">
                        New Check-In &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ERROR STATE */}
              {step === 'error' && (
                <div className="step-content">
                  <div className="card-top-tag">SYSTEM NOTICE &bull; ERROR</div>
                  <div className="error-editorial-box">
                    <h2 className="editorial-heading">Verification Unsuccessful</h2>
                    <p className="error-message-text">{error}</p>
                    <p className="error-guidance">
                      Please double-check the registration number entered or consult the session administrator.
                    </p>
                    <button onClick={handleReset} className="btn-primary-solid margin-top-md">
                      Return & Try Again
                    </button>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* Editorial Colophon / Footer */}
        <footer className="presencex-colophon">
          <div className="colophon-line"></div>
          <div className="colophon-content">
            <span className="colophon-title">PRESENCEX WORKSPACE</span>
            <span className="colophon-sep">&bull;</span>
            <span className="colophon-powered">POWERED BY TARA</span>
            <span className="colophon-sep">&bull;</span>
            <span>TIMED &amp; RECORDED ATTENDANCE REGISTRY</span>
            <span className="colophon-sep">&bull;</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
