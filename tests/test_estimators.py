"""Tests for estimators (EOGFeature, Vectorizer)."""

import numpy as np
import pytest
from estimators.eog import EOGFeature
from estimators.mne import Vectorizer


# ── EOGFeature ──────────────────────────────────────────────────────────────

class TestEOGFeature:

    def test_output_shape(self):
        """Transform should return (n_samples, 5) features."""
        X = np.random.randn(10, 50)  # 10 samples, 50 timepoints
        feat = EOGFeature(rescale=False)
        out = feat.transform(X)
        assert out.shape == (10, 5)

    def test_rescale(self):
        """When rescale=True, values are multiplied by 1e9."""
        X = np.array([[1e-9, 2e-9, 3e-9]])
        feat = EOGFeature(rescale=True)
        out = feat.transform(X.copy())
        # mean should be around 2.0 (after 1e9 scaling)
        assert pytest.approx(out[0, 0], rel=1e-5) == 2.0

    def test_no_rescale(self):
        """When rescale=False, values stay unchanged."""
        X = np.array([[1.0, 2.0, 3.0]])
        feat = EOGFeature(rescale=False)
        out = feat.transform(X.copy())
        assert pytest.approx(out[0, 0], rel=1e-5) == 2.0  # mean
        assert pytest.approx(out[0, 1], rel=1e-5) == 3.0  # max
        assert pytest.approx(out[0, 2], rel=1e-5) == 1.0  # min
        assert pytest.approx(out[0, 4], rel=1e-5) == 2 - 0  # argmax - argmin

    def test_features_content(self):
        """Check that the 5 features are: mean, max, min, std, argmax-argmin."""
        X = np.array([[5.0, 1.0, 3.0, 9.0, 2.0]])
        feat = EOGFeature(rescale=False)
        out = feat.transform(X.copy())
        assert pytest.approx(out[0, 0], rel=1e-5) == np.mean(X[0])
        assert pytest.approx(out[0, 1], rel=1e-5) == np.max(X[0])
        assert pytest.approx(out[0, 2], rel=1e-5) == np.min(X[0])
        assert pytest.approx(out[0, 3], rel=1e-5) == np.std(X[0])
        assert out[0, 4] == X[0].argmax() - X[0].argmin()

    def test_fit_returns_self(self):
        feat = EOGFeature()
        result = feat.fit(np.zeros((3, 10)))
        assert result is feat

    def test_fit_transform(self):
        X = np.random.randn(5, 20)
        feat = EOGFeature(rescale=False)
        out = feat.fit_transform(X.copy())
        assert out.shape == (5, 5)


# ── Vectorizer ──────────────────────────────────────────────────────────────

class TestVectorizer:

    def test_2d_passthrough(self):
        """2D input should stay 2D."""
        X = np.random.randn(10, 20)
        vec = Vectorizer()
        out = vec.fit_transform(X)
        assert out.shape == (10, 20)

    def test_3d_flatten(self):
        """3D input (n_samples, n_channels, n_times) should become 2D."""
        X = np.random.randn(8, 4, 100)
        vec = Vectorizer()
        out = vec.fit_transform(X)
        assert out.shape == (8, 400)

    def test_inverse_transform(self):
        """inverse_transform should restore original shape."""
        X = np.random.randn(5, 3, 50)
        vec = Vectorizer()
        flat = vec.fit_transform(X)
        restored = vec.inverse_transform(flat)
        np.testing.assert_array_almost_equal(restored, X)

    def test_shape_mismatch_raises(self):
        """transform with different feature shape should raise."""
        vec = Vectorizer()
        vec.fit(np.random.randn(10, 4, 100))
        with pytest.raises(ValueError):
            vec.transform(np.random.randn(10, 5, 100))

    def test_fit_stores_shape(self):
        X = np.random.randn(3, 7, 12)
        vec = Vectorizer()
        vec.fit(X)
        assert vec.features_shape_ == (7, 12)
