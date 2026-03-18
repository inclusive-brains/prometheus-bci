"""Tests for BayesianAccumulation classifier."""

import numpy as np
import pytest
from nodes.classification.bayesian import BayesianAccumulation


class TestBayesianAccumulation:

    def test_uniform_prior(self):
        """Default prior should be uniform."""
        ba = BayesianAccumulation(n_classes=3)
        np.testing.assert_array_almost_equal(ba.class_proba, [1/3, 1/3, 1/3])

    def test_custom_prior_floats(self):
        """Custom prior (as floats) should be normalized."""
        ba = BayesianAccumulation(n_classes=2, class_prior=[3.0, 1.0])
        np.testing.assert_array_almost_equal(ba.class_proba, [0.75, 0.25])

    def test_custom_prior_ints(self):
        """Custom prior as integers should also work (cast to float)."""
        ba = BayesianAccumulation(n_classes=2, class_prior=[3, 1])
        np.testing.assert_array_almost_equal(ba.class_proba, [0.75, 0.25])

    def test_invalid_prior_length(self):
        """Prior length mismatch should raise ValueError."""
        with pytest.raises(ValueError):
            BayesianAccumulation(n_classes=2, class_prior=[1, 1, 1])

    def test_single_update(self):
        """After one update favoring class 0, its probability should be higher."""
        ba = BayesianAccumulation(n_classes=2)
        proba = ba.predict_proba([0.8, 0.2])
        assert proba[0] > proba[1]

    def test_probabilities_sum_to_one(self):
        """Output probabilities should always sum to 1."""
        ba = BayesianAccumulation(n_classes=3)
        for _ in range(5):
            proba = ba.predict_proba([0.5, 0.3, 0.2])
        assert pytest.approx(proba.sum(), abs=1e-10) == 1.0

    def test_accumulation_strengthens_belief(self):
        """Repeated evidence for class 0 should increase its probability."""
        ba = BayesianAccumulation(n_classes=2)
        prev = 0.5
        for _ in range(5):
            proba = ba.predict_proba([0.7, 0.3])
            assert proba[0] >= prev
            prev = proba[0]

    def test_reset(self):
        """After reset, probabilities should return to uniform."""
        ba = BayesianAccumulation(n_classes=2)
        ba.predict_proba([0.9, 0.1])
        ba.reset()
        np.testing.assert_array_almost_equal(ba.class_proba, [0.5, 0.5])

    def test_invalid_likelihood_length(self):
        """Likelihood with wrong number of classes should raise."""
        ba = BayesianAccumulation(n_classes=2)
        with pytest.raises(ValueError):
            ba.predict_proba([0.5, 0.3, 0.2])

    def test_zero_likelihood_resets(self):
        """If all likelihoods lead to zero sum, should reset to avoid crash."""
        ba = BayesianAccumulation(n_classes=2)
        # This should not raise
        proba = ba.predict_proba([0.0, 0.0])
        assert proba.sum() > 0
