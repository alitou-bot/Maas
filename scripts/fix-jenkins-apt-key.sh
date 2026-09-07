#!/usr/bin/env bash
# Fix Jenkins apt repo GPG key (NO_PUBKEY 7198F4B714ABFC68).
# The 2023 key expired March 2026 — use the 2026 key instead.
# Run: sudo bash scripts/fix-jenkins-apt-key.sh
set -euo pipefail

echo "==> 1. Remove stale Jenkins sources/keys"
rm -f /etc/apt/sources.list.d/jenkins.list
rm -f /usr/share/keyrings/jenkins-keyring.asc /usr/share/keyrings/jenkins-keyring.gpg

echo "==> 2. Download 2026 Jenkins signing key"
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key \
  | tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null

echo "==> 3. Verify key file type"
file /usr/share/keyrings/jenkins-keyring.asc

echo "==> 4. Re-add Jenkins apt repository"
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  > /etc/apt/sources.list.d/jenkins.list

echo "==> 5. Set readable permissions"
chmod a+r /usr/share/keyrings/jenkins-keyring.asc

echo "==> 6. apt update"
apt update

echo ""
echo "Done. Install Jenkins with: sudo apt install -y openjdk-21-jre jenkins"
