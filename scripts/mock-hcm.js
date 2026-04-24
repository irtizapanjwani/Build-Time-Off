const express = require('express');
const app = express();
app.use(express.json());

const PORT = 4000;

// TRD Phase 4: Mock HCM with stateful balances and chaos testing support
let isOutageEnabled = false;

const balances = {
  'employee-123': {
    'loc-1': {
      'ANNUAL': 20.0
    }
  }
};

/**
 * Toggle HCM Outage for Chaos Testing
 */
app.post('/hcm/toggle-outage', (req, res) => {
  isOutageEnabled = !isOutageEnabled;
  console.log(`[HCM] Outage mode flipped to: ${isOutageEnabled ? 'ON (503 Service Unavailable)' : 'OFF (Healthy)'}`);
  res.json({ isOutageEnabled });
});

/**
 * Fetch Employee Balance
 */
app.get('/hcm/time-off/balance', (req, res) => {
  if (isOutageEnabled) {
    console.log('[HCM] GET balance rejected: Outage Enabled (503)');
    return res.status(503).json({ error: 'Service Unavailable' });
  }

  const { employeeId, locationId, leaveType } = req.query;
  console.log(`[HCM] GET balance for ${employeeId}, ${locationId}, ${leaveType}`);
  
  const emp = balances[employeeId];
  if (!emp || !emp[locationId] || emp[locationId][leaveType] === undefined) {
    return res.status(404).json({ error: 'Balance not found' });
  }
  
  res.json({ balance: emp[locationId][leaveType] });
});

/**
 * Deduct Employee Balance
 */
app.post('/hcm/time-off/deduct', (req, res) => {
  if (isOutageEnabled) {
    console.log('[HCM] POST deduct rejected: Outage Enabled (503)');
    return res.status(503).json({ error: 'Service Unavailable' });
  }

  const { employeeId, locationId, leaveType, days } = req.body;
  console.log(`[HCM] POST deduct ${days} days for ${employeeId}`);
  
  const emp = balances[employeeId];
  if (!emp || !emp[locationId] || emp[locationId][leaveType] === undefined) {
    return res.status(404).json({ error: 'Balance not found' });
  }
  
  if (balances[employeeId][locationId][leaveType] < days) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  balances[employeeId][locationId][leaveType] -= days;
  
  res.json({ 
    success: true, 
    transactionId: `hcm-tx-${Date.now()}`,
    newBalance: balances[employeeId][locationId][leaveType]
  });
});

app.listen(PORT, () => {
  console.log('-------------------------------------------');
  console.log(`Mock HCM Server running at http://localhost:${PORT}/hcm`);
  console.log(`Control: POST http://localhost:${PORT}/hcm/toggle-outage`);
  console.log('-------------------------------------------');
});
