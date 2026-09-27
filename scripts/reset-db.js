const fs = require('fs');
const { DATA_DIR } = require('../server/config');

fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Removed ${DATA_DIR}. Demo data will be re-seeded on next start.`);
