import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createContainer, initializeKernel } from './container.js';

const config = loadConfig();
const container = createContainer(config);
await initializeKernel(container, config);

createApp(container).listen(config.port, () => {
  console.log(`HRU DAC shell listening on http://localhost:${config.port} (db: ${config.dbPath})`);
});
