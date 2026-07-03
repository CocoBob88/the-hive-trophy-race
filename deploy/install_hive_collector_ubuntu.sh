#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/the-hive-trophy-race}"
ENV_DIR="${ENV_DIR:-/etc/the-hive-trophy-race}"
REPO_URL="${REPO_URL:-https://github.com/CocoBob88/the-hive-trophy-race.git}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "${APP_DIR}" "${ENV_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
npm ci --omit=dev

if [[ ! -f "${ENV_DIR}/collector.env" ]]; then
  install -m 600 deploy/collector.env.example "${ENV_DIR}/collector.env"
  echo "Created ${ENV_DIR}/collector.env. Add the VPS-allowlisted Brawl API token before starting the timer."
fi

cp deploy/the-hive-trophy-race-collector.service /etc/systemd/system/the-hive-trophy-race-collector.service
cp deploy/the-hive-trophy-race-collector.timer /etc/systemd/system/the-hive-trophy-race-collector.timer
systemctl daemon-reload
systemctl enable the-hive-trophy-race-collector.timer

echo "Installed The Hive collector in ${APP_DIR}."
echo "After editing ${ENV_DIR}/collector.env, run:"
echo "  systemctl start the-hive-trophy-race-collector.service"
echo "  systemctl start the-hive-trophy-race-collector.timer"
