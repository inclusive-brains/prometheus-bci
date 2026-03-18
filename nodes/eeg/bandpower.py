from timeflux.nodes.window import TimeWindow
from scipy.signal import coherence
from itertools import combinations
import numpy as np
import pandas as pd

class Power(TimeWindow):
    """ Average of squared samples on a moving window

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame and meta.

    Args:
        length (float): Window length
        step (float): Step length
        average (mean|median) : Average method

    """

    def __init__(self, length, step, average='median'):
        super().__init__(length=length, step=step)
        if average == 'mean':
            self._average_method = np.mean
        else:
            self._average_method = np.median

    def update(self):
        super().update()
        if not self.o.ready(): return
        self.o.data = pd.DataFrame((self.o.data ** 2).apply(self._average_method),
                                   columns=[self.i.data.index[-1]]).T

class MeanBandPower(TimeWindow):
    """ Average of squared samples on a moving window using mean

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame and meta.

    Args:
        length (float): Window length
        step (float): Step length
    """

    def __init__(self, length, step):
        super().__init__(length=length, step=step)

    def update(self):
        super().update()
        if not self.o.ready(): return
        
        # Calcule la moyenne des bandpowers sur toutes les électrodes
        mean_bandpower = self.o.data.mean(axis=1).mean()

        # Crée un DataFrame pour la sortie avec la moyenne des moyennes
        self.o.data = pd.DataFrame([mean_bandpower], columns=[self.i.data.index[-1]]).T

class MedianBandPower(TimeWindow):
    """ Average of squared samples on a moving window using median

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame and meta.

    Args:
        length (float): Window length
        step (float): Step length
    """

    def __init__(self, length, step):
        super().__init__(length=length, step=step)

    def update(self):
        super().update()
        if not self.o.ready(): return
        
        # Calcule la médiane des bandpowers sur toutes les électrodes
        median_bandpower = self.o.data.median(axis=1).median()

        # Crée un DataFrame pour la sortie avec la médiane des médianes
        self.o.data = pd.DataFrame([median_bandpower], columns=[self.i.data.index[-1]]).T

class MeanFullBandPower(TimeWindow):
    """ Mean of bandpowers on a moving window for each frequency band

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame and meta.

    Args:
        length (float): Window length
        step (float): Step length
    """

    def __init__(self, length, step):
        super().__init__(length=length, step=step)

    def update(self):
        super().update()
        if not self.o.ready():
            return
        
        # Group the columns by band (assuming column names are in the format 'Electrode_Band')
        bands = ['delta', 'theta', 'alpha', 'beta', 'gamma']
        mean_bandpower = {}
        
        for band in bands:
            band_columns = [col for col in self.o.data.columns if band in col]
            if band_columns:
                mean_bandpower[band] = self.o.data[band_columns].mean(axis=1).mean()

        # Create DataFrame for output
        timestamp = self.i.data.index[-1]
        mean_bandpower_df = pd.DataFrame(mean_bandpower, index=[timestamp])
        
        self.o.data = mean_bandpower_df

class MedianFullBandPower(TimeWindow):
    """ Median of bandpowers on a moving window for each frequency band

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame and meta.

    Args:
        length (float): Window length
        step (float): Step length
    """

    def __init__(self, length, step):
        super().__init__(length=length, step=step)

    def update(self):
        super().update()
        if not self.o.ready():
            return
        
        # Group the columns by band (assuming column names are in the format 'Electrode_Band')
        bands = ['delta', 'theta', 'alpha', 'beta', 'gamma']
        median_bandpower = {}
        
        for band in bands:
            band_columns = [col for col in self.o.data.columns if band in col]
            if band_columns:
                median_bandpower[band] = self.o.data[band_columns].median(axis=1).median()

        # Create DataFrame for output
        timestamp = self.i.data.index[-1]
        median_bandpower_df = pd.DataFrame(median_bandpower, index=[timestamp])
        
        self.o.data = median_bandpower_df

class Coherence(TimeWindow):
    """ Coherence between electrode pairs for each frequency band

    Attributes:
        i (Port): Default input, expects DataFrame.
        o (Port): Default output, provides DataFrame.

    Args:
        length (float): Window length
        step (float): Step length
        sfreq (float): Sampling frequency
        bands (dict): Frequency bands to compute coherence
    """

    def __init__(self, length, step, sfreq, bands):
        super().__init__(length=length, step=step)
        self.sfreq = sfreq
        self.bands = bands

    def update(self):
        super().update()
        if not self.o.ready():
            return

        data = self.i.data

        # Initialize band coherences dictionary
        band_coherences = {band: [] for band in self.bands}
        
        electrodes = data.columns
        pairs = list(combinations(electrodes, 2))

        for (el1, el2) in pairs:
            f, Cxy = coherence(data[el1], data[el2], fs=self.sfreq, nperseg=min(len(data), 256))

            for band, (low, high) in self.bands.items():
                band_idx = np.where((f >= low) & (f <= high))[0]
                if len(band_idx) > 0:
                    band_coh = np.mean(Cxy[band_idx])
                    band_coherences[band].append(band_coh)

        # Calculate mean coherence for each band, ensuring no empty lists
        mean_band_coherences = {band: np.mean(cohs) if cohs else np.nan for band, cohs in band_coherences.items()}

        # Ensure values are between 0 and 1
        mean_band_coherences = {band: np.clip(value, 0, 1) if not np.isnan(value) else 0 for band, value in mean_band_coherences.items()}

        # Create DataFrame for output
        self.o.data = pd.DataFrame([mean_band_coherences], index=[self.i.data.index[-1]]).T
