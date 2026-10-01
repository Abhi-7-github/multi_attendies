require('dotenv').config();
const fs = require('fs');

// Configuration
const SERVER_URL = process.env.TEST_SERVER_URL || process.env.SERVER_URL || 'http://localhost:5000';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 150;

// Read data
const dataPath = './data.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

if (!data || data.length === 0) {
  console.error('No data found in data.json');
  process.exit(1);
}

console.log(`📊 Total records available: ${data.length}`);
console.log(`📤 Sending ${Math.min(BATCH_SIZE, data.length)} attendance requests...`);
console.log(`🎯 Target: ${SERVER_URL}`);
console.log('');

// Function to send a single request
async function sendAttendanceRequest(student, index) {
  try {
    const response = await fetch(`${SERVER_URL}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regno: student.regno }),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ [${index + 1}/${BATCH_SIZE}] ${student.name} (${student.regno}) [${student.department || 'N/A'}-${student.section || 'A'}] - Success`);
      return { success: true, student };
    } else {
      console.log(`⚠️  [${index + 1}/${BATCH_SIZE}] ${student.name} (${student.regno}) [${student.department || 'N/A'}-${student.section || 'A'}] - ${result.message || 'Failed'}`);
      return { success: false, student, error: result.message };
    }
  } catch (error) {
    console.log(`❌ [${index + 1}/${BATCH_SIZE}] ${student.name} (${student.regno}) [${student.department || 'N/A'}-${student.section || 'A'}] - Error: ${error.message}`);
    return { success: false, student, error: error.message };
  }
}

// Main execution
async function sendBatch() {
  const batch = data.slice(0, BATCH_SIZE);
  
  // Send all requests concurrently
  const startTime = Date.now();
  const promises = batch.map((student, index) => sendAttendanceRequest(student, index));
  const results = await Promise.all(promises);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${duration}s`);
  console.log(`📊 Average time per request: ${(duration / BATCH_SIZE).toFixed(3)}s`);
  console.log('═══════════════════════════════════════');
}

sendBatch().catch(console.error);
