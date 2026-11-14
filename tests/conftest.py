"""Every test run uses its own empty onboard record, never data/trix.db."""
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True, scope="session")
def _isolated_store():
    from trix import store
    tmp = Path(tempfile.mkdtemp()) / "trix_test.db"
    store.reset(tmp)
    yield


@pytest.fixture(autouse=True)
def _fresh_settings():
    """Privacy choices and paired devices persist in the app; start each test from the defaults."""
    from trix import store
    store.x("delete from settings")
    yield
