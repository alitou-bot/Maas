import {
  getServerOsLabel,
  isWindowsOs,
  normalizeServerOs,
  type ServerOsType,
} from './server-os';

export interface InstallScriptParams {
  token: string;
  expiresIso: string;
  zabbixServerIp: string;
  backendUrl: string;
  pskIdentity: string;
  pskKey: string;
  os: string;
}

export function buildInstallScript(params: InstallScriptParams): string {
  if (isWindowsOs(params.os)) {
    return buildWindowsInstallScript(params);
  }
  return buildLinuxInstallScript(params);
}

function buildLinuxInstallScript(params: InstallScriptParams): string {
  const osType = normalizeServerOs(params.os);
  const osLabel = getServerOsLabel(params.os);
  const generatedAt = new Date().toISOString();

  return `#!/bin/bash
# ─────────────────────────────────────────────
# MAAS Dashboard Pro — Agent installer
# Token: ${params.token}
# Expires: ${params.expiresIso}
# Target OS: ${osLabel}
# Single use — do not share this script
# ─────────────────────────────────────────────
set -e

ZABBIX_SERVER="${params.zabbixServerIp}"
PSK_IDENTITY="${params.pskIdentity}"
PSK_KEY="${params.pskKey}"
BACKEND_URL="${params.backendUrl}"
INSTALL_TOKEN="${params.token}"
MAAS_OS="${osType}"
MAAS_OS_LABEL="${osLabel}"

echo "──────────────────────────────────────────"
echo " MAAS Dashboard Pro — Agent Installer"
echo "──────────────────────────────────────────"

# ── Detect hostname from this machine ──────────
HOSTNAME=$(hostname -f 2>/dev/null || hostname)
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "0.0.0.0")

echo "Target OS         : $MAAS_OS_LABEL"
echo "Detected hostname : $HOSTNAME"
echo "Detected IP       : $IP"
echo "Zabbix server     : $ZABBIX_SERVER"
echo ""

# Fully non-interactive package installs (no conffile prompts)
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# Wait until apt/dpkg locks are free (another update may be running)
wait_for_apt() {
  local waited=0
  local max_wait=300
  while true; do
    if fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \\
      || fuser /var/lib/dpkg/lock >/dev/null 2>&1 \\
      || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 \\
      || fuser /var/cache/apt/archives/lock >/dev/null 2>&1; then
      if [ "$waited" -eq 0 ]; then
        echo "Waiting for another apt/dpkg process to finish..."
      fi
      if [ "$waited" -ge "$max_wait" ]; then
        echo "ERROR: apt/dpkg still locked after \${max_wait}s."
        echo "Run:  sudo lsof /var/lib/dpkg/lock-frontend"
        echo "Then retry this install command."
        exit 1
      fi
      sleep 5
      waited=$((waited + 5))
      continue
    fi
    break
  done
  if [ "$waited" -gt 0 ]; then
    echo "apt/dpkg is free — continuing (waited \${waited}s)"
  fi
}

backup_agent_configs() {
  if [ -f /etc/zabbix/zabbix_agentd.conf ]; then
    mv -f /etc/zabbix/zabbix_agentd.conf /etc/zabbix/zabbix_agentd.conf.maas-bak
  fi
  if [ -f /etc/zabbix/zabbix_agent2.conf ]; then
    mv -f /etc/zabbix/zabbix_agent2.conf /etc/zabbix/zabbix_agent2.conf.maas-bak
  fi
}

install_zabbix_agent_apt() {
  wait_for_apt
  if ! apt-get install -y -qq \\
      -o Dpkg::Options::="--force-confdef" \\
      -o Dpkg::Options::="--force-confold" \\
      --allow-downgrades \\
      zabbix-agent; then
    echo "Zabbix 6.4 package unavailable — falling back to distro zabbix-agent"
    rm -f /etc/apt/preferences.d/zabbix-agent
    wait_for_apt
    apt-get update -qq || true
    wait_for_apt
    apt-get install -y -qq \\
      -o Dpkg::Options::="--force-confdef" \\
      -o Dpkg::Options::="--force-confold" \\
      zabbix-agent
  fi
}

install_ubuntu_agent() {
  echo "Installing Zabbix agent (Ubuntu)..."
  wait_for_apt
  . /etc/os-release 2>/dev/null || true
  UBUNTU_MAJOR=\$(echo "\${VERSION_ID:-22.04}" | cut -d. -f1)

  if [ "\$UBUNTU_MAJOR" -le 24 ] 2>/dev/null; then
    case "\${VERSION_ID}" in
      24.*) REL_DEB="zabbix-release_6.4-1+ubuntu24.04_all.deb" ;;
      22.*) REL_DEB="zabbix-release_6.4-1+ubuntu22.04_all.deb" ;;
      20.*) REL_DEB="zabbix-release_6.4-1+ubuntu20.04_all.deb" ;;
      *)    REL_DEB="zabbix-release_6.4-1+ubuntu22.04_all.deb" ;;
    esac
    wget -q "https://repo.zabbix.com/zabbix/6.4/ubuntu/pool/main/z/zabbix-release/\$REL_DEB" -O /tmp/zabbix-release.deb \\
      && dpkg -i /tmp/zabbix-release.deb >/dev/null || true
    wait_for_apt
    apt-get update -qq || true
    mkdir -p /etc/apt/preferences.d
    cat > /etc/apt/preferences.d/zabbix-agent << 'PIN'
Package: zabbix-agent
Pin: version 1:6.4.*
Pin-Priority: 1001
PIN
  else
    rm -f /etc/apt/preferences.d/zabbix-agent
    wait_for_apt
    apt-get update -qq || true
  fi

  backup_agent_configs
  install_zabbix_agent_apt
}

install_debian_agent() {
  echo "Installing Zabbix agent (Debian)..."
  wait_for_apt
  . /etc/os-release 2>/dev/null || true
  case "\${VERSION_ID:-12}" in
    12|12.*) REL_DEB="zabbix-release_6.4-1+debian12_all.deb" ;;
    11|11.*) REL_DEB="zabbix-release_6.4-1+debian11_all.deb" ;;
    10|10.*) REL_DEB="zabbix-release_6.4-1+debian10_all.deb" ;;
    *)     REL_DEB="zabbix-release_6.4-1+debian12_all.deb" ;;
  esac
  wget -q "https://repo.zabbix.com/zabbix/6.4/debian/pool/main/z/zabbix-release/\$REL_DEB" -O /tmp/zabbix-release.deb \\
    && dpkg -i /tmp/zabbix-release.deb >/dev/null || true
  wait_for_apt
  apt-get update -qq || true
  mkdir -p /etc/apt/preferences.d
  cat > /etc/apt/preferences.d/zabbix-agent << 'PIN'
Package: zabbix-agent
Pin: version 1:6.4.*
Pin-Priority: 1001
PIN
  backup_agent_configs
  install_zabbix_agent_apt
}

install_kali_agent() {
  echo "Installing Zabbix agent (Kali Linux)..."
  wait_for_apt
  apt-get update -qq || true
  backup_agent_configs
  if apt-get install -y -qq \\
      -o Dpkg::Options::="--force-confdef" \\
      -o Dpkg::Options::="--force-confold" \\
      zabbix-agent 2>/dev/null; then
    return 0
  fi
  echo "Kali package unavailable — trying Zabbix Debian repository..."
  REL_DEB="zabbix-release_6.4-1+debian12_all.deb"
  wget -q "https://repo.zabbix.com/zabbix/6.4/debian/pool/main/z/zabbix-release/\$REL_DEB" -O /tmp/zabbix-release.deb \\
    && dpkg -i /tmp/zabbix-release.deb >/dev/null || true
  wait_for_apt
  apt-get update -qq || true
  install_zabbix_agent_apt
}

install_rhel_agent() {
  echo "Installing Zabbix agent (RHEL family)..."
  RHEL_VERSION=\$(rpm -E %{rhel} 2>/dev/null || echo "9")
  rpm -Uvh "https://repo.zabbix.com/zabbix/6.4/rhel/\$RHEL_VERSION/x86_64/zabbix-release-6.4-1.el\$RHEL_VERSION.noarch.rpm"
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y -q zabbix-agent
  else
    yum install -y -q zabbix-agent
  fi
}

resolve_install_family() {
  if [ "$MAAS_OS" != "other" ]; then
    INSTALL_FAMILY="$MAAS_OS"
    return 0
  fi
  echo "Auto-detecting OS family..."
  if [ -f /etc/debian_version ]; then
    . /etc/os-release 2>/dev/null || true
    ID_LOWER=\$(echo "\${ID:-unknown}" | tr '[:upper:]' '[:lower:]')
    case "\$ID_LOWER" in
      kali*) INSTALL_FAMILY="kali" ;;
      ubuntu*) INSTALL_FAMILY="ubuntu" ;;
      debian*) INSTALL_FAMILY="debian" ;;
      *) INSTALL_FAMILY="debian" ;;
    esac
  elif [ -f /etc/redhat-release ]; then
    INSTALL_FAMILY="rhel"
  else
    echo "ERROR: Unsupported OS. Select the correct OS in Add Server or install the agent manually."
    exit 1
  fi
  echo "Auto-detected family: \$INSTALL_FAMILY"
}

# ── Stop any existing agents ────────────────────
systemctl stop zabbix-agent2 2>/dev/null || true
systemctl disable zabbix-agent2 2>/dev/null || true
systemctl stop zabbix-agent 2>/dev/null || true

# ── Install classic Zabbix Agent (OpenSSL PSK) ──
resolve_install_family
case "$INSTALL_FAMILY" in
  ubuntu) install_ubuntu_agent ;;
  debian) install_debian_agent ;;
  kali)   install_kali_agent ;;
  rhel)   install_rhel_agent ;;
  *)
    echo "ERROR: Unsupported install family: $INSTALL_FAMILY"
    exit 1
    ;;
esac

echo "✓ Zabbix Agent installed"

# ── Write PSK encryption key (no trailing newline) ─
mkdir -p /etc/zabbix/zabbix_agentd.d /var/log/zabbix /run/zabbix
chown zabbix:zabbix /var/log/zabbix /run/zabbix 2>/dev/null || true
printf '%s' "$PSK_KEY" > /etc/zabbix/maas.psk
chmod 600 /etc/zabbix/maas.psk
chown zabbix:zabbix /etc/zabbix/maas.psk
echo "✓ PSK key written"

# ── Write agent config (always overwrite — no prompts) ─
cat > /etc/zabbix/zabbix_agentd.conf << EOF
# MAAS Dashboard Pro agent config
# Generated: ${generatedAt}

PidFile=/run/zabbix/zabbix_agentd.pid
LogFile=/var/log/zabbix/zabbix_agentd.log
LogFileSize=0

# Passive checks — allow Zabbix server (host + Docker bridge ranges)
Server=$ZABBIX_SERVER,127.0.0.1,172.16.0.0/12,10.0.0.0/8
ListenPort=10050

# Active mode — agent initiates connection outward
ServerActive=$ZABBIX_SERVER:10051
Hostname=$HOSTNAME
RefreshActiveChecks=120

# docker stats UserParameter can take a few seconds
Timeout=15

# PSK encryption — unique to this server
TLSConnect=psk
TLSAccept=psk
TLSPSKIdentity=$PSK_IDENTITY
TLSPSKFile=/etc/zabbix/maas.psk

Include=/etc/zabbix/zabbix_agentd.d/*.conf
EOF

echo "✓ Agent config written"

# ── Docker monitoring via UserParameter (classic agent) ─
usermod -aG docker zabbix 2>/dev/null || true
mkdir -p /etc/systemd/system/zabbix-agent.service.d
cat > /etc/systemd/system/zabbix-agent.service.d/docker.conf << 'EOF'
[Service]
SupplementaryGroups=docker
EOF
systemctl daemon-reload >/dev/null 2>&1 || true
cat > /usr/local/bin/maas-processes.py << 'PYEOF'
#!/usr/bin/env python3
import collections, json, pathlib
procs = []
for p in pathlib.Path("/proc").iterdir():
    if not p.name.isdigit():
        continue
    try:
        name = open(p / "comm").read().strip()
        rss = 0
        for line in open(p / "status"):
            if line.startswith("VmRSS:"):
                rss = int(line.split()[1]) * 1024
                break
        procs.append((name, rss))
    except Exception:
        pass
agg = collections.defaultdict(lambda: {"name": "", "instances": 0, "memoryBytes": 0})
for name, rss in procs:
    a = agg[name]
    a["name"] = name
    a["instances"] += 1
    a["memoryBytes"] += rss
rows = sorted(agg.values(), key=lambda x: -x["memoryBytes"])[:40]
for r in rows:
    r["cpuPercent"] = 0
    r["status"] = "running"
print(json.dumps(rows))
PYEOF
chmod 755 /usr/local/bin/maas-processes.py

cat > /usr/local/bin/maas-services.py << 'PYEOF'
#!/usr/bin/env python3
"""Discover listening TCP ports (ss preferred, /proc fallback)."""
import json, os, pathlib, re, subprocess

def inode_process_map():
    mapping = {}
    for p in pathlib.Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            comm = open(p / "comm").read().strip()
        except Exception:
            continue
        try:
            for fd in (p / "fd").iterdir():
                try:
                    target = os.readlink(fd)
                except Exception:
                    continue
                if target.startswith("socket:[") and target.endswith("]"):
                    mapping[target[8:-1]] = comm
        except Exception:
            pass
    return mapping

def via_ss():
    r = subprocess.run(
        ["ss", "-H", "-tlnp"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        return None
    rows, seen = [], set()
    for line in r.stdout.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[3]
        m = re.search(r":(\\d+)$", local)
        if not m:
            continue
        port = int(m.group(1))
        if port <= 0 or port in seen:
            continue
        seen.add(port)
        proc = ""
        um = re.search(r'"([^"]+)"', line)
        if um:
            proc = um.group(1)
        rows.append({"port": port, "process": proc, "address": local})
    return rows

def via_proc():
    inodes = inode_process_map()
    rows, seen = [], set()
    for path in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            lines = open(path).read().splitlines()[1:]
        except Exception:
            continue
        for line in lines:
            cols = line.split()
            if len(cols) < 10:
                continue
            if cols[3] != "0A":
                continue
            try:
                port = int(cols[1].split(":")[1], 16)
            except Exception:
                continue
            if port <= 0 or port in seen:
                continue
            seen.add(port)
            rows.append({
                "port": port,
                "process": inodes.get(cols[9], ""),
                "address": cols[1],
            })
    return rows

rows = via_ss()
if rows is None:
    rows = via_proc()
rows.sort(key=lambda r: r["port"])
print(json.dumps(rows))
PYEOF
chmod 755 /usr/local/bin/maas-services.py

cat > /usr/local/bin/maas-docker-containers.py << 'PYEOF'
#!/usr/bin/env python3
"""List Docker containers with CPU/memory (classic agent — no docker.* keys)."""
import json, re, subprocess

_UNIT = {
    "B": 1,
    "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4,
    "KIB": 1024, "MIB": 1024**2, "GIB": 1024**3, "TIB": 1024**4,
}

def parse_bytes(text):
    m = re.match(r"^([0-9.]+)\\s*([KMGTPE]?i?B)$", str(text or "").strip(), re.I)
    if not m:
        return 0
    return int(float(m.group(1)) * _UNIT.get(m.group(2).upper(), 1))

def parse_mem_usage(mem_usage):
    parts = [p.strip() for p in str(mem_usage or "").split("/", 1)]
    used = parse_bytes(parts[0]) if parts else 0
    limit = parse_bytes(parts[1]) if len(parts) > 1 else 0
    return used, limit

def parse_cpu(cpu_perc):
    try:
        return float(str(cpu_perc).replace("%", "").strip() or 0)
    except Exception:
        return 0.0

ps = subprocess.run(
    ["docker", "ps", "-a", "--format", "{{json .}}"],
    capture_output=True, text=True,
)
if ps.returncode != 0:
    print("[]")
    raise SystemExit(0)

stats_by_name = {}
st = subprocess.run(
    ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
    capture_output=True, text=True,
)
if st.returncode == 0:
    for line in st.stdout.splitlines():
        if not line.strip():
            continue
        try:
            s = json.loads(line)
        except Exception:
            continue
        name = str(s.get("Name") or "").lstrip("/")
        if not name:
            continue
        used, limit = parse_mem_usage(s.get("MemUsage", ""))
        stats_by_name[name] = {
            "cpuPercent": parse_cpu(s.get("CPUPerc")),
            "memoryUsed": used,
            "memoryLimit": limit,
        }

rows = []
for line in ps.stdout.splitlines():
    if not line.strip():
        continue
    try:
        c = json.loads(line)
    except Exception:
        continue
    name = str(c.get("Names") or "").lstrip("/")
    stats = stats_by_name.get(name, {})
    rows.append({
        "Names": [name],
        "Image": c.get("Image", ""),
        "State": c.get("State", ""),
        "Status": c.get("Status", ""),
        "cpuPercent": stats.get("cpuPercent", 0),
        "memoryUsed": stats.get("memoryUsed", 0),
        "memoryLimit": stats.get("memoryLimit", 0),
    })
print(json.dumps(rows))
PYEOF
chmod 755 /usr/local/bin/maas-docker-containers.py

cat > /usr/local/bin/maas-watch.py << 'PYEOF'
#!/usr/bin/env python3
"""Per-entity watch helpers for MAAS UserParameters."""
import json, re, subprocess, sys

def container_state(name):
    name = name.lstrip("/")
    ps = subprocess.run(
        ["docker", "ps", "-a", "--format", "{{json .}}"],
        capture_output=True, text=True,
    )
    if ps.returncode != 0:
        return "missing"
    for line in ps.stdout.splitlines():
        if not line.strip():
            continue
        try:
            c = json.loads(line)
        except Exception:
            continue
        cname = str(c.get("Names") or "").lstrip("/")
        if cname != name:
            continue
        state = str(c.get("State") or "").lower()
        return "running" if state == "running" else (state or "stopped")
    return "missing"

def service_port(port):
    try:
        port_num = int(port)
    except Exception:
        return "0"
    ss = subprocess.run(["ss", "-H", "-tln"], capture_output=True, text=True)
    if ss.returncode != 0:
        return "0"
    for line in ss.stdout.splitlines():
        if re.search(rf":{port_num}\\b", line):
            return "1"
    return "0"

def process_count(name):
    pg = subprocess.run(["pgrep", "-x", name], capture_output=True, text=True)
    if pg.returncode == 0 and pg.stdout.strip():
        return str(len(pg.stdout.strip().splitlines()))
    return "0"

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("missing")
        raise SystemExit(0)
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "container-state":
        print(container_state(arg))
    elif cmd == "service-port":
        print(service_port(arg))
    elif cmd == "process-count":
        print(process_count(arg))
    else:
        print("missing")
PYEOF
chmod 755 /usr/local/bin/maas-watch.py

cat > /etc/zabbix/zabbix_agentd.d/maas_docker.conf << 'UPEOF'
# MAAS — classic-agent UserParameters
UserParameter=maas.docker.containers,/usr/local/bin/maas-docker-containers.py
UserParameter=maas.processes,/usr/local/bin/maas-processes.py
UserParameter=maas.services,/usr/local/bin/maas-services.py
UserParameter=maas.watch.container.state[*],/usr/local/bin/maas-watch.py container-state $1
UserParameter=maas.watch.service.port[*],/usr/local/bin/maas-watch.py service-port $1
UserParameter=maas.watch.process.count[*],/usr/local/bin/maas-watch.py process-count $1
UPEOF
echo "✓ Docker/process/services UserParameters written"

# ── Start agent ─────────────────────────────────
systemctl enable zabbix-agent >/dev/null 2>&1 || true
systemctl restart zabbix-agent
echo "✓ Agent started"

# ── Report back to MAAS backend ─────────────────
echo "Registering with MAAS backend..."
curl -sf -X POST \\
  "$BACKEND_URL/api/v1/servers/install/$INSTALL_TOKEN/confirm" \\
  -H "Content-Type: application/json" \\
  -d "{\\"hostname\\": \\"$HOSTNAME\\", \\"ip\\": \\"$IP\\"}" \\
  && echo "✓ Registered with MAAS" \\
  || echo "⚠ Could not reach MAAS backend — agent will still connect"

echo ""
echo "──────────────────────────────────────────"
echo " Installation complete"
echo " Hostname : $HOSTNAME"
echo " OS       : $MAAS_OS_LABEL"
echo " Server   : $ZABBIX_SERVER"
echo " Status   : Agent connecting..."
echo ""
echo " Your server will appear as monitored"
echo " in MAAS Dashboard within 2 minutes."
echo "──────────────────────────────────────────"
`;
}

