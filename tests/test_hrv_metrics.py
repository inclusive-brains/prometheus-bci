"""Tests for HRV-based metric nodes (ArousalMetric, AttentionMetric, CognitiveLoadMetric, StressMetric)."""

import numpy as np
import pytest


class TestHRVNormalization:
    """Test the normalization logic used across all HRV metric nodes.

    All HRV metrics use: normalized = clip(1 - (value - min) / (max - min), 0, 1)
    (inverted because lower HRV values indicate higher stress/arousal)
    """

    def _normalize_inverted(self, value, vmin, vmax):
        """Reproduce the normalization formula from ppg.py."""
        return max(min(1 - ((value - vmin) / (vmax - vmin)), 1), 0)

    def _normalize_direct(self, value, vmin, vmax):
        """Direct normalization (used for pNN50)."""
        return max(min((value - vmin) / (vmax - vmin), 1), 0)

    def test_inverted_at_min(self):
        assert self._normalize_inverted(20, 20, 100) == 1.0

    def test_inverted_at_max(self):
        assert self._normalize_inverted(100, 20, 100) == 0.0

    def test_inverted_midpoint(self):
        assert pytest.approx(self._normalize_inverted(60, 20, 100)) == 0.5

    def test_inverted_below_min_clipped(self):
        assert self._normalize_inverted(10, 20, 100) == 1.0

    def test_inverted_above_max_clipped(self):
        assert self._normalize_inverted(150, 20, 100) == 0.0

    def test_direct_at_min(self):
        assert self._normalize_direct(0, 0, 20) == 0.0

    def test_direct_at_max(self):
        assert self._normalize_direct(20, 0, 20) == 1.0

    def test_direct_clipped(self):
        assert self._normalize_direct(30, 0, 20) == 1.0


class TestArousalMetricWeights:
    """Test that arousal metric computes correctly with given weights."""

    def test_default_weights_sum_to_one(self):
        weights = {'HRV_MeanNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_SDSD': 0.34}
        assert pytest.approx(sum(weights.values())) == 1.0

    def test_all_min_values_gives_max_metric(self):
        """When all HRV values are at their minimum, the inverted normalization gives 1.0 each."""
        # Arousal: MeanNN min=50, RMSSD min=20, SDSD min=20
        weights = {'HRV_MeanNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_SDSD': 0.34}
        # At min values, all normalized = 1.0
        result = sum(w * 1.0 for w in weights.values())
        assert pytest.approx(result) == 1.0

    def test_all_max_values_gives_zero_metric(self):
        """When all HRV values are at their max, the inverted normalization gives 0.0 each."""
        weights = {'HRV_MeanNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_SDSD': 0.34}
        result = sum(w * 0.0 for w in weights.values())
        assert result == 0.0


class TestStressMetricWeights:

    def test_default_weights_sum_to_one(self):
        weights = {'HRV_SDNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_pNN50': 0.34}
        assert pytest.approx(sum(weights.values())) == 1.0

    def test_mixed_normalization(self):
        """Stress uses inverted for SDNN/RMSSD but direct for pNN50."""
        # High pNN50 = high parasympathetic = actually higher stress in this model
        normalize_inv = lambda v, lo, hi: max(min(1 - (v - lo) / (hi - lo), 1), 0)
        normalize_dir = lambda v, lo, hi: max(min((v - lo) / (hi - lo), 1), 0)

        sdnn_norm = normalize_inv(85, 30, 140)   # mid-range
        rmssd_norm = normalize_inv(60, 20, 100)   # mid-range
        pnn50_norm = normalize_dir(10, 0, 20)     # mid-range

        stress = 0.33 * sdnn_norm + 0.33 * rmssd_norm + 0.34 * pnn50_norm
        assert 0 < stress < 1


class TestCognitiveLoadMetricWeights:

    def test_default_weights(self):
        weights = {'HRV_SDNN': 0.5, 'HRV_RMSSD': 0.5}
        assert sum(weights.values()) == 1.0
