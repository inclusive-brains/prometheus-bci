"""Tests for PPG metric calculators (stress, cognitive load, awakeness, attention, respiratory)."""

import numpy as np
import pytest
from scipy import signal as sp_signal
from nodes.physio.ppg import (
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