function buildWindowsInstallScript(params: InstallScriptParams): string {
  const osLabel = getServerOsLabel(params.os);
  const generatedAt = new Date().toISOString();
  const confDir = 'C:\\Program Files\\Zabbix Agent';
  const pskFile = `${confDir}\\maas.psk`;

  return `# MAAS Dashboard Pro — Windows Agent installer
# Token: ${params.token}
# Expires: ${params.expiresIso}
# Target OS: ${osLabel}
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$ZabbixServer = '${params.zabbixServerIp}'
$PskIdentity = '${params.pskIdentity}'
$PskKey = '${params.pskKey}'
$BackendUrl = '${params.backendUrl}'
$InstallToken = '${params.token}'
$MaasOsLabel = '${osLabel}'

Write-Host "──────────────────────────────────────────"
Write-Host " MAAS Dashboard Pro — Agent Installer"
Write-Host "──────────────────────────────────────────"
Write-Host "Target OS         : $MaasOsLabel"

$Hostname = $env:COMPUTERNAME
$Ip = (
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.PrefixOrigin -ne 'WellKnown' -and
    $_.IPAddress -notlike '169.254.*'
  } |
  Select-Object -First 1
).IPAddress
if (-not $Ip) { $Ip = '0.0.0.0' }

Write-Host "Detected hostname : $Hostname"
Write-Host "Detected IP       : $Ip"
Write-Host "Zabbix server     : $ZabbixServer"
Write-Host ""

$MsiUrl = 'https://cdn.zabbix.com/zabbix/binaries/stable/6.4/6.4.21/zabbix_agent-6.4.21-windows-amd64-openssl.msi'
$MsiPath = Join-Path $env:TEMP 'zabbix_agent.maas.msi'

Write-Host "Downloading Zabbix Agent 6.4..."
Invoke-WebRequest -Uri $MsiUrl -OutFile $MsiPath -UseBasicParsing

Write-Host "Installing Zabbix Agent..."
$installArgs = @(
  '/i', $MsiPath,
  '/qn',
  "SERVER=$ZabbixServer",
  "SERVERACTIVE=$ZabbixServer",
  "HOSTNAME=$Hostname",
  'ENABLEPATH=1'
)
Start-Process -FilePath 'msiexec.exe' -ArgumentList $installArgs -Wait -NoNewWindow

$AgentDir = '${confDir}'
if (-not (Test-Path $AgentDir)) {
  throw "Zabbix Agent directory not found after install: $AgentDir"
}

Set-Content -Path '${pskFile}' -Value $PskKey -NoNewline -Encoding ASCII

$config = @"
# MAAS Dashboard Pro agent config
# Generated: ${generatedAt}

LogFile=$AgentDir\\zabbix_agentd.log
LogFileSize=0

Server=$ZabbixServer,127.0.0.1
ListenPort=10050

ServerActive=$ZabbixServer\`:10051
Hostname=$Hostname
RefreshActiveChecks=120

Timeout=15

TLSConnect=psk
TLSAccept=psk
TLSPSKIdentity=$PskIdentity
TLSPSKFile=${pskFile.replace(/\\/g, '\\\\')}
"@

Set-Content -Path (Join-Path $AgentDir 'zabbix_agentd.conf') -Value $config -Encoding ASCII
Write-Host "✓ Agent config written"

$service = Get-Service -Name 'Zabbix Agent' -ErrorAction SilentlyContinue
if ($service) {
  Restart-Service -Name 'Zabbix Agent' -Force
  Write-Host "✓ Agent started"
} else {
  Write-Warning "Zabbix Agent service not found — start it manually from services.msc"
}

Write-Host "Registering with MAAS backend..."
try {
  $body = @{ hostname = $Hostname; ip = $Ip } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$BackendUrl/api/v1/servers/install/$InstallToken/confirm" \`
    -Method Post -Body $body -ContentType 'application/json' | Out-Null
  Write-Host "✓ Registered with MAAS"
} catch {
  Write-Warning "Could not reach MAAS backend — agent will still connect"
}

Write-Host ""
Write-Host "──────────────────────────────────────────"
Write-Host " Installation complete"
Write-Host " Hostname : $Hostname"
Write-Host " OS       : $MaasOsLabel"
Write-Host " Server   : $ZabbixServer"
Write-Host " Status   : Agent connecting..."
Write-Host "──────────────────────────────────────────"
`;
}

/** @internal exported for tests */
export function resolveOsTypeForScript(os: string): ServerOsType {
  return normalizeServerOs(os);
}
