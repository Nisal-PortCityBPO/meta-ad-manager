require('./app/config/env');
const http = require('http');
const { attachFrontend, createApiApp } = require('./app');
const connectDB = require('./app/config/db');
const { getStorageDiagnostics } = require('./app/utils/objectStorage');
const adsLaunchService = require('./modules/ads-launch/adsLaunch.service');
const adsManageService = require('./modules/ads-manage/adsManage.service');
const { seedDatabase } = require('./scripts/seedDatabase');

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
    const storage = getStorageDiagnostics();
    console.log(
      storage.provider === 'SPACES'
        ? `Ads media storage: DigitalOcean Spaces (${storage.bucket}/${storage.folder || 'root'})`
        : 'Ads media storage: local filesystem'
    );
    adsLaunchService.schedulePublishSessionQueueRun(15000);
    adsManageService.schedulePublishQueueRun(15000);
  });
}

startServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
