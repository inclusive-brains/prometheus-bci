"""Tests for the bandpower() function used in EEG metrics and ratio nodes."""

import numpy as np
import pandas as pd
import pytest
from nodes.eeg.metrics import bandpower


def _make_sine_signal(freq, rate=256, duration=2, n_channels=3):
    """Generate a multi-channel sinusoidal signal at a given frequency."""
    t = np.arange(0, duration, 1 / rate)
    data = np.column_stack([np.sin(2 * np.pi * freq * t)] * n_channels)
    channels = [f"Ch{i}" for i in range(n_channels)]
    return pd.DataFrame(data, columns=channels)


class TestBandpower:

    def test_output_shape(self):
        """Output should have shape (n_channels, n_bands)."""
        df = _make_sine_signal(10, rate=256, duration=2, n_channels=4)
        bands = {"alpha": (8, 12), "beta": (12, 30)}
        bp = bandpower(df, 256, bands)
        assert bp.shape == (4, 2)
        assert list(bp.columns) == ["alpha", "beta"]

    def test_dominant_band(self):
        """A 10 Hz signal should have most power in alpha (8-12 Hz)."""
        df = _make_sine_signal(10, rate=256, duration=4)
        bands = {"theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}
        bp = bandpower(df, 256, bands)
        for ch in bp.index:
            assert bp.loc[ch, "alpha"] > bp.loc[ch, "theta"]
            assert bp.loc[ch, "alpha"] > bp.loc[ch, "beta"]

    def test_normalized_sums_to_one(self):
        """When normalized, band powers should approximately sum to 1."""
        df = _make_sine_signal(10, rate=256, duration=4)
        bands = {"theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}
        bp = bandpower(df, 256, bands, normalize=True)
        for ch in bp.index:
            total = bp.loc[ch].sum()
            # Should be close to 1 (the 3 bands cover most of the 4-30 Hz range)
            assert total > 0.8

    def test_non_negative(self):
        """Band power values should always be non-negative."""
        np.random.seed(42)
        df = pd.DataFrame(np.random.randn(512, 2), columns=["C3", "C4"])
        bands = {"delta": (1, 4), "theta": (4, 8), "alpha": (8, 13)}
        bp = bandpower(df, 256, bands)
        assert (bp.values >= 0).all()

    def test_single_channel(self):
        """Should work with a single channel."""
        df = _make_sine_signal(15, rate=256, duration=2, n_channels=1)
        bands = {"beta": (13, 30)}
        bp = bandpower(df, 256, bands)
        assert bp.shape == (1, 1)
        assert bp.values[0, 0] > 0
