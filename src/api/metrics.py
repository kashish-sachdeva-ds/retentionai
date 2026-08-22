from prometheus_client import Counter, Histogram

# Standard RED metrics
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

# Business metrics
MODEL_PREDICTIONS_TOTAL = Counter(
    "model_predictions_total",
    "Total model predictions made",
    ["model_version"]
)

BANDIT_FEEDBACK_TOTAL = Counter(
    "bandit_feedback_total",
    "Total feedback events recorded",
    ["arm", "retained"]
)
