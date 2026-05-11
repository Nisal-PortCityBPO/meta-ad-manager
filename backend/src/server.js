const dotenv = require('dotenv');
const http = require('http');
const { attachFrontend, createApiApp } = require('./app');
const connectDB = require('./app/config/db');
const adsLaunchService = require('./modules/ads-launch/adsLaunch.service');
const adsManageService = require('./modules/ads-manage/adsManage.service');
const { seedDatabase } = require('./scripts/seedDatabase');

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  await connectDB();
  await seedDatabase();

  const app = createApiApp();
  const server = http.createServer(app);
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  await attachFrontend(app, { hmrServer: server });

  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    adsLaunchService.schedulePublishSessionQueueRun(15000);
    adsManageService.schedulePublishQueueRun(15000);
  });
}

startServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
