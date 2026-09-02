import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Merchant Agent Gateway (MAG) Server Running`);
  console.log(`📡 Port: ${config.PORT}`);
  console.log(`🛡️ Mode: ${config.NODE_ENV} (TEST / DEMO)`);
  console.log(`🔗 Health: http://localhost:${config.PORT}/api/health`);
  console.log(`📜 Manifest: http://localhost:${config.PORT}/api/capabilities/manifest`);
  console.log(`=================================================`);
});
