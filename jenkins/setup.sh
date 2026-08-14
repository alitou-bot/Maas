#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JENKINS_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$JENKINS_DIR"

export PATH="$HOME/.local/bin:$PATH"

echo "==> MAAS Jenkins setup"

# Docker Hub credentials for pushing images
if [[ ! -f .env ]]; then
  DOCKER_USER="${DOCKERHUB_USER:-alansibi}"
  DOCKER_PASS="${DOCKERHUB_PASS:-}"

  if [[ -z "$DOCKER_PASS" && -f "$HOME/.docker/config.json" ]]; then
    DOCKER_PASS="$(python3 - <<'PY'
import base64, json, os
path = os.path.expanduser("~/.docker/config.json")
with open(path) as f:
    auth = json.load(f)["auths"]["https://index.docker.io/v1/"]["auth"]
print(base64.b64decode(auth).decode().split(":", 1)[1])
PY
)"
  fi

  if [[ -z "$DOCKER_PASS" ]]; then
    echo "Set DOCKERHUB_PASS or log in with: docker login"
    exit 1
  fi

  DOCKER_GID="$(getent group docker | cut -d: -f3)"
  cat > .env <<EOF
DOCKERHUB_USER=${DOCKER_USER}
DOCKERHUB_PASS=${DOCKER_PASS}
DOCKER_GID=${DOCKER_GID}
MINIKUBE_HOME=${HOME}/.minikube
GITHUB_SSH_KEY=${HOME}/.ssh/id_ed25519
EOF
  chmod 600 .env
  echo "Created jenkins/.env (gitignored)"
fi

if ! docker network inspect minikube >/dev/null 2>&1; then
  echo "Minikube network not found. Start minikube first: minikube start"
  exit 1
fi

echo "==> Building Jenkins image (first run may take a few minutes)..."
docker compose build

echo "==> Starting Jenkins..."
docker compose up -d

echo "==> Waiting for Jenkins to become ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8081/login >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

if ! curl -sf http://localhost:8081/login >/dev/null 2>&1; then
  echo "Jenkins did not start in time. Check: docker compose logs -f"
  exit 1
fi

echo
echo "Jenkins is running at: http://localhost:8081"
echo
echo "Next steps:"
echo "  1. Push Jenkinsfile to GitHub (required for the pipeline job):"
echo "       git add Jenkinsfile jenkins/"
echo "       git commit -m 'Add Jenkins CI/CD pipeline'"
echo "       git push origin main"
echo
echo "  2. Open Jenkins → job 'maas-ci-cd' → Build Now"
echo
echo "  3. GitHub webhook (optional, for instant builds on push):"
echo "       Repo → Settings → Webhooks → Add webhook"
echo "       Payload URL: http://<your-public-ip-or-ngrok>:8081/github-webhook/"
echo "       Content type: application/json"
echo "       Events: Just the push event"
echo "     Without a public URL, Jenkins polls GitHub every 2 minutes."
echo
echo "Logs:  cd jenkins && docker compose logs -f"
echo "Stop:  cd jenkins && docker compose down"
