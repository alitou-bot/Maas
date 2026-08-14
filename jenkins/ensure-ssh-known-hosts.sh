#!/usr/bin/env bash
set -euo pipefail

JENKINS_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$JENKINS_DIR/.ssh"
if [[ ! -f "$JENKINS_DIR/.ssh/known_hosts" ]]; then
  ssh-keyscan github.com >> "$JENKINS_DIR/.ssh/known_hosts" 2>/dev/null
fi
