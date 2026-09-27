const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['server', 'public', 'scripts', 'test'];
let failed = 0;
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) {
      count++;
      try {
        new vm.Script(fs.readFileSync(full, 'utf8'), { filename: full });
      } catch (err) {
        failed++;
        console.error(`${path.relative(ROOT, full)}: ${err.message}`);
      }
    }
  }
}

DIRS.forEach((d) => walk(path.join(ROOT, d)));
console.log(`Checked ${count} files, ${failed} with syntax errors.`);
process.exit(failed ? 1 : 0);
