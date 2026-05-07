const dotenv = require('dotenv');
const http = require('http');
const { attachFrontend, createApiApp } = require('./app');
const connectDB = require('./app/config/db');
const { seedDatabase } = require('./scripts/seedDatabase');

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  await connectDB();
  await seedDatabase();

  const app = createApiApp();
  const server = http.createServer(app);
  await attachFrontend(app, { hmrServer: server });

  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
