#!/usr/bin/env bash
# Install Jenkins on Ubuntu/Debian (system package).
# Run: sudo bash scripts/install-jenkins.sh
set -euo pipefail

JENKINS_PORT="${JENKINS_PORT:-8081}"

echo "==> Step 1: Install Java 21 (Jenkins 2.568+ requires Java 21+)"
apt update
apt install -y fontconfig openjdk-21-jre

echo "==> Step 2: Add Jenkins GPG key (2026 key — 2023 key expired March 2026)"
rm -f /etc/apt/sources.list.d/jenkins.list
rm -f /usr/share/keyrings/jenkins-keyring.asc /usr/share/keyrings/jenkins-keyring.gpg
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key \
  | tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
chmod a+r /usr/share/keyrings/jenkins-keyring.asc
file /usr/share/keyrings/jenkins-keyring.asc

echo "==> Step 3: Add Jenkins apt repository"
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  > /etc/apt/sources.list.d/jenkins.list

echo "==> Step 4: Install Jenkins"
apt update
apt install -y jenkins

echo "==> Configure Jenkins port ${JENKINS_PORT} (8080 is used by Zabbix on this host)"
if grep -q '^HTTP_PORT=' /etc/default/jenkins 2>/dev/null; then
  sed -i "s/^HTTP_PORT=.*/HTTP_PORT=${JENKINS_PORT}/" /etc/default/jenkins
else
  echo "HTTP_PORT=${JENKINS_PORT}" >> /etc/default/jenkins
fi

# Allow Jenkins to run Docker builds (CI pipeline)
usermod -aG docker jenkins 2>/dev/null || true

echo "==> Step 5: Enable and start Jenkins"
systemctl daemon-reload
systemctl enable jenkins
systemctl restart jenkins

echo "==> Step 6: Service status"
systemctl status jenkins --no-pager || true

echo "==> Step 7: Open firewall port (if UFW is active)"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "${JENKINS_PORT}/tcp"
  echo "UFW: allowed ${JENKINS_PORT}/tcp"
else
  echo "UFW not active — skipping firewall rule"
fi

echo "==> Step 8: Wait for Jenkins to start"
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${JENKINS_PORT}/login" >/dev/null 2>&1; then
    echo "Jenkins is responding on port ${JENKINS_PORT}"
    break
  fi
  sleep 2
done

echo ""
echo "============================================"
echo "  Jenkins URL: http://localhost:${JENKINS_PORT}"
echo "============================================"
echo ""
if [[ -f /var/lib/jenkins/secrets/initialAdminPassword ]]; then
  echo "Initial admin password:"
  cat /var/lib/jenkins/secrets/initialAdminPassword
else
  echo "Password file not ready yet. Retry in a minute:"
  echo "  sudo cat /var/lib/jenkins/secrets/initialAdminPassword"
fi
