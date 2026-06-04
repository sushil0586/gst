#!/usr/bin/env python3
import argparse
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def normalize_base_url(base_url):
    return base_url.rstrip("/")


def post_json(url, payload, timeout):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def login(base_url, email, password, timeout):
    url = f"{normalize_base_url(base_url)}/auth/token/"
    payload = {"email": email, "password": password}
    data = post_json(url, payload, timeout)
    token = data.get("data", {}).get("access")
    if not token:
        raise RuntimeError("Login succeeded but access token was missing from response.")
    return token


def timed_get(base_url, path, token, timeout):
    url = f"{normalize_base_url(base_url)}/{path.lstrip('/')}"
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read()
            return {
                "status": response.status,
                "duration_ms": (time.perf_counter() - started) * 1000,
                "request_id": response.headers.get("X-Request-ID", ""),
            }
    except urllib.error.HTTPError as exc:
        exc.read()
        return {
            "status": exc.code,
            "duration_ms": (time.perf_counter() - started) * 1000,
            "request_id": exc.headers.get("X-Request-ID", ""),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": 0,
            "duration_ms": (time.perf_counter() - started) * 1000,
            "error": str(exc),
            "request_id": "",
        }


def percentile(values, pct):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]


def run_profile(base_url, token, endpoint, concurrency, requests_per_worker, timeout):
    results = []
    lock = threading.Lock()

    def worker(_worker_index):
        worker_results = []
        for _ in range(requests_per_worker):
            worker_results.append(timed_get(base_url, endpoint, token, timeout))
        with lock:
            results.extend(worker_results)

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(worker, index) for index in range(concurrency)]
        for future in as_completed(futures):
            future.result()
    total_duration = time.perf_counter() - started
    return results, total_duration


def summarize(endpoint, results, total_duration):
    durations = [item["duration_ms"] for item in results]
    status_counts = {}
    for item in results:
        status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1

    print(f"\nEndpoint: {endpoint}")
    print(f"Total requests: {len(results)}")
    print(f"Wall time: {total_duration:.2f}s")
    print(f"Throughput: {len(results) / total_duration:.2f} req/s" if total_duration else "Throughput: n/a")
    print(f"Status counts: {status_counts}")
    print(f"Latency avg: {statistics.mean(durations):.1f} ms")
    print(f"Latency p50: {percentile(durations, 50):.1f} ms")
    print(f"Latency p95: {percentile(durations, 95):.1f} ms")
    print(f"Latency max: {max(durations):.1f} ms")


def parse_args():
    parser = argparse.ArgumentParser(description="Lightweight authenticated API load probe for GST Compliance.")
    parser.add_argument("--base-url", default="http://127.0.0.1:7000/api/v1", help="Backend API base URL.")
    parser.add_argument("--email", required=True, help="Login email.")
    parser.add_argument("--password", required=True, help="Login password.")
    parser.add_argument(
        "--endpoint",
        action="append",
        dest="endpoints",
        default=[],
        help="Relative API path to test. Can be passed multiple times.",
    )
    parser.add_argument("--concurrency", type=int, default=5, help="Concurrent worker count.")
    parser.add_argument("--requests-per-worker", type=int, default=10, help="Sequential requests per worker.")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout in seconds.")
    return parser.parse_args()


def main():
    args = parse_args()
    endpoints = args.endpoints or [
        "workspaces/context/",
        "dashboard/summary/",
        "returns/readiness/",
    ]
    try:
        token = login(args.base_url, args.email, args.password, args.timeout)
    except Exception as exc:  # noqa: BLE001
        print(f"Login failed: {exc}", file=sys.stderr)
        return 1

    print(f"Authenticated successfully against {normalize_base_url(args.base_url)}")
    print(
        f"Running {len(endpoints)} endpoint profile(s) with concurrency={args.concurrency}, "
        f"requests_per_worker={args.requests_per_worker}"
    )

    overall_failed = False
    for endpoint in endpoints:
        results, total_duration = run_profile(
            args.base_url,
            token,
            endpoint,
            args.concurrency,
            args.requests_per_worker,
            args.timeout,
        )
        summarize(endpoint, results, total_duration)
        if any(item["status"] not in {200, 204} for item in results):
            overall_failed = True

    return 1 if overall_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
