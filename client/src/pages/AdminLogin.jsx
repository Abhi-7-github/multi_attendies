import { useState } from 'react';
import { presenceAPI } from '../services/presenceAPI.js';
import './AdminLogin.css';

export default function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanKey = key.trim();
    if (!cleanKey) {
      setError('Please enter the admin key');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const clientEnvKey = import.meta.env.VITE_ADMIN_KEY;
      if (clientEnvKey && clientEnvKey.trim() === cleanKey) {
        onLogin(cleanKey);
        return;
      }

      const result = await presenceAPI.loginAdmin(cleanKey);
      if (result.success) {
        onLogin(cleanKey);
      } else {
        setError(result.message || 'Invalid admin authentication key');
      }
    } catch (err) {
      setError('Unable to connect to authentication server. Please check your connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToMain = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container">
        <div className="admin-login-card">
          <div className="card-top-tag">SECURITY DISPATCH &bull; ACCESS CONTROL</div>

          <div className="admin-brand-header">
            <h1 className="brand-title">
              Presence<span className="brand-accent">X</span> Admin
            </h1>
            <p className="brand-powered-line">Powered by TARA</p>
            <p className="subtitle">
              Enter your master security key to access the institutional records ledger.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="admin-key-input" className="input-label">SECURITY MASTER KEY</label>
              <div className="input-wrapper">
                <input
                  id="admin-key-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={loading}
                  className="editorial-input"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="toggle-key-btn"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-alert">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="btn-primary-solid"
            >
              {loading ? (
                <span className="btn-flex">
                  <span className="editorial-spinner"></span>
                  Verifying Credentials...
                </span>
              ) : (
                <span className="btn-flex">
                  Access Management Ledger &rarr;
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToMain}
              className="btn-link-action"
            >
              &larr; Return to Student Check-in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
