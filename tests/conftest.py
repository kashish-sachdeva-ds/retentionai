"""Global test configuration.

The committed test fixture intentionally uses a generated 1,500-row synthetic
Telco-shaped CSV. The API rejects it in ordinary use, so tests opt in before
any module imports the FastAPI application.
"""

import os


os.environ.setdefault("ALLOW_SYNTHETIC_DATA", "1")
