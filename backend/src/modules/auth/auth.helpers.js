function normalizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  generateOtp,
  normalizeEmail,
  validatePassword,
};
