const engine = require('../server/ai/engine');
const face = require('../server/ai/face');

Promise.all([engine.load(), face.load()])
  .then(() => {
    console.log(`Models cached (face backend: ${face.state.backend}).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
