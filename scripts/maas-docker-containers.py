#!/usr/bin/env python3
"""List Docker containers with CPU/memory (classic agent — no docker.* keys)."""
import json, re, subprocess

_UNIT = {
    "B": 1,
    "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4,
    "KIB": 1024, "MIB": 1024**2, "GIB": 1024**3, "TIB": 1024**4,
}

def parse_bytes(text):
    m = re.match(r"^([0-9.]+)\s*([KMGTPE]?i?B)$", str(text or "").strip(), re.I)
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
