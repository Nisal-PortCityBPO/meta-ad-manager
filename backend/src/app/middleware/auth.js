const jwt = require('jsonwebtoken');
const { User } = require('../../modules/users/user.model');

const COOKIE_NAME = 'meat_dashboard_session';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'development-only-secret';
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function createAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  });
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = req.cookies?.[COOKIE_NAME] || bearerToken;

    if (!token) {
      return res.status(401).json({ message: 'Please login to continue' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.sub);

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Session is no longer active' });
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Session expired, please login again' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }

    next();
  };
}

module.exports = {
  COOKIE_NAME,
  authenticate,
  authorize,
  clearAuthCookie,
  createAuthToken,
  getJwtSecret,
  setAuthCookie,
};
