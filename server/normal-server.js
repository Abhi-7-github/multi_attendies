require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { 
  connectDB, 
  getPresenceCollection, 
  getSettingsCollection, 
  getAttendanceStatus, 
  setAttendanceStatus, 
  clearAllPresenceRecords 
} = require('./models/Presence.js');

const app = express();

// Initialize MongoDB connection on startup
connectDB().catch((err) => {
  console.error('Initial MongoDB connection error:', err.message);
});

// CORS configuration - allow localhost and 127.0.0.1 on any local port
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}));

app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const PORT = parseInt(process.env.PORT, 10) || 5001;
const HEALTH_CHECK_PATH = process.env.HEALTH_CHECK_PATH || '/health';

// Request logger
app.use((req, res, next) => {
  if (req.path !== HEALTH_CHECK_PATH) {
    console.log(`[Server ${PORT}] ${req.method} ${req.originalUrl || req.url}`);
  }
  next();
});

// Health check endpoint
app.get(HEALTH_CHECK_PATH, (req, res) => {
  res.status(200).send('OK');
});

// Presence / Attendance status endpoint
app.get(['/api/attendance/status', '/presence/status'], async (req, res) => {
  const isOpen = await getAttendanceStatus();
  res.json({
    success: true,
    isOpen,
    timestamp: new Date().toISOString(),
  });
});

// Update presence endpoint
app.post('/presence/update', (req, res) => {
  const { userId, status } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: 'userId and status are required' });
  }

  res.json({
    userId,
    status,
    timestamp: new Date().toISOString(),
  });
});

// Get user presence endpoint
app.get('/presence/:userId', (req, res) => {
  const { userId } = req.params;

  res.json({
    userId,
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
  });
});

// Helper: Read student master data from server/data.json ONLY
function getStudentMasterData() {
  const dataPath = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataPath)) return [];
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return Array.isArray(data) ? data : (data.students || []);
}

// Step 3: Student Verification endpoint - Uses server/data.json ONLY
app.post('/api/verify', async (req, res) => {
  const isAttendanceOpen = await getAttendanceStatus();
  if (!isAttendanceOpen) {
    return res.status(403).json({
      success: false,
      isClosed: true,
      message: 'Attendance is currently closed.',
    });
  }

  const { regno } = req.body;

  if (!regno || typeof regno !== 'string') {
    return res.status(400).json({ 
      success: false, 
      message: 'Registration number is required.' 
    });
  }

  const queryReg = regno.trim().toLowerCase();

  try {
    const students = getStudentMasterData();
    const student = students.find(s => String(s.regno).trim().toLowerCase() === queryReg);

    if (student) {
      return res.json({
        success: true,
        student: {
          name: student.name,
          regno: student.regno,
          department: student.department || '',
          section: student.section || '',
          mobile: student.mobile || student.mobileNumber || '',
          mobileNumber: student.mobile || student.mobileNumber || '',
        },
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found.',
      });
    }
  } catch (error) {
    console.error('Error verifying student in data.json:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// Step 4: Mark Presence endpoint - Confirms in data.json, stores in MongoDB
app.post('/api/presence', async (req, res) => {
  const isAttendanceOpen = await getAttendanceStatus();
  if (!isAttendanceOpen) {
    return res.status(403).json({
      success: false,
      isClosed: true,
      message: 'Attendance is currently closed.',
    });
  }

  const { regno } = req.body;

  if (!regno || typeof regno !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Registration number is required.',
    });
  }

  const queryReg = regno.trim().toLowerCase();

  try {
    // 1. Search data.json to confirm student exists & retrieve verified name
    const students = getStudentMasterData();
    const student = students.find(s => String(s.regno).trim().toLowerCase() === queryReg);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Registration number not found.',
      });
    }

    // 2. Ensure MongoDB connection is available
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (!collection) {
      return res.status(503).json({
        success: false,
        message: 'Presence service is currently unavailable.',
      });
    }

    // 3. Check MongoDB for an existing presence record
    const existingRecord = await collection.findOne({
      regno: { $regex: new RegExp(`^${queryReg}$`, 'i') }
    });

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        message: 'You have already marked your presence.',
      });
    }

    // 4. Create and store the new presence record in MongoDB
    const record = {
      name: student.name,
      regno: student.regno,
      department: student.department || '',
      section: student.section || '',
      mobile: student.mobile || student.mobileNumber || '',
      timestamp: new Date().toISOString(),
    };

    await collection.insertOne({ ...record });
    console.log(`[Server ${PORT}] Saved presence to MongoDB for ${student.name} (${student.regno}) - ${student.department || 'N/A'}`);

    return res.status(201).json({
      success: true,
      message: 'Presence marked successfully.',
      record,
    });
  } catch (error) {
    console.error('Error marking presence in MongoDB:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already marked your presence.',
      });
    }
    return res.status(503).json({
      success: false,
      message: 'Presence service is currently unavailable.',
    });
  }
});

// Step 6.5: Admin Login Validation endpoint
app.post('/api/admin/login', (req, res) => {
  const { key } = req.body || {};
  const expectedKey = process.env.ADMIN_KEY || process.env.VITE_ADMIN_KEY;

  if (!key || !key.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Admin key is required.',
    });
  }

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      message: 'ADMIN_KEY is not configured in server environment variables.',
    });
  }

  if (key.trim() === expectedKey.trim()) {
    return res.json({
      success: true,
      message: 'Admin authentication successful.',
    });
  } else {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin security key.',
    });
  }
});

