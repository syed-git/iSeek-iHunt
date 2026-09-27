const engine = require('../server/ai/engine');

engine
  .load()
  .then(() => {
    console.log('Models cached.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
