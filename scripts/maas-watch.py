#!/usr/bin/env python3
"""Per-entity watch helpers for MAAS UserParameters (classic zabbix-agent)."""
import json
import re
import subprocess
import sys


def container_state(name: str) -> str:
    name = name.lstrip("/")
    ps = subprocess.run(
        ["docker", "ps", "-a", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
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
        if state == "running":
            return "running"
        return state or "stopped"
    return "missing"


def service_port(port: str) -> str:
    try:
        port_num = int(port)
    except Exception:
        return "0"
    ss = subprocess.run(["ss", "-H", "-tln"], capture_output=True, text=True)
    if ss.returncode != 0:
        return "0"
    for line in ss.stdout.splitlines():
        if re.search(rf":{port_num}\b", line):
            return "1"
    return "0"


def process_count(name: str) -> str:
    # Prefer pgrep for exact comm match; return 0 when absent.
    pg = subprocess.run(["pgrep", "-x", name], capture_output=True, text=True)
    if pg.returncode == 0 and pg.stdout.strip():
        return str(len(pg.stdout.strip().splitlines()))
    return "0"


def main() -> None:
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


if __name__ == "__main__":
    main()
