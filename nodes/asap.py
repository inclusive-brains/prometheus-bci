import json
import numpy as np
from timeflux.core.node import Node
from timeflux.helpers.port import make_event


class Accumulate(Node):
    """Accumulation of probabilities

    This node accumulates the probabilities of single-trial classifications from a ML node.
    When enough confidence is reached for a specific class, a final prediction is made.
    Confidence is defined by the threshold ratio between the two best candidates, after summing the probabilities for each class.
    Optionnaly, a recovery period can be applied for all classes or a specific set of classes. This is useful to avoid
    emitting predictions multiple times for the same epoch.

    Attributes:
        i_model (Port): Single-trial predictions from the ML node, expects DataFrame.
        o_events (Port): Final predictions, provides DataFrame

    Args:
        threshold (float): ratio between the two best candidates to reach confidence (default: 3).
        recovery (int): number of predictions to ignore after a final decision, to avoid classifying twice the same event (default: 5).
        classes (list): if not None, apply the recovery period only for the specified classes (default: None).
        source (string): an optional unique identifier used to differentiate predictions from multiple models.
    """

    def __init__(self, threshold=3, recovery=5, classes=None, source=""):
        self._threshold = threshold
        self._recovery = recovery
        self._source = source
        self._ignore = 0
        self._classes = classes
        self._ba = BayesianAccumulation() # TODO: dynamic detection of classes

    def update(self):

        # Loop through the model events
        if self.i_model.ready():
            for timestamp, row in self.i_model.data.iterrows():
                # Check if the model is fitted and forward the event
                if row.label == "ready":
                    self.o.data = make_event("ready", False)
                    return
                # Check probabilities
                elif row.label == "predict_proba":
                    # Check the recovery counter
                    if self._ignore > 0:
                        self._ignore -= 1
                        continue
                    # Accumulate
                    proba = json.loads(row["data"])["result"]
                    scores = self._ba.predict_proba(proba)
                    # Sort
                    indices = np.flip(np.argsort(scores))
                    if len(indices) < 2:
                        return
                    if (scores[indices[1]] * self._threshold) < scores[indices[0]]:
                        # Make a final decision
                        meta = {"target": int(indices[0]), "source": self._source}
                        self.o.data = make_event("predict", meta, False)
                        self.logger.debug(meta)
                        self._ba.reset()
                        if self._classes is None or indices[0] in self._classes:
                            self._ignore = self._recovery


class BayesianAccumulation:
    """Motor Imagery classification, using a cumulative window MAP based classifier, updating probability after each sliding window.

    Parameters
    ----------
    n_classes : int, (default 2)
        The number of MI class
    class_prior : list, (default None)
        The prior probability on class.
    """

    def __init__(self, n_classes=2, class_prior=None):
        self.n_classes = n_classes
        self.reset(class_prior)

    def reset(self, class_prior=None):
        """Reset the probabilities of classes
        It must be called at the beginning of each trial
        Parameters
        ----------
        class_prior : list, (default None)
            The prior probability on class
        Returns
        -------
        self : MIBayesianAcc instance
            The MIBayesianAcc instance.
        """
        if class_prior is None:
            self.class_prior = np.ones(self.n_classes)
        else:
            if len(class_prior) != self.n_classes:
                raise ValueError(
                    "Length of character_prior is different from n_characters"
                )
            self.class_prior = np.asarray(class_prior)
        self.class_prior /= self.class_prior.sum()

        self.class_proba = self.class_prior.copy()
        return self

    def predict_proba(self, erd_likelihood):
        """Predict probability of each character after a new trial.
        Parameters
        ----------
        erd_likelihood : array-like, shape (n_classes,)
            array-like containing the likelihoods of ERD/S (MI class) on this new window.
        Returns
        -------
        class_proba : ndarray, shape (n_classes,)
            probability for each class cumulated across trials.
        """
        if len(erd_likelihood) != self.n_classes:
            raise ValueError(f"erd_likelihood must contain {self.n_classes} values")

        self.class_proba *= erd_likelihood

        sum = self.class_proba.sum()
        if sum == 0:
            # Just in case (avoid division by 0)
            sum = self.n_classes
            self.reset()

        class_proba = self.class_proba / sum

        return class_proba