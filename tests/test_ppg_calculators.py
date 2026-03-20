"""Tests for PPG metric calculators (stress, cognitive load, awakeness, attention, respiratory)."""

import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock
from scipy import signal as sp_signal
from nodes.physio.ppg import (
    PPGSimulator,
    StressCalculator,
    CognitiveLoadCalculator,
    AwakenessCalculator,
    AttentionCalculator,
    RespiratoryMetricsCalculator,
    RespiratoryRateCalculator,
)


# ── Helper to instantiate calculators without Timeflux ──────────────────────

def _make_calculator(cls, **kwargs):
    """Instantiate a calculator node bypassing Node.__init__."""
    obj = cls.__new__(cls)
    obj.min_rate = kwargs.get("min_rate", cls.__init__.__defaults__[0] if cls.__init__.__defaults__ else 10)
    obj.max_rate = kwargs.get("max_rate", cls.__init__.__defaults__[1] if cls.__init__.__defaults__ else 40)
    return obj


# ── Score Calculators (all share the same calculate_score logic) ────────────

class TestStressCalculator:

    def setup_method(self):
        self.calc = _make_calculator(StressCalculator, min_rate=10, max_rate=40)

    def test_min_rate_gives_zero(self):
        assert self.calc.calculate_score(10) == 0.0

    def test_max_rate_gives_hundred(self):
        assert self.calc.calculate_score(40) == 100.0

    def test_midpoint(self):
        assert self.calc.calculate_score(25) == 50.0

    def test_below_min_clipped(self):
        assert self.calc.calculate_score(5) == 0.0

    def test_above_max_clipped(self):
        assert self.calc.calculate_score(60) == 100.0


class TestCognitiveLoadCalculator:

    def setup_method(self):
        self.calc = _make_calculator(CognitiveLoadCalculator, min_rate=18, max_rate=30)

    def test_min_rate_gives_zero(self):
        assert self.calc.calculate_score(18) == 0.0

    def test_max_rate_gives_hundred(self):
        assert self.calc.calculate_score(30) == 100.0

    def test_clipping(self):
        assert self.calc.calculate_score(5) == 0.0
        assert self.calc.calculate_score(50) == 100.0


class TestAwakenessCalculator:

    def setup_method(self):
        self.calc = _make_calculator(AwakenessCalculator, min_rate=6, max_rate=15)

    def test_range(self):
        assert self.calc.calculate_score(6) == 0.0
        assert self.calc.calculate_score(15) == 100.0

    def test_intermediate(self):
        score = self.calc.calculate_score(10.5)
        assert 0 < score < 100


class TestAttentionCalculator:

    def setup_method(self):
        self.calc = _make_calculator(AttentionCalculator, min_rate=10, max_rate=20)

    def test_boundaries(self):
        assert self.calc.calculate_score(10) == 0.0
        assert self.calc.calculate_score(20) == 100.0


# ── RespiratoryMetricsCalculator ────────────────────────────────────────────

class TestRespiratoryMetricsCalculator:

    def setup_method(self):
        self.calc = RespiratoryMetricsCalculator.__new__(RespiratoryMetricsCalculator)

    def test_variance(self):
        signal = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        var = self.calc.calculate_respiratory_variance(signal)
        assert pytest.approx(var, rel=1e-5) == np.var(signal)

    def test_amplitude_with_clear_peaks(self):
        """A sinusoidal signal should have consistent amplitude."""
        t = np.linspace(0, 2 * np.pi * 5, 1000)
        signal = np.sin(t)
        amp = self.calc.calculate_respiratory_amplitude(signal)
        assert amp is not None
        assert amp > 1.5  # amplitude of sin is ~2 (peak to trough)

    def test_amplitude_flat_signal(self):
        """A flat signal with insufficient peaks should return None."""
        signal = np.ones(100)
        amp = self.calc.calculate_respiratory_amplitude(signal)
        assert amp is None


# ── RespiratoryRateCalculator ───────────────────────────────────────────────

class TestRespiratoryRateCalculator:

    def setup_method(self):
        self.calc = RespiratoryRateCalculator.__new__(RespiratoryRateCalculator)

    def test_known_rate(self):
        """A signal with known peak spacing should give expected rate."""
        sampling_rate = 100
        # Create signal with peaks every 3 seconds = 20 breaths/min
        t = np.linspace(0, 30, 30 * sampling_rate)
        signal = np.sin(2 * np.pi * (1/3) * t)  # 1/3 Hz = 20 bpm
        rate = self.calc.calculate_respiratory_rate(signal, sampling_rate)
        assert rate is not None
        assert pytest.approx(rate, rel=0.1) == 20.0

    def test_flat_signal_returns_none(self):
        """A flat signal should return None."""
        signal = np.zeros(500)
        rate = self.calc.calculate_respiratory_rate(signal, 100)
        assert rate is None


# ── PPGSimulator ──────────────────────────────────────────────────────────

class TestPPGSimulator:

    def setup_method(self):
        self.sim = PPGSimulator.__new__(PPGSimulator)
        PPGSimulator.__init__(self.sim, heart_rate=70, hrv_std=0.04,
                              sampling_rate=25, chunk_duration=0.2)
        self.sim.o = MagicMock()

    def test_output_shape(self):
        """Each update should produce chunk_duration * sampling_rate samples."""
        self.sim.update()
        df = self.sim.o.data
        assert isinstance(df, pd.DataFrame)
        assert df.shape == (5, 1)  # 0.2s * 25Hz = 5 samples
        assert "0" in df.columns

    def test_output_has_peaks(self):
        """Running multiple updates should produce a signal with detectable peaks."""
        all_values = []
        for _ in range(200):  # ~40s of data at 0.2s chunks
            self.sim.update()
            all_values.extend(self.sim.o.data["0"].values)
        signal_arr = np.array(all_values)
        # At 70 BPM over 40s we expect ~46 peaks
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(signal_arr, height=0.5, distance=10)
        assert len(peaks) > 30, f"Expected >30 peaks in 40s at 70 BPM, got {len(peaks)}"

    def test_values_are_bounded(self):
        """PPG values should stay in a reasonable range (no NaN, no explosion)."""
        for _ in range(50):
            self.sim.update()
            vals = self.sim.o.data["0"].values
            assert not np.any(np.isnan(vals))
            assert np.all(vals > -0.5)
            assert np.all(vals < 2.0)

    def test_deterministic_with_same_seed(self):
        """Two simulators with same params should produce identical output."""
        sim2 = PPGSimulator.__new__(PPGSimulator)
        PPGSimulator.__init__(sim2, heart_rate=70, hrv_std=0.04,
                              sampling_rate=25, chunk_duration=0.2)
        sim2.o = MagicMock()

        self.sim.update()
        sim2.update()
        np.testing.assert_array_equal(
            self.sim.o.data["0"].values,
            sim2.o.data["0"].values,
        )
