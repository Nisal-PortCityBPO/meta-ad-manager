#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/var/www/meta-account-manager}"
APP_PORT="${APP_PORT:-4000}"
CONTAINER_NAME="${CONTAINER_NAME:-meta-account-manager}"
DOCKER_NETWORK="${DOCKER_NETWORK:-shared}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-meta-account-manager}"
MONGO_CONTAINER="${MONGO_CONTAINER:-mongo}"
MONGO_VERSION="${MONGO_VERSION:-7}"
MONGO_APP_DATABASE="${MONGO_APP_DATABASE:-meat-dashboard}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is not installed on this VPS." >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is not installed on this VPS." >&2
    exit 1
  fi
}

require_env() {
  if [ -z "$(eval "printf '%s' \"\${$1:-}\"")" ]; then
    echo "$1 is required." >&2
    exit 1
  fi
}

prepare_app_dir() {
  mkdir -p "$APP_DIR"
  cd "$APP_DIR"

  if ! docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
    docker network create "$DOCKER_NETWORK" >/dev/null
  fi
}

deploy_app() {
  require_command docker
  require_env IMAGE
  require_env VERSION

  export COMPOSE_PROJECT_NAME

  mkdir -p "$APP_DIR/storage"
  cd "$APP_DIR"

  if [ ! -f .env.meta ]; then
    echo "Missing $APP_DIR/.env.meta. Create it from .env.meta.example and keep it on the VPS only." >&2
    exit 1
  fi

  if ! docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
    docker network create "$DOCKER_NETWORK" >/dev/null
  fi

  cat > docker-compose.yml <<COMPOSE
services:
  app:
    image: ${IMAGE}:${VERSION}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    ports:
      - "${APP_PORT}:4000"
    env_file:
      - .env.meta
    volumes:
      - ./storage:/app/backend/storage
    networks:
      - app_network

networks:
  app_network:
    name: ${DOCKER_NETWORK}
    external: true
COMPOSE

  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin >/dev/null
  fi

  compose pull app
  compose up -d --remove-orphans

  sleep 10

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null
  else
    echo "curl/wget not available; skipping HTTP smoke test."
  fi

  docker image prune -f >/dev/null 2>&1 || true

  echo "Deployed ${IMAGE}:${VERSION} to ${APP_DIR}."
}

provision_mongo() {
  require_command docker
  require_env MONGO_ROOT_USER
  require_env MONGO_ROOT_PASSWORD
  require_env MONGO_APP_USER
  require_env MONGO_APP_PASSWORD

  export DOCKER_NETWORK MONGO_CONTAINER MONGO_VERSION MONGO_APP_DATABASE
  export MONGO_ROOT_USER MONGO_ROOT_PASSWORD MONGO_APP_USER MONGO_APP_PASSWORD

  prepare_app_dir
  mkdir -p mongo-data mongo-init

  cat > mongo-init/01-create-app-user.js <<'MONGO_INIT'
function readEnv(name) {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }

  if (typeof _getEnv === 'function') {
    return _getEnv(name);
  }

  return null;
}

const databaseName = readEnv('MONGO_APP_DATABASE');
const appUser = readEnv('MONGO_APP_USER');
const appPassword = readEnv('MONGO_APP_PASSWORD');

if (!databaseName || !appUser || !appPassword) {
  throw new Error('Mongo app database, user, and password are required.');
}

const appDb = db.getSiblingDB(databaseName);
const existingUser = appDb.getUser(appUser);

if (existingUser) {
  appDb.updateUser(appUser, {
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: databaseName }],
  });
} else {
  appDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: databaseName }],
  });
}

appDb.deployment_metadata.updateOne(
  { key: 'mongo_provisioned' },
  { $set: { key: 'mongo_provisioned', updatedAt: new Date() } },
  { upsert: true }
);
MONGO_INIT

  cat > docker-compose.mongo.yml <<'COMPOSE'
services:
  mongo:
    image: mongo:${MONGO_VERSION:-7}
    container_name: ${MONGO_CONTAINER:-mongo}
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER:?MONGO_ROOT_USER is required}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}
      MONGO_INITDB_DATABASE: ${MONGO_APP_DATABASE:-meat-dashboard}
      MONGO_APP_DATABASE: ${MONGO_APP_DATABASE:-meat-dashboard}
      MONGO_APP_USER: ${MONGO_APP_USER:?MONGO_APP_USER is required}
      MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}
    volumes:
      - ./mongo-data:/data/db
      - ./mongo-init:/docker-entrypoint-initdb.d:ro
    networks:
      - app_network

networks:
  app_network:
    name: ${DOCKER_NETWORK:-shared}
    external: true
COMPOSE

  compose -f docker-compose.mongo.yml up -d

  echo "MongoDB provisioning started for database '${MONGO_APP_DATABASE}'."
  echo "Use this in .env.meta:"
  echo "MONGO_URI=mongodb://${MONGO_APP_USER}:<MONGO_APP_PASSWORD>@${MONGO_CONTAINER}:27017/${MONGO_APP_DATABASE}?authSource=${MONGO_APP_DATABASE}"
}

usage() {
  echo "Usage: sh deploy.sh [app|mongo]" >&2
  echo "  app   Deploy the application release artifact. This is the default." >&2
  echo "  mongo Provision the MongoDB container and app database user." >&2
}

case "${1:-app}" in
  app)
    deploy_app
    ;;
  mongo)
    provision_mongo
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
