const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./modules/auth/auth.route');
const usersRoutes = require('./modules/users/users.route');
const profileRoutes = require('./modules/profile/profile.route');
const dashboardRoutes = require('./modules/dashboard/dashboard.route');
const activityLogRoutes = require('./modules/activity-logs/activityLog.route');
const tokenRoutes = require('./modules/token-management/token.route');
const brandRoutes = require('./modules/brands/brand.route');
const agencyRoutes = require('./modules/agencies/agency.route');
const businessProfileRoutes = require('./modules/business-profiles/businessProfile.route');
const socialAccountRoutes = require('./modules/social-accounts/socialAccount.route');
const metaAssetsRoutes = require('./modules/meta-assets/metaAssets.route');
const adsLaunchRoutes = require('./modules/ads-launch/adsLaunch.route');

const frontendRoot = path.resolve(__dirname, '../../frontend');
const frontendDist = path.join(frontendRoot, 'dist');

function getAllowedOrigins() {
  const port = process.env.PORT || 4000;
  const defaults = [process.env.CLIENT_URL || `http://localhost:${port}`];
  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : defaults;

  return configuredOrigins.map((origin) => origin.trim()).filter(Boolean);
}

function corsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error('Not allowed by CORS');
      error.statusCode = 403;
      callback(error);
    },
  };
}

function registerApiRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'meat-dashboard-api',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/activity-logs', activityLogRoutes);
  app.use('/api/tokens', tokenRoutes);
  app.use('/api/meta-assets', metaAssetsRoutes);
  app.use('/api/ads-launch', adsLaunchRoutes);
  app.use('/api/brands', brandRoutes);
  app.use('/api/agencies', agencyRoutes);
  app.use('/api/social-accounts', socialAccountRoutes);
  app.use('/api/business-profiles', businessProfileRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API route not found' });
  });
}

async function registerFrontend(app, hmrServer) {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(frontendDist));
    app.use((req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    return;
  }

  const requireFromFrontend = createRequire(path.join(frontendRoot, 'package.json'));
  const vitePath = requireFromFrontend.resolve('vite');
  const { createServer: createViteServer } = await import(pathToFileURL(vitePath).href);
  const vite = await createViteServer({
    root: frontendRoot,
    server: {
      middlewareMode: true,
      hmr: hmrServer
        ? {
            server: hmrServer,
          }
        : undefined,
    },
    appType: 'spa',
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      const indexPath = path.join(frontendRoot, 'index.html');
      let template = fs.readFileSync(indexPath, 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

function handleErrors(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Something went wrong',
  });
}

function createApiApp() {
  const app = express();

  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '100mb' }));
  app.use(cookieParser());

  registerApiRoutes(app);

  return app;
}

async function attachFrontend(app, { hmrServer } = {}) {
  await registerFrontend(app, hmrServer);
  app.use(handleErrors);

  return app;
}

async function createApp(options = {}) {
  const app = createApiApp();
  return attachFrontend(app, options);
}

module.exports = createApp;
module.exports.attachFrontend = attachFrontend;
module.exports.createApiApp = createApiApp;