// Admin Toggle Attendance Status Endpoint
app.post(['/api/admin/attendance/toggle', '/api/admin/attendance-toggle'], async (req, res) => {
  try {
    const { isOpen } = req.body;
    const targetState = typeof isOpen === 'boolean' ? isOpen : true;
    const updatedStatus = await setAttendanceStatus(targetState);
    console.log(`[Server ${PORT}] Attendance status set to: ${updatedStatus ? 'OPEN' : 'CLOSED'}`);
    return res.json({
      success: true,
      isOpen: updatedStatus,
      message: `Attendance is now ${updatedStatus ? 'OPEN' : 'CLOSED'}.`,
    });
  } catch (error) {
    console.error('Error toggling attendance status:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update attendance status.',
    });
  }
});

// Admin Clear Database Endpoint
app.post(['/api/admin/clear-db', '/api/admin/presence/clear'], async (req, res) => {
  try {
    const result = await clearAllPresenceRecords();
    
    // Reset local JSON if exists
    const jsonPath = path.join(__dirname, 'presence.json');
    if (fs.existsSync(jsonPath)) {
      try {
        fs.writeFileSync(jsonPath, JSON.stringify({ records: [] }, null, 2));
      } catch (e) {}
    }

    return res.json({
      success: true,
      message: 'All attendance records have been cleared successfully.',
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    console.error('Error clearing presence database:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear attendance database.',
    });
  }
});

// Step 7: Admin endpoint - Retrieves presence records from MongoDB and stats
app.get('/api/admin/presence', async (req, res) => {
  try {
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    if (!collection) {
      return res.status(503).json({
        success: false,
        message: 'Presence service is currently unavailable.',
      });
    }

    const isAttendanceOpen = await getAttendanceStatus();
    const students = getStudentMasterData();
    const presentStudents = await collection
      .find({}, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .toArray();

    const totalAbsent = Math.max(0, students.length - presentStudents.length);

    return res.json({
      success: true,
      isAttendanceOpen,
      stats: {
        totalRegistered: students.length,
        totalPresent: presentStudents.length,
        totalAbsent,
      },
      presentStudents,
      allStudents: students,
    });
  } catch (error) {
    console.error('Error retrieving admin presence data from MongoDB:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Presence service is currently unavailable.',
    });
  }
});

// Step 8: Direct CSV Download Endpoint - Generates downloadable CSV
app.get(['/api/admin/export/csv', '/api/export-csv'], async (req, res) => {
  try {
    const type = (req.query.type || 'present').toLowerCase(); // 'present', 'all', 'absent'
    let collection = getPresenceCollection();
    if (!collection) {
      collection = await connectDB();
    }

    const students = getStudentMasterData();
    let presentStudents = [];
    if (collection) {
      presentStudents = await collection
        .find({}, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .toArray();
    }

    const presentMap = new Map();
    presentStudents.forEach((p) => {
      if (p.regno) {
        presentMap.set(String(p.regno).trim().toLowerCase(), p);
      }
    });

    let headers = [];
    let rows = [];

    if (type === 'all') {
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Mobile Number', 'Attendance Status', 'Check-in Timestamp'];
      rows = students.map((s, idx) => {
        const queryKey = String(s.regno).trim().toLowerCase();
        const isPresent = presentMap.has(queryKey);
        const record = isPresent ? presentMap.get(queryKey) : null;
        const timeStr = record?.timestamp ? new Date(record.timestamp).toLocaleString() : 'N/A';
        return [
          idx + 1,
          `"${String(s.name || '').replace(/"/g, '""')}"`,
          `"${String(s.regno || '').replace(/"/g, '""')}"`,
          `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
          `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
          `"${String(s.mobile || s.mobileNumber || 'N/A').replace(/"/g, '""')}"`,
          isPresent ? 'PRESENT' : 'ABSENT',
          `"${timeStr.replace(/"/g, '""')}"`
        ];
      });
    } else if (type === 'absent') {
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Mobile Number', 'Attendance Status'];
      const absentStudents = students.filter(s => !presentMap.has(String(s.regno).trim().toLowerCase()));
      rows = absentStudents.map((s, idx) => [
        idx + 1,
        `"${String(s.name || '').replace(/"/g, '""')}"`,
        `"${String(s.regno || '').replace(/"/g, '""')}"`,
        `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.mobile || s.mobileNumber || 'N/A').replace(/"/g, '""')}"`,
        'ABSENT'
      ]);
    } else {
      // Default: present students
      headers = ['S.No', 'Student Name', 'Registration Number', 'Department', 'Section', 'Mobile Number', 'Attendance Status', 'Check-in Timestamp'];
      rows = presentStudents.map((s, idx) => [
        idx + 1,
        `"${String(s.name || '').replace(/"/g, '""')}"`,
        `"${String(s.regno || '').replace(/"/g, '""')}"`,
        `"${String(s.department || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.section || 'N/A').replace(/"/g, '""')}"`,
        `"${String(s.mobile || s.mobileNumber || 'N/A').replace(/"/g, '""')}"`,
        'PRESENT',
        `"${s.timestamp ? new Date(s.timestamp).toLocaleString().replace(/"/g, '""') : 'Recorded'}"`
      ]);
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `presencex_${type}_attendance_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error generating CSV export:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to generate CSV' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Normal Server running on port ${PORT}`);
});
