const Database = require('better-sqlite3');
const db = new Database('./data/timeoff.db');
try {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='leave_balance'").get();
  console.log(schema ? schema.sql : 'Table not found');
} catch (e) {
  console.error(e.message);
} finally {
  db.close();
}
