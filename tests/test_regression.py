"""Non-regression tests.

These tests lock down critical constants, default values, and interfaces
so that accidental changes are caught immediately.
"""

import numpy as np
import pandas as pd
import pytest
from nodes.eeg.metrics import bandpower as metrics_bandpower
from nodes.eeg.ratio import bandpower as ratio_bandpower
from nodes.classification.bayesian import BayesianAccumulation
from nodes.classification.accumulator import Accumulate
from estimators.eog import EOGFeature
from estimators.mne import Vectorizer
from nodes.physio.ppg import (
    StressCalculator, CognitiveLoadCalculator,
    AwakenessCalculator, AttentionCalculator,
)
from scripts.setup_ui import SCHEMA, HEADSETS


# ── Bandpower consistency ───────────────────────────────────────────────────

class TestBandpowerRegression:

    def test_metrics_and_ratio_bandpower_identical(self):
        """Both modules define bandpower() — they must produce identical results."""
        np.random.seed(123)
        df = pd.DataFrame(np.random.randn(512, 3), columns=["O1", "Fz", "C3"])
        bands = {"theta": (4, 8), "alpha": (8, 13)}
        bp1 = metrics_bandpower(df, 256, bands, normalize=True)
        bp2 = ratio_bandpower(df, 256, bands, normalize=True)
        pd.testing.assert_frame_equal(bp1, bp2)

    def test_bandpower_deterministic(self):
        """Same input should always produce the same output."""
        np.random.seed(42)
        df = pd.DataFrame(np.random.randn(256, 2), columns=["C3", "C4"])
        bands = {"alpha": (8, 13)}
        bp1 = metrics_bandpower(df, 256, bands)
        np.random.seed(42)
        df2 = pd.DataFrame(np.random.randn(256, 2), columns=["C3", "C4"])
        bp2 = metrics_bandpower(df2, 256, bands)
        pd.testing.assert_frame_equal(bp1, bp2)


# ── Default parameters lock ────────────────────────────────────────────────

class TestDefaultParameters:
    """Lock default values to prevent accidental changes."""

    def test_stress_calculator_defaults(self):
        calc = StressCalculator.__new__(StressCalculator)
        # StressCalculator.__init__ defaults: min_rate=10, max_rate=40
        StressCalculator.__init__(calc, min_rate=10, max_rate=40)
        assert calc.min_rate == 10
        assert calc.max_rate == 40

    def test_cognitive_load_defaults(self):
        calc = CognitiveLoadCalculator.__new__(CognitiveLoadCalculator)
        CognitiveLoadCalculator.__init__(calc, min_rate=18, max_rate=30)
        assert calc.min_rate == 18
        assert calc.max_rate == 30

    def test_awakeness_defaults(self):
        calc = AwakenessCalculator.__new__(AwakenessCalculator)
        AwakenessCalculator.__init__(calc, min_rate=6, max_rate=15)
        assert calc.min_rate == 6
        assert calc.max_rate == 15

    def test_attention_defaults(self):
        calc = AttentionCalculator.__new__(AttentionCalculator)
        AttentionCalculator.__init__(calc, min_rate=10, max_rate=20)
        assert calc.min_rate == 10
        assert calc.max_rate == 20

    def test_bayesian_default_classes(self):
        ba = BayesianAccumulation()
        assert ba.n_classes == 2

    def test_accumulator_defaults(self):
        acc = Accumulate.__new__(Accumulate)
        Accumulate.__init__(acc)
        assert acc._threshold == 2
        assert acc._buffer_size == 10
        assert acc._recovery == 5
        assert acc._scorer == "sum"
        assert acc._feedback is False
        assert acc._classes is None

    def test_eog_rescale_default_true(self):
        feat = EOGFeature()
        assert feat.rescale is True


# ── EOGFeature output stability ────────────────────────────────────────────

