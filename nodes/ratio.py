import re
import pandas as pd
import numpy as np
from scipy.signal import welch
from scipy.integrate import simps
from timeflux.core.node import Node
from timeflux.core.exceptions import WorkerInterrupt
from timeflux.helpers.port import make_event

Regex = str
Band = tuple[int, int]
LocFreq = tuple[Regex, Band]

class Ratio(Node):
    """Computes the ratio of two localized frequency bands.

    Args:
        a (LocFreq): a tuple containing a regular expression matching the channels of interest and another tuple containing the two frequences
        b (LocFreq): a tuple containing a regular expression matching the channels of interest and another tuple containing the two frequences
        normalization (float): Maximum expected value used for normalization. Default: 1.5.

    Attributes:
        i (Port): Default data input, expects DataFrame.
        o (Port): Cognitive load metric, provides DataFrame
    """

    def __init__(self, a: LocFreq, b: LocFreq, metric="ratio", normalization=1.5):
        self.a = a
        self.b = b
        self.metric = metric
        self._channels = None
        self._max_value = normalization

    def update(self):

        if not self.i.ready():
            return

        if not self._channels:
            self._channels = list(self.i.data.columns)
            r = re.compile(self.a[0])
            self._channels_a = [channel for channel in self._channels if r.match(channel)]
            if not self._channels_a:
                self.logger.error(f"No channel matching `{self.a[0]}`")
                raise WorkerInterrupt()
            r = re.compile(self.b[0])
            self._channels_b = [channel for channel in self._channels if r.match(channel)]
            if not self._channels_b:
                self.logger.error(f"No channel matching `{self.b[0]}`")
                raise WorkerInterrupt()

        # Compute metric
        bands = { "a": tuple(self.a[1]), "b": tuple(self.b[1])}
        bp = bandpower(self.i.data, self.i.meta["rate"], bands, normalize=True)
        a = bp["a"].loc[self._channels_a].mean()
        b = bp["b"].loc[self._channels_b].mean()
        if b > 0:
            metric =  a / b
            metric /= self._max_value
            if metric > 1: metric = 1.
            #self.o.set([metric], names=["cognitiveload"])
            self.o.data = make_event(self.metric, metric)


def bandpower(data, rate, bands, normalize=False):

    channels = list(data.columns)
    data = data.values.T
    flat = list(sum(bands.values(), ()))
    fmin, fmax = min(flat), max(flat)
    nperseg = int((2 / fmin) * rate)
    freqs, psd = welch(data, rate, nperseg=nperseg)

    mask = np.logical_and(freqs >= fmin, freqs <= fmax)
    psd = psd[:, mask]
    freqs = freqs[mask]
    resolution = freqs[1] - freqs[0]
    bandpower = np.zeros((len(channels), len(bands.keys())), dtype=np.float64)

    for i, band in enumerate(bands.values()):
        fmin, fmax = band
        mask = np.logical_and(freqs >= fmin, freqs <= fmax)
        if np.sum(mask) == 1:
            bandpower[:, i] = psd[:, mask].flatten()
        else:
            bandpower[:, i] = simps(psd[:, mask], dx=resolution)

    if normalize:
        total_power = simps(psd, dx=resolution)
        total_power = total_power[..., np.newaxis]
        bandpower /= total_power

    bandpower = pd.DataFrame(bandpower, index=channels, columns=bands.keys())

    return bandpower
