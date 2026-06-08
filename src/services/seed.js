require('dotenv').config();
const fs = require('fs');
const { ensureDb, DB_FILE } = require('./db');
ensureDb();
console.log(`Database ready: ${DB_FILE}`);
console.log(fs.readFileSync(DB_FILE, 'utf8').slice(0, 500) + '...');
