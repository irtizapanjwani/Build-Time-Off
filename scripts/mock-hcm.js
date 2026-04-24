const express = require('express');
const app = express();
app.use(express.json());

const PORT = 4000;

// In-memory balance store initialized with seed data
const balances = {
  'employee-123': {
    'loc-1': {
      'ANNUAL': 20.0
    }
  }
};

app.get('/hcm/time-off/balance', (req, res) => {
  const { employeeId, locationId, leaveType } = req.query;
  console.log(`[HCM] GET balance for ${employeeId}, ${locationId}, ${leaveType}`);
  
  const emp = balances[employeeId];
  if (!emp || !emp[locationId] || emp[locationId][leaveType] === undefined) {
    return res.status(404).json({ error: 'Balance not found' });
  }
  
  res.json({ balance: emp[locationId][leaveType] });
});

app.post('/hcm/time-off/deduct', (req, res) => {
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
  console.log('-------------------------------------------');
});
