const axios = require('axios');

/**
 * Chaos Test: Automates the 'Outage -> Submit -> Recovery -> Verify' flow.
 */
async function runChaosTest() {
  const API_URL = 'http://localhost:3000/api/v1';
  const HCM_MOCK_URL = 'http://localhost:4000/hcm';
  const EMP_ID = 'employee-123';

  console.log('\n===========================================');
  console.log('   STARTING HCM CHAOS RECOVERY TEST');
  console.log('===========================================\n');

  try {
    // 1. Enable Outage
    console.log('[STEP 1] Enabling HCM Outage (Simulating Network Failure)...');
    await axios.post(`${HCM_MOCK_URL}/toggle-outage`);
    console.log('   RESULT: HCM is now unavailable.\n');

    // 2. Submit Request
    console.log('[STEP 2] Submitting Time-Off Request during outage...');
    const idempotencyKey = `chaos-${Date.now()}`;
    const postResponse = await axios.post(`${API_URL}/time-off`, {
      employeeId: EMP_ID,
      locationId: 'loc-1',
      leaveType: 'ANNUAL',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      daysRequested: 1
    }, {
      headers: { 'x-idempotency-key': idempotencyKey }
    });

    const requestId = postResponse.data.id;
    console.log(`   RESULT: Request submitted. ID: ${requestId}`);
    console.log(`   INITIAL STATUS: ${postResponse.data.status} (Expected: HCM_ERROR)\n`);

    if (postResponse.data.status !== 'HCM_ERROR') {
      throw new Error(`Unexpected initial status: ${postResponse.data.status}`);
    }

    // 3. Disable Outage
    console.log('[STEP 3] Disabling HCM Outage (Simulating System Recovery)...');
    await axios.post(`${HCM_MOCK_URL}/toggle-outage`);
    console.log('   RESULT: HCM is now back online.\n');

    // 4. Wait for Retry Worker
    console.log('[STEP 4] Waiting 35 seconds for HCM Retry Worker (Cron) to process the job...');
    // We wait 35s because the cron runs every 30s
    await new Promise(resolve => setTimeout(resolve, 35000));

    // 5. Verify Success
    console.log('[STEP 5] Verifying final request status via history API...');
    const historyResponse = await axios.get(`${API_URL}/time-off/${EMP_ID}`);
    const request = historyResponse.data.find(r => r.id === requestId);

    if (!request) {
      throw new Error('Request not found in history!');
    }

    console.log(`   FINAL STATUS: ${request.status}`);
    
    if (request.status === 'APPROVED') {
      console.log('\n✅ PASS: System successfully recovered from outage and processed the queued job!');
    } else {
      console.log('\n❌ FAIL: Request was not approved automatically.');
    }

  } catch (error) {
    console.error('\n💥 ERROR during chaos test:', error.response ? error.response.data : error.message);
  }
  console.log('\n===========================================\n');
}

runChaosTest();
