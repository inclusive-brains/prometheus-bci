# This estimator was taken from MNE
# LICENSE: https://github.com/mne-tools/mne-python/blob/main/LICENSE.txt

import numpy as np
from sklearn.base import TransformerMixin

class Vectorizer(TransformerMixin):
    """Transform n-dimensional array into 2D array of n_samples by n_features.
    This class reshapes an n-dimensional array into an n_samples * n_features
    array, usable by the estimators and transformers of scikit-learn.
    Attributes
    ----------
    features_shape_ : tuple
         Stores the original shape of data.
    Examples
    --------
    clf = make_pipeline(SpatialFilter(), _XdawnTransformer(), Vectorizer(),
                        LogisticRegression())
    """

    def fit(self, X, y=None):
        """Store the shape of the features of X.
        Parameters
        ----------
        X : array-like
            The data to fit. Can be, for example a list, or an array of at
            least 2d. The first dimension must be of length n_samples, where
            samples are the independent samples used by the estimator
            (e.g. n_epochs for epoched data).
        y : None | array, shape (n_samples,)
            Used for scikit-learn compatibility.
        Returns
        -------
        self : instance of Vectorizer
            Return the modified instance.
        """
        X = np.asarray(X)
        self.features_shape_ = X.shape[1:]
        return self

    def transform(self, X):
        """Convert given array into two dimensions.
        Parameters
        ----------
        X : array-like
            The data to fit. Can be, for example a list, or an array of at
            least 2d. The first dimension must be of length n_samples, where
            samples are the independent samples used by the estimator
            (e.g. n_epochs for epoched data).
        Returns
        -------
        X : array, shape (n_samples, n_features)
            The transformed data.
        """
        X = np.asarray(X)
        if X.shape[1:] != self.features_shape_:
            raise ValueError("Shape of X used in fit and transform must be "
                             "same")
        return X.reshape(len(X), -1)

    def fit_transform(self, X, y=None):
        """Fit the data, then transform in one step.
        Parameters
        ----------
        X : array-like
            The data to fit. Can be, for example a list, or an array of at
            least 2d. The first dimension must be of length n_samples, where
            samples are the independent samples used by the estimator
            (e.g. n_epochs for epoched data).
        y : None | array, shape (n_samples,)
            Used for scikit-learn compatibility.
        Returns
        -------
        X : array, shape (n_samples, -1)
            The transformed data.
        """
        return self.fit(X).transform(X)

    def inverse_transform(self, X):
        """Transform 2D data back to its original feature shape.
        Parameters
        ----------
        X : array-like, shape (n_samples,  n_features)
            Data to be transformed back to original shape.
        Returns
        -------
        X : array
            The data transformed into shape as used in fit. The first
            dimension is of length n_samples.
        """
        X = np.asarray(X)
        if X.ndim not in (2, 3):
            raise ValueError("X should be of 2 or 3 dimensions but has shape "
                             "%s" % (X.shape,))
        return X.reshape(X.shape[:-1] + self.features_shape_)
