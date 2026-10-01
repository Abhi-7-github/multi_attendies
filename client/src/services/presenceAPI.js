const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

export const SERVERS = {
  apiBaseUrl: API_BASE_URL,
  engine: import.meta.env.VITE_ENGINE_SERVER_URL || 'http://localhost:5000',
  server1: import.meta.env.VITE_NORMAL_SERVER_1_URL || 'http://localhost:5001',
  server2: import.meta.env.VITE_NORMAL_SERVER_2_URL || 'http://localhost:5002',
  server3: import.meta.env.VITE_NORMAL_SERVER_3_URL || 'http://localhost:5003',
};

export const presenceAPI = {
  // Get presence status
  async getStatus() {
    const res = await fetch(`${API_BASE_URL}/presence/status`);
    return res.json();
  },

  // Update user presence
  async updatePresence(userId, status) {
    const res = await fetch(`${API_BASE_URL}/presence/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status }),
    });
    return res.json();
  },

  // Get specific user presence
  async getUserPresence(userId) {
    const res = await fetch(`${API_BASE_URL}/presence/${userId}`);
    return res.json();
  },

  // Verify student by registration number
  async verifyStudent(regno) {
    const res = await fetch(`${API_BASE_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regno }),
    });
    return res.json();
  },

  // Mark presence
  async markPresence(regno) {
    const res = await fetch(`${API_BASE_URL}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regno }),
    });
    return res.json();
  },

  // Get admin presence data
  async getAdminPresence() {
    const res = await fetch(`${API_BASE_URL}/api/admin/presence`);
    return res.json();
  },

  // Validate admin login key against server
  async loginAdmin(key) {
    const res = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return res.json();
  },

  // Get CSV Export URL
  getExportCSVUrl(type = 'present') {
    return `${API_BASE_URL}/api/admin/export/csv?type=${encodeURIComponent(type)}`;
  },

  // Get attendance active status
  async getAttendanceStatus() {
    const res = await fetch(`${API_BASE_URL}/api/attendance/status`);
    return res.json();
  },

  // Toggle attendance open / closed
  async toggleAttendance(isOpen, key = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers['x-admin-key'] = key;
    }
    const res = await fetch(`${API_BASE_URL}/api/admin/attendance/toggle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ isOpen, key }),
    });
    return res.json();
  },

  // Clear all presence data from DB
  async clearDatabase(key = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers['x-admin-key'] = key;
    }
    const res = await fetch(`${API_BASE_URL}/api/admin/clear-db`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key }),
    });
    return res.json();
  },

  // Health check
  async healthCheck() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return res.ok;
    } catch (err) {
      return false;
    }
  },
};

