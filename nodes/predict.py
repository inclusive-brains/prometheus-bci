import json
import numpy as np
from timeflux.core.node import Node
from timeflux.helpers.port import make_event


class Accumulate(Node):
    """Accumulation of probabilities

    This node accumulates the probabilities of single-trial classifications from a ML node.
    When enough confidence is reached for a specific class, a final prediction is made.
    Confidence is defined by the threshold ratio between the two best candidates, after adding or multiplying the probabilities
    for each class.
    Optionnaly, a recovery period can be applied for all classes or a specific set of classes. This is useful to avoid
    emitting predictions multiple times for the same epoch.

    Attributes:
        i_model (Port): Single-trial predictions from the ML node, expects DataFrame.
        i_reset (Port): Reset events for updating arguments, expects DataFrame.
        o_events (Port): Final predictions and optional feedback, provides DataFrame

    Args:
        threshold (float): ratio between the two best candidates to reach confidence (default: 2).
        buffer_size (int): number of predictions to accumulate for each class (default: 10).
        recovery (int): number of epochs to ignore after a final decision, to avoid classifying the same event twice (default: 5).
        scorer (string): either 'sum' or 'prod' (default: 'sum').
        feedback (bool): if True, continuous feedback events will be sent (default: False).
        classes (list): if not None, apply the recovery period only for the specified classes (default: None).
        source (string): an optional unique identifier used to differentiate predictions from multiple models.
    """

    def __init__(self, threshold=2, buffer_size=10, recovery=5, scorer="sum", feedback=False, classes=None, source=""):
        self._threshold = threshold
        self._buffer_size = buffer_size
        self._recovery = recovery
        self._scorer = scorer
        self._feedback = feedback
        self._classes = classes
        self._source = source
        self._buffer = []
        self._ignore = 0

    def update(self):

        # Loop through the reset events
        if self.i_reset.ready():
            for timestamp, row in self.i_reset.data.iterrows():
                if row.label == f"reset_{self._source}_accumulation":
                    self._reset(json.loads(row["data"]))
                if row.label == f"get_{self._source}_accumulation":
                    meta = {"threshold": self._threshold, "buffer_size": self._buffer_size, "recovery": self._recovery, "scorer": self._scorer, "source": self._source}
                    self.o.data = make_event(f"accumulation", meta, False)

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
                    # Append to buffer
                    proba = json.loads(row["data"])["result"]
                    self._buffer.append(proba)
                    if len(self._buffer) > self._buffer_size:
                        self._buffer.pop(0)
                    # Score
                    scores = getattr(self, f"_scorer_{self._scorer}")()
                    scores /= scores.sum() # Not strictly required but more readable
                    # Send continuous feedback
                    if self._feedback:
                        meta = {"scores": list(scores), "source": self._source}
                        self.o.data = make_event("feedback", meta, False)
                    # Sort
                    indices = np.flip(np.argsort(scores))
                    if len(indices) < 2:
                        return
                    if (scores[indices[1]] * self._threshold) < scores[indices[0]]:
                        # Make a final decision and reset the buffer
                        meta = {"target": int(indices[0]), "scores": list(scores), "accumulation": len(self._buffer), "source": self._source}
                        self.o.data = make_event("predict", meta, False)
                        self.logger.debug(meta)
                        self._buffer = []
                        if self._classes is None or indices[0] in self._classes:
                            self._ignore = self._recovery

    def _reset(self, settings):
        if settings.get("threshold"): self._threshold = settings["threshold"]
        if settings.get("buffer_size"): self._buffer_size = settings["buffer_size"]
        if settings.get("recovery"): self._recovery = settings["recovery"]
        if settings.get("bias"): self._bias = settings["bias"]
        if settings.get("scorer"): self._scorer = settings["scorer"]
        if settings.get("feedback") != None: self._feedback = settings["feedback"]
        self._buffer = []
        self._ignore = 0

    def _scorer_sum(self):
        return np.sum(np.array(self._buffer), axis=0)

    def _scorer_prod(self):
        return np.prod(np.array(self._buffer), axis=0)
