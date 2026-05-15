const path = require('path');
const dotenv = require('dotenv');

const backendEnvPath = path.resolve(__dirname, '../../../.env');

dotenv.config({ path: backendEnvPath, quiet: true });
dotenv.config({ quiet: true });

module.exports = {
  backendEnvPath,
};
