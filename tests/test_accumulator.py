"""Tests for the accumulator scorer functions (sum, prod)."""

import numpy as np
import pytest
from nodes.classification.accumulator import Accumulate


def _make_accumulator(**kwargs):
    """Create an Accumulate node with mocked Timeflux internals."""
    acc = Accumulate.__new__(Accumulate)
    acc._threshold = kwargs.get("threshold", 2)
    acc._buffer_size = kwargs.get("buffer_size", 10)
    acc._recovery = kwargs.get("recovery", 5)
    acc._scorer = kwargs.get("scorer", "sum")
    acc._feedback = kwargs.get("feedback", False)
    acc._classes = kwargs.get("classes", None)
    acc._source = kwargs.get("source", "")
    acc._buffer = kwargs.get("buffer", [])
    acc._ignore = 0
    return acc


class TestAccumulatorScorers:

    def test_scorer_sum(self):
        """Sum scorer should add probabilities element-wise."""
        acc = _make_accumulator(buffer=[
            [0.7, 0.3],
            [0.6, 0.4],
            [0.8, 0.2],
        ])
        scores = acc._scorer_sum()
        np.testing.assert_array_almost_equal(scores, [2.1, 0.9])

    def test_scorer_prod(self):
        """Prod scorer should multiply probabilities element-wise."""
        acc = _make_accumulator(buffer=[
            [0.7, 0.3],
            [0.6, 0.4],
            [0.8, 0.2],
        ])
        scores = acc._scorer_prod()
        np.testing.assert_array_almost_equal(scores, [0.7*0.6*0.8, 0.3*0.4*0.2])

    def test_scorer_sum_single_entry(self):
        """Sum of a single entry should be the entry itself."""
        acc = _make_accumulator(buffer=[[0.5, 0.5]])
        scores = acc._scorer_sum()
        np.testing.assert_array_almost_equal(scores, [0.5, 0.5])

    def test_scorer_sum_three_classes(self):
        """Sum scorer should work with more than 2 classes."""
        acc = _make_accumulator(buffer=[
            [0.5, 0.3, 0.2],
            [0.4, 0.4, 0.2],
        ])
        scores = acc._scorer_sum()
        np.testing.assert_array_almost_equal(scores, [0.9, 0.7, 0.4])

    def test_reset_clears_buffer(self):
        """_reset should clear the buffer and ignore counter."""
        acc = _make_accumulator(buffer=[[0.5, 0.5]])
        acc._ignore = 3
        acc._reset({"threshold": 5})
        assert acc._buffer == []
        assert acc._ignore == 0
        assert acc._threshold == 5

    def test_reset_partial_update(self):
        """_reset should only update provided settings."""
        acc = _make_accumulator(threshold=2, buffer_size=10, recovery=5)
        acc._reset({"recovery": 20})
        assert acc._threshold == 2  # unchanged
        assert acc._recovery == 20  # updated
