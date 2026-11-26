import json
import os
import sys
import time
import urllib.error
import urllib.request

PORTAINER_URL = os.environ.get("PORTAINER_URL", "https://portainer.cawa.work").rstrip("/")
PORTAINER_ENDPOINT_ID = os.environ.get("PORTAINER_ENDPOINT_ID", "3")
PORTAINER_API_KEY = os.environ["PORTAINER_API_KEY"]
CONTAINER_NAME = os.environ.get("CONTAINER_NAME", "latvian-tutor")
IMAGE_NAME = os.environ.get("IMAGE_NAME", "latvian-tutor:latest")
HEALTH_URL = os.environ.get("HEALTH_URL", "https://learn-latvian.cawa.work/api/health")

DOCKER_BASE = f"{PORTAINER_URL}/api/endpoints/{PORTAINER_ENDPOINT_ID}/docker"
JSON_HEADERS = {
    "X-API-Key": PORTAINER_API_KEY,
    "Content-Type": "application/json",
}


def docker_req(method, path, payload=None, timeout=60):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        DOCKER_BASE + path,
        data=data,
        headers=JSON_HEADERS,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Docker API {method} {path} failed with HTTP {exc.code}: {body}")


def main():
    status, existing = docker_req("GET", f"/containers/{CONTAINER_NAME}/json")
    if status != 200 or not existing:
        raise RuntimeError(f"Existing container {CONTAINER_NAME} not found on Portainer")

    config = existing.get("Config", {})
    host_config = existing.get("HostConfig", {})

    recreate_payload = {
        "Image": IMAGE_NAME,
        "Env": config.get("Env", []),
        "ExposedPorts": config.get("ExposedPorts", {"3000/tcp": {}}),
        "HostConfig": {
            "PortBindings": host_config.get(
                "PortBindings",
                {"3000/tcp": [{"HostIp": "0.0.0.0", "HostPort": "3012"}]},
            ),
            "Binds": host_config.get("Binds", ["/mnt/data/latvian-tutor:/app/data"]),
            "RestartPolicy": host_config.get("RestartPolicy", {"Name": "unless-stopped"}),
        },
    }

    print(f"Stopping existing container {CONTAINER_NAME}...")
    try:
        docker_req("POST", f"/containers/{CONTAINER_NAME}/stop?t=10")
    except RuntimeError as exc:
        if "HTTP 304" not in str(exc) and "HTTP 404" not in str(exc):
            raise

    print(f"Removing existing container {CONTAINER_NAME}...")
    docker_req("DELETE", f"/containers/{CONTAINER_NAME}?force=1")

    print(f"Creating container {CONTAINER_NAME} from {IMAGE_NAME}...")
    _, created = docker_req(
        "POST",
        f"/containers/create?name={CONTAINER_NAME}",
        recreate_payload,
    )
    new_id = created["Id"]
    print(f"Created container {new_id[:12]}")

    print(f"Starting container {new_id[:12]}...")
    docker_req("POST", f"/containers/{new_id}/start")

    print(f"Waiting for health check at {HEALTH_URL}...")
    deadline = time.time() + 45
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if resp.status == 200 and data.get("status") == "ok":
                    print("Health check passed:", json.dumps(data))
                    break
                last_error = f"Unexpected response: {resp.status} {data}"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(2)
    else:
        raise RuntimeError(f"Post-deploy health check failed: {last_error}")

    print("Pruning dangling Docker images...")
    try:
        _, prune = docker_req("POST", "/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D")
        reclaimed = (prune or {}).get("SpaceReclaimed", 0)
        print(f"Pruned dangling images, reclaimed {reclaimed} bytes")
    except Exception as exc:
        print(f"Warning: image prune skipped ({exc})")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(str(err), file=sys.stderr)
        sys.exit(1)
