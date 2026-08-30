import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "loadtest_api.py"
spec = importlib.util.spec_from_file_location("loadtest_api", MODULE_PATH)
loadtest_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loadtest_api)


def test_build_summary_calculates_status_latency_and_error_rate():
    summary = loadtest_api.build_summary(
        [
            {"status": 200, "duration_ms": 100},
            {"status": 204, "duration_ms": 200},
            {"status": 500, "duration_ms": 300},
        ],
        total_duration=1.5,
    )

    assert summary["total_requests"] == 3
    assert summary["status_counts"] == {200: 1, 204: 1, 500: 1}
    assert summary["failed_count"] == 1
    assert summary["error_rate"] == 1 / 3
    assert summary["throughput"] == 2
    assert summary["p95_ms"] == 300


def test_exceeds_thresholds_reports_p95_and_error_rate_failures():
    failures = loadtest_api.exceeds_thresholds(
        {
            "p95_ms": 1500,
            "error_rate": 0.05,
        },
        max_p95_ms=1000,
        max_error_rate=0.01,
    )

    assert len(failures) == 2
    assert "p95" in failures[0]
    assert "error rate" in failures[1]


def test_exceeds_thresholds_allows_disabled_p95_and_zero_errors():
    failures = loadtest_api.exceeds_thresholds(
        {
            "p95_ms": 1500,
            "error_rate": 0,
        },
        max_p95_ms=0,
        max_error_rate=0,
    )

    assert failures == []
