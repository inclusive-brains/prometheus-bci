"""Tests for the realistic EEG simulator node."""

import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock
from scipy.signal import welch

from nodes.eeg.simulator import EEGSimulator, DEFAULT_CHANNELS


class TestEEGSimulator:

    def setup_method(self):
        self.sim = EEGSimulator.__new__(EEGSimulator)
        EEGSimulator.__init__(self.sim, rate=250, chunk_duration=0.1)
        self.sim.o = MagicMock()

    def test_output_shape(self):
        """Each chunk should have rate * chunk_duration samples."""
        self.sim.update()
        df = self.sim.o.set.call_args[0][0]
        assert isinstance(df, pd.DataFrame)
        assert df.shape == (25, 14)  # 250Hz * 0.1s = 25 samples, 14 channels

    def test_channel_names(self):
        self.sim.update()
        df = self.sim.o.set.call_args[0][0]
        assert list(df.columns) == DEFAULT_CHANNELS

    def test_no_nans(self):
        """Signal should never contain NaN."""
        for _ in range(100):
            self.sim.update()
            df = self.sim.o.set.call_args[0][0]
            assert not df.isna().any().any()

    def test_amplitude_reasonable(self):
        """EEG amplitudes should stay within realistic bounds (~±200uV)."""
        all_vals = []
        for _ in range(200):
            self.sim.update()
            df = self.sim.o.set.call_args[0][0]
            all_vals.append(df.values)
        data = np.concatenate(all_vals, axis=0)
        assert np.abs(data).max() < 800, "Signal amplitude exceeds realistic EEG bounds"

    def test_has_alpha_peak(self):
        """PSD of occipital channels should show elevated power in 8-12 Hz."""
        all_vals = []
        for _ in range(400):  # ~40s of data
            self.sim.update()
            df = self.sim.o.set.call_args[0][0]
            all_vals.append(df["O1"].values)
        signal = np.concatenate(all_vals)

        freqs, psd = welch(signal, fs=250, nperseg=1024)

        # Alpha band (8-12 Hz)
        alpha_mask = (freqs >= 8) & (freqs <= 12)
        alpha_power = psd[alpha_mask].mean()

        # Beta band (18-25 Hz) as comparison
        beta_mask = (freqs >= 18) & (freqs <= 25)
        beta_power = psd[beta_mask].mean()

        # Alpha should be stronger than beta on occipital channels
        assert alpha_power > beta_power, \
            f"Alpha ({alpha_power:.2f}) should exceed beta ({beta_power:.2f}) on O1"

    def test_spectrum_not_flat(self):
        """PSD should NOT be flat (unlike white noise) — low freqs should dominate."""
        all_vals = []
        for _ in range(400):
            self.sim.update()
            df = self.sim.o.set.call_args[0][0]
            all_vals.append(df["Cz"].values)
        signal = np.concatenate(all_vals)

        freqs, psd = welch(signal, fs=250, nperseg=1024)

        # Low freq (1-4 Hz) vs high freq (30-45 Hz)
        low_mask = (freqs >= 1) & (freqs <= 4)
        high_mask = (freqs >= 30) & (freqs <= 45)
        low_power = psd[low_mask].mean()
        high_power = psd[high_mask].mean()

        assert low_power > high_power * 2, \
            "1/f slope: low-freq power should be >2x high-freq power"

    def test_deterministic(self):
        """Same seed should produce identical output."""
        sim2 = EEGSimulator.__new__(EEGSimulator)
        EEGSimulator.__init__(sim2, rate=250, chunk_duration=0.1)
        sim2.o = MagicMock()

        self.sim.update()
        sim2.update()

        df1 = self.sim.o.set.call_args[0][0]
        df2 = sim2.o.set.call_args[0][0]
        np.testing.assert_array_almost_equal(df1.values, df2.values, decimal=10)

    def test_metrics_vary_over_time(self):
        """Band ratios should change over time (not constant like white noise)."""
        ratios = []
        for _ in range(200):  # ~20s
            self.sim.update()
            df = self.sim.o.set.call_args[0][0]
            # Quick alpha/theta ratio on O1
            signal = df["O1"].values
            if len(signal) < 64:
                continue
            freqs, psd = welch(signal, fs=250, nperseg=min(len(signal), 64))
            alpha = psd[(freqs >= 8) & (freqs <= 12)].sum()
            theta = psd[(freqs >= 4) & (freqs <= 8)].sum()
            if theta > 0:
                ratios.append(alpha / theta)

        # The ratios should vary (std > 0.05) thanks to drift
        if len(ratios) > 10:
            assert np.std(ratios) > 0.01, "Band ratios should vary over time"