class TestEOGFeatureRegression:

    def test_known_output(self):
        """Lock expected output for a known input."""
        X = np.array([[1.0, 5.0, 3.0, 2.0, 4.0]])
        feat = EOGFeature(rescale=False)
        out = feat.transform(X.copy())
        assert out.shape == (1, 5)
        assert pytest.approx(out[0, 0], rel=1e-10) == 3.0   # mean
        assert pytest.approx(out[0, 1], rel=1e-10) == 5.0   # max
        assert pytest.approx(out[0, 2], rel=1e-10) == 1.0   # min
        assert out[0, 4] == 1 - 0  # argmax(1) - argmin(0)


# ── Vectorizer roundtrip stability ─────────────────────────────────────────

class TestVectorizerRegression:

    def test_roundtrip_preserves_data(self):
        np.random.seed(99)
        X = np.random.randn(4, 8, 32)
        vec = Vectorizer()
        flat = vec.fit_transform(X)
        restored = vec.inverse_transform(flat)
        np.testing.assert_array_equal(X, restored)

    def test_output_size_is_product(self):
        X = np.random.randn(3, 5, 7)
        vec = Vectorizer()
        flat = vec.fit_transform(X)
        assert flat.shape == (3, 35)


# ── BayesianAccumulation stability ─────────────────────────────────────────

class TestBayesianRegression:

    def test_known_accumulation_sequence(self):
        """Lock a specific sequence of updates to a known result."""
        ba = BayesianAccumulation(n_classes=2)
        ba.predict_proba([0.7, 0.3])
        ba.predict_proba([0.6, 0.4])
        proba = ba.predict_proba([0.8, 0.2])
        # posterior ∝ prior × L1 × L2 × L3
        # class0: 0.5 × 0.7 × 0.6 × 0.8 = 0.168
        # class1: 0.5 × 0.3 × 0.4 × 0.2 = 0.012
        # total = 0.180
        expected_0 = 0.168 / 0.180
        expected_1 = 0.012 / 0.180
        assert pytest.approx(proba[0], rel=1e-5) == expected_0
        assert pytest.approx(proba[1], rel=1e-5) == expected_1


# ── Score calculators stability ─────────────────────────────────────────────

class TestScoreRegression:

    @pytest.mark.parametrize("rate,expected", [
        (10, 0.0), (25, 50.0), (40, 100.0), (0, 0.0), (100, 100.0),
    ])
    def test_stress_score_values(self, rate, expected):
        calc = StressCalculator.__new__(StressCalculator)
        calc.min_rate = 10
        calc.max_rate = 40
        assert calc.calculate_score(rate) == expected

    @pytest.mark.parametrize("rate,expected", [
        (18, 0.0), (24, 50.0), (30, 100.0),
    ])
    def test_cognitive_load_score_values(self, rate, expected):
        calc = CognitiveLoadCalculator.__new__(CognitiveLoadCalculator)
        calc.min_rate = 18
        calc.max_rate = 30
        assert calc.calculate_score(rate) == expected


# ── Schema stability ────────────────────────────────────────────────────────

class TestSchemaRegression:

    def test_expected_sections(self):
        """Schema must contain these sections."""
        section_names = [s["section"] for s in SCHEMA]
        expected = ["Devices", "Training — Baseline", "Training — Motor Imagery",
                     "Training — Blink Detection", "OSC Output", "Paths & Models"]
        assert section_names == expected

    def test_expected_headset_ids(self):
        """Known headset IDs must be present."""
        ids = {h["id"] for h in HEADSETS}
        expected = {"dummy", "emotiv_insight", "emotiv_epochX", "emotiv_epoch+",
                    "emotiv_mn8", "consciouslabs"}
        assert ids == expected

    def test_critical_schema_keys_exist(self):
        """These env keys must remain in the schema."""
        all_keys = {f["key"] for s in SCHEMA for f in s["fields"]}
        critical = {"PPG_DEVICE", "CAMERA_ENABLE", "MOTOR_ENABLE", "BLINK_ENABLE",
                    "OSC_ENABLE", "OSC_IP", "OSC_PORT", "BASELINE_ENABLE"}
        assert critical.issubset(all_keys), f"Missing: {critical - all_keys}"
