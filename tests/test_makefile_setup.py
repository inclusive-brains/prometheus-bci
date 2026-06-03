"""Tests for the Makefile setup/install guards.

The Makefile drives the uv-based installation. When ``uv`` is not on the PATH,
``make setup`` would fail with a cryptic ``uv: No such file or directory``
error. A ``check-uv`` guard now prints clear installation instructions and
aborts before any uv command runs.

These tests parse the Makefile statically (no ``make`` invocation needed) so
they run anywhere, including environments without uv.
"""

import re
from pathlib import Path

import pytest

MAKEFILE = Path(__file__).resolve().parent.parent / "Makefile"

# Targets that invoke uv and must therefore depend on the guard.
UV_TARGETS = ["setup", "install", "update", "run"]


@pytest.fixture(scope="module")
def makefile_text():
    return MAKEFILE.read_text()


def _target_prerequisites(text, target):
    """Return the prerequisite list declared for a target, or None if absent."""
    # Match the recipe header line, e.g. "setup: check-uv config ## ...".
    match = re.search(rf"^{re.escape(target)}:([^\n]*)$", text, re.MULTILINE)
    if match is None:
        return None
    deps = match.group(1)
    # Strip the help comment (## ...) if present.
    deps = deps.split("##", 1)[0]
    return deps.split()


def test_check_uv_target_exists(makefile_text):
    assert _target_prerequisites(makefile_text, "check-uv") is not None


def test_check_uv_detects_uv_on_path(makefile_text):
    # The guard must probe the PATH rather than assume uv exists.
    assert "command -v uv" in makefile_text


def test_check_uv_aborts_when_missing(makefile_text):
    # On the missing branch it must exit non-zero so dependent targets stop.
    assert "exit 1" in makefile_text


def test_check_uv_points_to_install_docs(makefile_text):
    # The error message should guide the user to install uv.
    assert "astral.sh/uv/install.sh" in makefile_text
    assert "docs.astral.sh/uv" in makefile_text


@pytest.mark.parametrize("target", UV_TARGETS)
def test_uv_targets_depend_on_guard(makefile_text, target):
    prereqs = _target_prerequisites(makefile_text, target)
    assert prereqs is not None, f"target {target!r} not found in Makefile"
    assert "check-uv" in prereqs, (
        f"target {target!r} must depend on 'check-uv' so it fails fast "
        f"with a helpful message when uv is missing"
    )


def test_check_uv_is_phony(makefile_text):
    # Guard target must be declared .PHONY so it always runs.
    phony = re.search(r"^\.PHONY:(.*(?:\\\n.*)*)$", makefile_text, re.MULTILINE)
    assert phony is not None
    assert "check-uv" in phony.group(1)


def test_no_conda_references_remain(makefile_text):
    # The migration to uv should leave no conda commands behind.
    assert "conda" not in makefile_text.lower()


def test_setup_creates_venv_with_pinned_python(makefile_text):
    assert "uv venv --python" in makefile_text
    assert "PYTHON_VERSION = 3.10" in makefile_text
