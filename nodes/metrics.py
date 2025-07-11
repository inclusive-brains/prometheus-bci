import re
import pandas as pd
import numpy as np
from scipy.signal import welch
from scipy.integrate import simps
from timeflux.core.node import Node
from timeflux.core.exceptions import WorkerInterrupt
from timeflux.helpers.port import make_event

class CognitiveLoad(Node):
    """Not a cognitive load metric.

    Cognitive load and fatigue encompass several situations, related to task engagement and arousal. A comprehensive review [1]
    points out that the theory of mental "ressource", while appealing, is not supported by any experimental evidence despite
    several decades of research. It is thus better to evaluate cognitive with respect to task performance. Therefore, our pipeline
    monitors variations of alpha rhythm [2, 3, 6] over occipital/parietal sites and theta [4, 5] over frontal/prefrontal areas.

    Attributes:
        i (Port): Default data input, expects DataFrame.
        o (Port): Cognitive load metric, provides DataFrame

    See:
        [1] Dehais, F., Lafont, A., Roy, R., & Fairclough, S. (2020). A neuroergonomics approach to mental workload, engagement and human performance. Frontiers in neuroscience, 14, 268.
        [2] Gouraud, J., Delorme, A., and Berberian, B. (2018). Out of the loop, in your bubble: mind wandering is independent from automation reliability, but influences task engagement. Front. Hum. Neurosci. 12:383. doi: 10.3389/fnhum.2018.00383
        [3] Braboszcz, C., and Delorme, A. (2011). Lost in thoughts: neural markers of low alertness during mind wandering. Neuroimage 54, 3040–3047. doi: 10.1016/j.neuroimage.2010.10.008
        [4] Gärtner, M., Rohde-Liebenau, L., Grimm, S., and Bajbouj, M. (2014). Working memory-related frontal theta activity is decreased under acute stress. Psychoneuroendocrinology 43, 105–113. doi: 10.1016/j.psyneuen.2014.02.009
        [5] Ewing, K. C., Fairclough, S. H., and Gilleade, K. (2016). Evaluation of an adaptive game that uses EEG measures validated during the design process as inputs to a biocybernetic loop. Front. Hum. Neurosci. 10:223. doi: 10.3389/fnhum.2016.00223
        [6] Fairclough, S. H., and Ewing, K. (2017). The effect of task demand and incentive on neurophysiological and cardiovascular markers of effort. Int. J. Psychophysiol. 119, 58–66. doi: 10.1016/j.ijpsycho.2017.01.007
        [7] Picot, A., Charbonnier, S., & Caplier, A. (2008, August). On-line automatic detection of driver drowsiness using a single electroencephalographic channel. In 2008 30th Annual International Conference of the IEEE Engineering in Medicine and Biology Society (pp. 3864-3867). IEEE.
    """

    def __init__(self):
        self._channels = None
        self._max_value = 1.5 # for normalization

    def update(self):

        if not self.i.ready():
            return

        if not self._channels:
            self._channels = list(self.i.data.columns)
            r = re.compile("^O|P") # Match occipital and parietal channels
            self._back = [channel for channel in self._channels if r.match(channel)]
            if not self._back:
                self.logger.error("No occipital nor parietal channel found")
                raise WorkerInterrupt()
            r = re.compile("^F") # Match frontal and prefrontal channels
            self._front = [channel for channel in self._channels if r.match(channel)]
            if not self._front:
                self.logger.error("No frontal nor prefrontal channel found")
                raise WorkerInterrupt()

        # Compute metric
        bands = { "theta": (4, 8), "alpha": (8, 12)}
        bp = bandpower(self.i.data, self.i.meta["rate"], bands, normalize=True)
        alpha = bp["alpha"].loc[self._back].mean()
        theta = bp["theta"].loc[self._front].mean()
        if theta > 0:
            metric =  alpha / theta
            metric /= self._max_value
            if metric > 1: metric = 1.
            #self.o.set([metric], names=["cognitiveload"])
            self.o.data = make_event("cognitive_load", metric)


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
        bandpower[:, i] = simps(psd[:, mask], dx=resolution)

    if normalize:
        total_power = simps(psd, dx=resolution)
        total_power = total_power[..., np.newaxis]
        bandpower /= total_power

    bandpower = pd.DataFrame(bandpower, index=channels, columns=bands.keys())

    return bandpower
