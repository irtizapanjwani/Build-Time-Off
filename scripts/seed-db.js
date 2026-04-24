const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const db = new Database('./data/timeoff.db');

try {
  // Clear existing to ensure clean state for testing
  db.prepare('DELETE FROM leave_balance WHERE employeeId = ?').run('employee-123');

  // Insert test balance
  db.prepare(`
    INSERT INTO leave_balance (id, employeeId, locationId, leaveType, balance, pendingDeductions, version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'employee-123', 'loc-1', 'ANNUAL', 20.0, 0, 1);

  console.log('Successfully seeded database with employee-123 (ANNUAL: 20 days)');
} catch (error) {
  console.error('Seed failed:', error.message);
} finally {
  db.close();
}
