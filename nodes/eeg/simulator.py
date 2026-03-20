"""Realistic EEG signal simulator for development without hardware.

Generates a continuous multi-channel EEG signal with:
- 1/f (pink) spectral slope — characteristic of real cortical activity
- Dominant alpha peak (8-12 Hz) that waxes/wanes over time
- Smaller theta and beta oscillations
- Per-channel spatial variation (frontal vs occipital emphasis)
- Slow cognitive-state drift so metrics move naturally

Output is a Timeflux Node producing small chunks each update().
"""

import numpy as np
import pandas as pd
from timeflux.core.node import Node

# Default 10-20 channel layout matching dummy.yaml
DEFAULT_CHANNELS = ["Fp1", "Fp2", "F3", "Fz", "F4", "C1", "Cz", "C2",
                    "P3", "Pz", "P4", "O1", "Oz", "O2"]

# Per-region relative band amplitudes (frontal has more theta/beta, occipital more alpha)
# Format: {channel_prefix: (delta, theta, alpha, beta, gamma)}
_REGION_WEIGHTS = {
    "Fp": (1.0, 1.2, 0.5, 1.3, 0.8),   # frontal pole: more theta/beta (blinks, exec)
    "F":  (1.0, 1.1, 0.7, 1.2, 0.7),    # frontal
    "C":  (1.0, 0.9, 1.0, 1.0, 0.6),    # central: balanced
    "P":  (0.9, 0.8, 1.3, 0.8, 0.5),    # parietal: alpha-dominant
    "O":  (0.8, 0.7, 1.6, 0.6, 0.4),    # occipital: strong alpha
}

# Band frequency ranges (Hz)
_BANDS = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "beta":  (13.0, 30.0),
    "gamma": (30.0, 45.0),
}


def _region_for_channel(name):
    """Map channel name to region prefix."""
    for prefix in ("Fp", "F", "C", "P", "O"):
        if name.startswith(prefix):
            return prefix
    return "C"  # fallback


class EEGSimulator(Node):
    """Generate realistic multi-channel EEG signals for development.

    Args:
        channels (list[str]): Channel names (10-20 system). Default: 14-channel layout.
        rate (int): Sampling rate in Hz. Default: 250.
        chunk_duration (float): Duration of each output chunk in seconds. Default: 0.1.
        alpha_amplitude (float): Base amplitude of the alpha oscillation in uV. Default: 15.0.
        noise_amplitude (float): Amplitude of the 1/f background noise in uV. Default: 30.0.
        drift_speed (float): Speed of cognitive state drift (lower = slower). Default: 0.02.
        seed (int): Random seed for reproducibility. Default: 42.
    """

    def __init__(self, channels=None, rate=250, chunk_duration=0.1,
                 alpha_amplitude=15.0, noise_amplitude=30.0,
                 drift_speed=0.02, seed=42):
        self._channels = channels or DEFAULT_CHANNELS
        self._rate = rate
        self._chunk_samples = max(1, int(rate * chunk_duration))
        self._alpha_amp = alpha_amplitude
        self._noise_amp = noise_amplitude
        self._drift_speed = drift_speed
        self._rng = np.random.default_rng(seed=seed)
        self._n_ch = len(self._channels)

        # Continuous phase accumulators — one per band per channel
        self._phases = {}
        for ch in self._channels:
            self._phases[ch] = {}
            for band_name, (flo, fhi) in _BANDS.items():
                # Each channel gets a slightly different center frequency
                center = (flo + fhi) / 2 + self._rng.uniform(-0.5, 0.5)
                self._phases[ch][band_name] = {
                    "freq": center,
                    "phase": self._rng.uniform(0, 2 * np.pi),
                }

        # Region weights per channel
        self._weights = []
        for ch in self._channels:
            region = _region_for_channel(ch)
            self._weights.append(_REGION_WEIGHTS.get(region, (1, 1, 1, 1, 1)))
        self._weights = np.array(self._weights)  # (n_ch, 5)

        # Slow cognitive state (modulates band amplitudes over time)
        self._state_phase = self._rng.uniform(0, 2 * np.pi, size=5)  # one per band
        self._sample_counter = 0

        # Pink noise filter state (per channel)
        self._pink_state = np.zeros(self._n_ch)

    def _pink_noise(self, n_samples):
        """Generate 1/f noise using a simple IIR filter on white noise."""
        out = np.empty((self._n_ch, n_samples))
        for i in range(n_samples):
            white = self._rng.standard_normal(self._n_ch)
            # First-order IIR: y[n] = 0.98 * y[n-1] + 0.02 * x[n]
            # This approximates a 1/f roll-off
            self._pink_state = 0.98 * self._pink_state + white
            out[:, i] = self._pink_state
        # Normalize
        std = out.std(axis=1, keepdims=True)
        std[std == 0] = 1
        out = out / std * self._noise_amp
        return out

    def update(self):
        n = self._chunk_samples
        dt = 1.0 / self._rate
        t0 = self._sample_counter * dt

        # Time vector for this chunk
        t = t0 + np.arange(n) * dt

        # Slow cognitive state modulation (period ~30-120s per band)
        state_mod = np.zeros(5)
        for b in range(5):
            self._state_phase[b] += dt * n * self._drift_speed * (0.5 + 0.5 * b)
            state_mod[b] = 0.5 + 0.5 * np.sin(self._state_phase[b])
        # state_mod shape: (5,) — values in [0, 1], one per band

        # Generate oscillatory components
        signal = np.zeros((self._n_ch, n))
        band_names = list(_BANDS.keys())

        for ch_idx, ch in enumerate(self._channels):
            for b_idx, band_name in enumerate(band_names):
                info = self._phases[ch][band_name]
                freq = info["freq"]
                phase = info["phase"]

                # Amplitude = region_weight * state_modulation * base_amplitude
                weight = self._weights[ch_idx, b_idx]
                mod = state_mod[b_idx]

                if band_name == "alpha":
                    amp = self._alpha_amp * weight * mod
                else:
                    amp = (self._alpha_amp * 0.4) * weight * mod

                # Generate sinusoidal oscillation
                osc = amp * np.sin(2 * np.pi * freq * t + phase)
                signal[ch_idx] += osc

                # Update phase for continuity
                info["phase"] = phase + 2 * np.pi * freq * n * dt

        # Add 1/f background noise
        signal += self._pink_noise(n)

        # Add small white sensor noise
        signal += self._rng.standard_normal((self._n_ch, n)) * 2.0

        self._sample_counter += n

        # Build output DataFrame
        now = pd.Timestamp.now("UTC")
        index = pd.date_range(
            start=now, periods=n,
            freq=pd.tseries.offsets.Milli(int(1000 / self._rate)),
        )
        self.o.data = pd.DataFrame(signal.T, index=index, columns=self._channels)
        self.o.meta = {"rate": self._rate}
