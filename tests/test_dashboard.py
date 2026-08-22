import time
import redis
import pytest
import uvicorn
import threading
from pathlib import Path
from streamlit.testing.v1 import AppTest

from src.api.main import app

# AppTest.from_file() resolves relative paths against the location of the
# file calling it (this test file), not the working directory -- an
# absolute path avoids that surprise entirely rather than working around it.
DASHBOARD_APP_PATH = str(Path(__file__).resolve().parent.parent / "dashboard" / "app.py")


@pytest.fixture(scope="module")
def live_api_server():
    """Real uvicorn server in a background thread -- app.py calls the API
    over genuine HTTP, so testing it needs a genuine server listening,
    not just an in-process TestClient (which app.py, as an external
    caller, has no way to use)."""
    r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    for key in r.keys("bandit:*") + r.keys("counterfactual:*") + r.keys("monitoring:*"):
        r.delete(key)

    config = uvicorn.Config(app, host="127.0.0.1", port=8001, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    for _ in range(60):
        try:
            import requests
            requests.get("http://127.0.0.1:8001/api/v1/health", timeout=1)
            break
        except Exception:
            time.sleep(0.5)

    yield "http://127.0.0.1:8001"
    server.should_exit = True


def test_dashboard_renders_without_error(live_api_server, monkeypatch):
    monkeypatch.setenv("RETENTIONAI_API_URL", live_api_server)
    at = AppTest.from_file(DASHBOARD_APP_PATH)
    at.run(timeout=30)
    assert not list(at.exception)
    # Verify the header disclosure line rendered
    all_markdown = " ".join(m.value for m in at.markdown)
    assert "Portfolio demonstration" in all_markdown


def test_dashboard_predict_button_populates_results(live_api_server, monkeypatch):
    monkeypatch.setenv("RETENTIONAI_API_URL", live_api_server)
    at = AppTest.from_file(DASHBOARD_APP_PATH)
    at.run(timeout=30)

    predict_btn = [b for b in at.button if b.label == "Assess churn risk"][0]
    predict_btn.click().run(timeout=30)

    assert not list(at.exception)
    # The redesigned dashboard renders risk scores via st.markdown, not
    # st.metric. Verify the markdown output contains a percentage and
    # the review-priority caption mentions the policy arm.
    all_markdown = " ".join(m.value for m in at.markdown)
    assert "%" in all_markdown
    all_captions = " ".join(c.value for c in at.caption)
    assert "policy arm" in all_captions.lower()


def test_dashboard_counterfactual_check_handles_the_known_ambiguity(live_api_server, monkeypatch):
    """ADR-014 Decision Point 4's raw_changes:{}/flippable:true ambiguity
    must render as a distinct, sensible message -- not crash, not show
    nothing."""
    monkeypatch.setenv("RETENTIONAI_API_URL", live_api_server)
    at = AppTest.from_file(DASHBOARD_APP_PATH)
    at.run(timeout=30)

    predict_btn = [b for b in at.button if b.label == "Assess churn risk"][0]
    predict_btn.click().run(timeout=30)

    cf_btn = [b for b in at.button if b.label == "Check for a scenario"][0]
    cf_btn.click().run(timeout=30)

    assert not list(at.exception)
    # One of the three known UI outcomes must have rendered
    rendered = list(at.success) + list(at.info) + list(at.warning)
    assert len(rendered) > 0


def test_dashboard_feedback_button_reports_success(live_api_server, monkeypatch):
    monkeypatch.setenv("RETENTIONAI_API_URL", live_api_server)
    at = AppTest.from_file(DASHBOARD_APP_PATH)
    at.run(timeout=30)

    predict_btn = [b for b in at.button if b.label == "Assess churn risk"][0]
    predict_btn.click().run(timeout=30)

    fb_btn = [b for b in at.button if b.label == "Retained"][0]
    fb_btn.click().run(timeout=30)

    assert not list(at.exception)
    # Either "Feedback recorded" (success) or "already recorded" (warning/idempotency)
    assert any("Feedback recorded" in el.value for el in at.success) or \
           any("already recorded" in el.value for el in at.warning)


def test_dashboard_shows_error_when_api_unreachable(monkeypatch):
    monkeypatch.setenv("RETENTIONAI_API_URL", "http://127.0.0.1:9999")  # nothing listening here
    at = AppTest.from_file(DASHBOARD_APP_PATH)
    at.run(timeout=30)

    predict_btn = [b for b in at.button if b.label == "Assess churn risk"][0]
    predict_btn.click().run(timeout=30)

    assert not list(at.exception)  # the app itself shouldn't crash
    assert len(list(at.error)) > 0  # it should show a real error to the user
