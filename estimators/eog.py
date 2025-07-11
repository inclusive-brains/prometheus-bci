import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

class EOGFeature(TransformerMixin, BaseEstimator):
    """Extract feature for blink prediction
    Parameter rescale multiply the signal 1e9 to obtain scaled values
    """

    def __init__(self, rescale=True):

        self.rescale = rescale

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if self.rescale:
            X *= 1e9
        return np.array(
            [
                X.mean(axis=1),
                X.max(axis=1),
                X.min(axis=1),
                X.std(axis=1),
                X.argmax(axis=1) - X.argmin(axis=1),
            ]
        ).T

    def fit_transform(self, X, y=None):
        return self.transform(X)