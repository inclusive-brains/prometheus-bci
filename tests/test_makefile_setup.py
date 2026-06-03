"""Tests for the Makefile setup/install guards.

The Makefile drives the conda-based installation. When ``conda`` is not on the
PATH, ``make setup`` used to fail with a cryptic
``conda: No such file or directory`` error. A ``check-conda`` guard now prints
clear installation instructions and aborts before any conda command runs.

These tests parse the Makefile statically (no ``make`` invocation needed) so
they run anywhere, including environments without conda.
"""

import re
from pathlib import Path

import pytest

MAKEFILE = Path(__file__).resolve().parent.parent / "Makefile"

# Targets that invoke conda and must therefore depend on the guard.
CONDA_TARGETS = ["setup", "install", "update", "run", "clean"]


@pytest.fixture(scope="module")
def makefile_text():
    return MAKEFILE.read_text()


def _target_prerequisites(text, target):
    """Return the prerequisite list declared for a target, or None if absent."""
    # Match the recipe header line, e.g. "setup: check-conda config ## ...".
    match = re.search(rf"^{re.escape(target)}:([^\n]*)$", text, re.MULTILINE)
    if match is None:
        return None
    deps = match.group(1)
    # Strip the help comment (## ...) if present.
    deps = deps.split("##", 1)[0]
    return deps.split()


def test_check_conda_target_exists(makefile_text):
    assert _target_prerequisites(makefile_text, "check-conda") is not None


def test_check_conda_detects_conda_on_path(makefile_text):
    # The guard must probe the PATH rather than assume conda exists.
    assert "command -v conda" in makefile_text


def test_check_conda_aborts_when_missing(makefile_text):
    # On the missing branch it must exit non-zero so dependent targets stop.
    assert "exit 1" in makefile_text


def test_check_conda_points_to_miniconda(makefile_text):
    # The error message should guide the user to install Miniconda.
    assert "Miniconda" in makefile_text
    assert "docs.conda.io" in makefile_text


@pytest.mark.parametrize("target", CONDA_TARGETS)
def test_conda_targets_depend_on_guard(makefile_text, target):
    prereqs = _target_prerequisites(makefile_text, target)
    assert prereqs is not None, f"target {target!r} not found in Makefile"
    assert "check-conda" in prereqs, (
        f"target {target!r} must depend on 'check-conda' so it fails fast "
        f"with a helpful message when conda is missing"
    )


def test_check_conda_is_phony(makefile_text):
    # Guard target must be declared .PHONY so it always runs.
    phony = re.search(r"^\.PHONY:(.*(?:\\\n.*)*)$", makefile_text, re.MULTILINE)
    assert phony is not None
    assert "check-conda" in phony.group(1)
