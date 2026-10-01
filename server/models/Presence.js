const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

let client = null;
let db = null;
let presenceCollection = null;
let settingsCollection = null;
let isConnected = false;
let cachedAttendanceOpen = true;

/**
 * Connect to MongoDB and initialize the presence collection, settings collection, and indexes
 */
async function connectDB() {
  if (db && isConnected) {
    return presenceCollection;
  }

  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables.');
    return null;
  }

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(); // Uses the database specified in connection string or default
    presenceCollection = db.collection('presence');
    settingsCollection = db.collection('settings');
    isConnected = true;

    // Create unique index on regno to prevent duplicate check-ins
    try {
      await presenceCollection.createIndex({ regno: 1 }, { unique: true });
      await presenceCollection.createIndex({ department: 1 });
      await presenceCollection.createIndex({ section: 1 });
    } catch (idxErr) {
      // Index might already exist
    }

    console.log(`✓ Connected to MongoDB Presence collection`);
    return presenceCollection;
  } catch (err) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    isConnected = false;
    db = null;
    presenceCollection = null;
    settingsCollection = null;
    return null;
  }
}

/**
 * Get the presence collection if connected
 */
function getPresenceCollection() {
  return isConnected ? presenceCollection : null;
}

/**
 * Get the settings collection if connected
 */
function getSettingsCollection() {
  return isConnected ? settingsCollection : null;
}

/**
 * Get current attendance status (isOpen: true/false)
 */
async function getAttendanceStatus() {
  try {
    let col = getSettingsCollection();
    if (!col) {
      await connectDB();
      col = getSettingsCollection();
    }

    if (col) {
      const setting = await col.findOne({ key: 'attendance_status' });
      if (setting && typeof setting.isOpen === 'boolean') {
        cachedAttendanceOpen = setting.isOpen;
        return setting.isOpen;
      }
    }
  } catch (err) {
    console.error('Error getting attendance status from DB:', err.message);
  }
  return cachedAttendanceOpen;
}

/**
 * Set attendance status (isOpen: true/false)
 */
async function setAttendanceStatus(isOpen) {
  cachedAttendanceOpen = Boolean(isOpen);
  try {
    let col = getSettingsCollection();
    if (!col) {
      await connectDB();
      col = getSettingsCollection();
    }

    if (col) {
      await col.updateOne(
        { key: 'attendance_status' },
        { 
          $set: { 
            key: 'attendance_status', 
            isOpen: Boolean(isOpen), 
            updatedAt: new Date().toISOString() 
          } 
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Error saving attendance status to DB:', err.message);
  }
  return cachedAttendanceOpen;
}

/**
 * Clear all presence records from MongoDB
 */
async function clearAllPresenceRecords() {
  try {
    let col = getPresenceCollection();
    if (!col) {
      await connectDB();
      col = getPresenceCollection();
    }

    if (!col) {
      throw new Error('Database collection is unavailable');
    }

    const result = await col.deleteMany({});
    console.log(`✓ Cleared ${result.deletedCount} presence records from MongoDB`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error('Error clearing presence records:', err.message);
    throw err;
  }
}

module.exports = {
  connectDB,
  getPresenceCollection,
  getSettingsCollection,
  getAttendanceStatus,
  setAttendanceStatus,
  clearAllPresenceRecords,
};

