import neurokit2 as nk
import pandas as pd
from timeflux.core.node import Node
from scipy import signal
import numpy as np

class PPGSimulator(Node):
    def __init__(self):
        super().__init__()

    def update(self):
        # Simulate a PPG Signal
        ppg_signal = nk.ppg_simulate(duration=60, sampling_rate=25, heart_rate=70)
        
        # Convert it to a DataFrame
        df = pd.DataFrame(ppg_signal, columns=['ppg_signal'])
        
        # Create a datetime index with Timeflux's UTC
        now = pd.Timestamp.utcnow()
        df.index = pd.date_range(start=now, periods=len(ppg_signal), freq='1ms')  

        # Output the PPG signal 
        self.o.data = df

class EDASimulator(Node):
    def __init__(self):
        super().__init__()

    def update(self):

        # Simulate an EDA signal: https://neuropsychology.github.io/NeuroKit/examples/signal_simulation/signal_simulation.html
        eda_signal = nk.eda_simulate(duration=20, scr_number=1, drift=-0.01, noise=0.01)
    
        # Convert it to a DataFrame
        df = pd.DataFrame(eda_signal, columns=['eda_signal'])
        
        # Create a datetime index with Timeflux's UTC
        now = pd.Timestamp.utcnow()
        df.index = pd.date_range(start=now, periods=len(eda_signal), freq='0.1ms')  

        # Output the EDA Signal
        self.o.data = df

class ECGSimulator(Node):
    def __init__(self):
        super().__init__()

    def update(self):
        
        # Simulate an ECG Signal: https://neuropsychology.github.io/NeuroKit/examples/signal_simulation/signal_simulation.html
        ecg_signal = nk.ecg_simulate(duration=20, noise=0.01, heart_rate=70) 
    
        # Convert it to a DataFrame
        df = pd.DataFrame(ecg_signal, columns=['ecg_signal'])
        
        # Create a datetime index with Timeflux's UTC
        now = pd.Timestamp.utcnow()
        df.index = pd.date_range(start=now, periods=len(ecg_signal), freq='1ms')  

        # Output the ECG Signal
        self.o.data = df

class RespiratorySignalExtractor(Node):
    def __init__(self):
        super().__init__()

    def update(self):
        if self.i.ready():
            ppg_signal = self.i.data['ppg_signal'].values

            # Clean the PPG signal
            ppg_cleaned = nk.ppg_clean(ppg_signal, sampling_rate=100)
            
            # Find PPG peaks
            peaks, _ = nk.ppg_peaks(ppg_cleaned, sampling_rate=100)
            
            # Extract peak locations
            peak_locations = np.where(peaks['PPG_Peaks'] == 1)[0]
            
            if len(peak_locations) > 1:
                # Calculate inter-beat intervals (IBIs)
                ibis = np.diff(peak_locations) / 100  # Convert to seconds
                
                # Interpolate IBIs to create a continuous signal
                ibi_signal = np.interp(np.arange(len(ppg_cleaned)), peak_locations[1:], ibis)
                
                # Apply a bandpass filter to isolate respiratory frequencies
                sos = signal.butter(3, [0.1, 0.5], btype='bandpass', fs=100, output='sos')
                rsp_signal = signal.sosfilt(sos, ibi_signal)
                
                # Output the respiratory signal
                self.o.data = pd.DataFrame({'rsp_signal': rsp_signal}, index=self.i.data.index)
            else:
                print("Not enough peaks detected to extract respiratory signal")
                self.o.data = None
        else:
            self.o.data = None

class RespiratoryMetricsCalculator(Node):
    def __init__(self):
        super().__init__()

    def calculate_respiratory_amplitude(self, rsp_signal):
        peaks, _ = signal.find_peaks(rsp_signal)
        troughs, _ = signal.find_peaks(-rsp_signal)
        
        if len(peaks) > 1 and len(troughs) > 1:
            peak_amplitudes = rsp_signal[peaks]
            trough_amplitudes = rsp_signal[troughs]
            
            min_length = min(len(peak_amplitudes), len(trough_amplitudes))
            peak_amplitudes = peak_amplitudes[:min_length]
            trough_amplitudes = trough_amplitudes[:min_length]
            
            amplitudes = peak_amplitudes - trough_amplitudes
            mean_amplitude = np.mean(amplitudes)
            
            return mean_amplitude
        else:
            return None

    def calculate_respiratory_variance(self, rsp_signal):
        return np.var(rsp_signal)

    def update(self):
        if self.i.ready():
            rsp_signal = self.i.data['rsp_signal'].values
            
            amplitude = self.calculate_respiratory_amplitude(rsp_signal)
            variance = self.calculate_respiratory_variance(rsp_signal)
            if amplitude is not None:
                self.o.data = pd.DataFrame({
                    'respiratory_amplitude': [amplitude],
                    'respiratory_variance': [variance]
                }, index=[self.i.data.index[-1]])
            else:
                print("Unable to calculate respiratory metrics")
                self.o.data = None
        else:
            self.o.data = None

class RespiratoryRateCalculator(Node):
    def __init__(self):
        super().__init__()

    def calculate_respiratory_rate(self, rsp_signal, sampling_rate):
        peaks, _ = signal.find_peaks(rsp_signal)
        
        if len(peaks) > 1:
            mean_interval = np.mean(np.diff(peaks)) / sampling_rate
            return 60 / mean_interval
        else:
            return None

    def update(self):
        if self.i.ready():
            rsp_signal = self.i.data['rsp_signal'].values
            respiratory_rate = self.calculate_respiratory_rate(rsp_signal, sampling_rate=100)
            
            if respiratory_rate is not None:
                self.o.data = pd.DataFrame({'respiratory_rate': [respiratory_rate]}, index=[self.i.data.index[-1]])
            else:
                print("Unable to calculate respiratory rate")
                self.o.data = None
        else:
            self.o.data = None

class StressCalculator(Node):
    def __init__(self, min_rate=10, max_rate=40):
        """
        Initialize the StressCalculator node.
        
        :param min_rate: The respiratory rate (breaths per minute) that corresponds to minimum stress (score 0)
        :param max_rate: The respiratory rate (breaths per minute) that corresponds to maximum stress (score 100)
        """
        super().__init__()
        self.min_rate = min_rate
        self.max_rate = max_rate

    def calculate_score(self, respiratory_rate):
        """
        Calculate a normalized stress score based on the respiratory rate.
        
        :param respiratory_rate: The current respiratory rate in breaths per minute
        :return: A stress score between 0 and 100
        """
        # Clip the respiratory rate to be within the min_rate and max_rate
        rate = np.clip(respiratory_rate, self.min_rate, self.max_rate)
        
        # Normalize the rate to a 0-100 scale
        normalized_score = ((rate - self.min_rate) / (self.max_rate - self.min_rate)) * 100
        
        return round(normalized_score, 2)

    def update(self):
        if self.i.ready():
            if 'respiratory_rate' not in self.i.data.columns:
                print("Error: 'respiratory_rate' column not found in input data")
                self.o.data = None
                return
            
            respiratory_rate = self.i.data['respiratory_rate'].values[0]
            stress_score = self.calculate_score(respiratory_rate)
            
            self.o.data = pd.DataFrame({'stress_score': [stress_score]}, index=[self.i.data.index[-1]])
        else:
            self.o.data = None

class CognitiveLoadCalculator(Node):
    def __init__(self, min_rate=18, max_rate=30):
        """
        Initialize the CognitiveLoadCalculator node.
        
        :param min_rate: The respiratory rate (breaths per minute) that corresponds to minimum cognitive load (score 0)
        :param max_rate: The respiratory rate (breaths per minute) that corresponds to maximum cognitive load (score 100)
        """
        super().__init__()
        self.min_rate = min_rate
        self.max_rate = max_rate

    def calculate_score(self, respiratory_rate):
        """
        Calculate a normalized cognitive load score based on the respiratory rate.
        
        :param respiratory_rate: The current respiratory rate in breaths per minute
        :return: A cognitive load score between 0 and 100
        """
        # Clip the respiratory rate to be within the min_rate and max_rate
        rate = np.clip(respiratory_rate, self.min_rate, self.max_rate)
        
        # Normalize the rate to a 0-100 scale
        normalized_score = ((rate - self.min_rate) / (self.max_rate - self.min_rate)) * 100
        
        return round(normalized_score, 2)

    def update(self):
        if self.i.ready():
            if 'respiratory_rate' not in self.i.data.columns:
                print("Error: 'respiratory_rate' column not found in input data")
                self.o.data = None
                return
            
            respiratory_rate = self.i.data['respiratory_rate'].values[0]
            CognitiveLoad_score = self.calculate_score(respiratory_rate)
            
            self.o.data = pd.DataFrame({'CognitiveLoad_score': [CognitiveLoad_score]}, index=[self.i.data.index[-1]])
        else:
            self.o.data = None

class AwakenessCalculator(Node):
    def __init__(self, min_rate=6, max_rate=15):
        """
        Initialize the AwakenessCalculator node.
        
        :param min_rate: The respiratory rate (breaths per minute) that corresponds to minimum awakeness (score 0)
        :param max_rate: The respiratory rate (breaths per minute) that corresponds to maximum awakeness (score 100)
        """
        super().__init__()
        self.min_rate = min_rate
        self.max_rate = max_rate

    def calculate_score(self, respiratory_rate):
        """
        Calculate a normalized awakeness score based on the respiratory rate.
        
        :param respiratory_rate: The current respiratory rate in breaths per minute
        :return: An awakeness score between 0 and 100
        """
        # Clip the respiratory rate to be within the min_rate and max_rate
        rate = np.clip(respiratory_rate, self.min_rate, self.max_rate)
        
        # Normalize the rate to a 0-100 scale
        normalized_score = ((rate - self.min_rate) / (self.max_rate - self.min_rate)) * 100
        
        return round(normalized_score, 2)

    def update(self):
        if self.i.ready():
            if 'respiratory_rate' not in self.i.data.columns:
                print("Error: 'respiratory_rate' column not found in input data")
                self.o.data = None
                return
            
            respiratory_rate = self.i.data['respiratory_rate'].values[0]
            awakeness_score = self.calculate_score(respiratory_rate)
            
            self.o.data = pd.DataFrame({'awakeness_score': [awakeness_score]}, index=[self.i.data.index[-1]])
        else:
            self.o.data = None

class AttentionCalculator(Node):
    def __init__(self, min_rate=10, max_rate=20):
        """
        Initialize the AttentionCalculator node.
        
        :param min_rate: The respiratory rate (breaths per minute) that corresponds to minimum attention (score 0)
        :param max_rate: The respiratory rate (breaths per minute) that corresponds to maximum attention (score 100)
        """
        super().__init__()
        self.min_rate = min_rate
        self.max_rate = max_rate

    def calculate_score(self, respiratory_rate):
        """
        Calculate a normalized attention score based on the respiratory rate.
        
        :param respiratory_rate: The current respiratory rate in breaths per minute
        :return: An attention score between 0 and 100
        """
        # Clip the respiratory rate to be within the min_rate and max_rate
        rate = np.clip(respiratory_rate, self.min_rate, self.max_rate)
        
        # Normalize the rate to a 0-100 scale
        normalized_score = ((rate - self.min_rate) / (self.max_rate - self.min_rate)) * 100
        
        return round(normalized_score, 2)

    def update(self):
        if self.i.ready():
            if 'respiratory_rate' not in self.i.data.columns:
                print("Error: 'respiratory_rate' column not found in input data")
                self.o.data = None
                return
            
            respiratory_rate = self.i.data['respiratory_rate'].values[0]
            attention_score = self.calculate_score(respiratory_rate)
            
            self.o.data = pd.DataFrame({'attention_score': [attention_score]}, index=[self.i.data.index[-1]])
        else:
            self.o.data = None

class HRVTimeDomainCalculator(Node):
    def __init__(self):
        super().__init__()
        self.last_peak_time = None
        self.rr_intervals = []

    def update(self):
        if self.i.ready():
            for time, row in self.i.data.iterrows():
                if self.last_peak_time is not None:
                    rr_interval = (time - self.last_peak_time).total_seconds() * 100  # Convert to milliseconds
                    self.rr_intervals.append(rr_interval)
                self.last_peak_time = time

            if len(self.rr_intervals) > 1:
                # Convert RR intervals to peak indices
                peak_indices = nk.intervals_to_peaks(self.rr_intervals, sampling_rate=25)

                # Calculate time-domain HRV metrics
                hrv_metrics_time = nk.hrv_time(peak_indices, sampling_rate=25, show=False)

                # Create a DataFrame with the timestamp as the index
                output_df = pd.DataFrame(hrv_metrics_time)
                
                # If you want to use the last peak time as the index for the entire DataFrame
                if self.last_peak_time is not None:
                    output_df.index = [self.last_peak_time]

                # Ensure the index is in UTC datetime format
                # If 'self.last_peak_time' is already a datetime, you might need to convert it to UTC
                # output_df.index = pd.to_datetime(output_df.index).tz_convert('UTC')
                
                # Properly format the output DataFrame
                self.o.data = output_df

class ArousalMetric(Node):

    def __init__(self, weights=None):
        super().__init__()
        if weights is None:
            weights = {'HRV_MeanNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_SDSD': 0.34}
        self.weights = weights
        self.last_peak_time = None

        # Define min and max values for normalization
        self.hrv_meanNN_min = 50
        self.hrv_meanNN_max = 120
        self.hrv_rmssd_min = 20
        self.hrv_rmssd_max = 100
        self.hrv_sdsd_min = 20
        self.hrv_sdsd_max = 100

    def update(self):
        if self.i.ready():
            arousal_metrics = []

            for time, row in self.i.data.iterrows():
                # Retrieve the relevant HRV indices for arousal
                hrv_meanNN = row['HRV_MeanNN']
                hrv_rmssd = row['HRV_RMSSD']
                hrv_sdsd = row['HRV_SDSD']

                # Normalized HRV indices within [0, 1]
                normalized_hrv_meanNN = max(min(1 - ((hrv_meanNN - self.hrv_meanNN_min) / (self.hrv_meanNN_max - self.hrv_meanNN_min)), 1), 0)
                normalized_hrv_rmssd = max(min(1 - ((hrv_rmssd - self.hrv_rmssd_min) / (self.hrv_rmssd_max - self.hrv_rmssd_min)), 1), 0)
                normalized_hrv_sdsd = max(min(1 - ((hrv_sdsd - self.hrv_sdsd_min) / (self.hrv_sdsd_max - self.hrv_sdsd_min)), 1), 0)

                # Calculate the arousal metric
                arousal_metric = (self.weights['HRV_MeanNN'] * normalized_hrv_meanNN +
                                  self.weights['HRV_RMSSD'] * normalized_hrv_rmssd +
                                  self.weights['HRV_SDSD'] * normalized_hrv_sdsd)

                arousal_metrics.append(arousal_metric)

                self.last_peak_time = time

            if arousal_metrics:
                # Create a DataFrame with the calculated metrics
                output_df = pd.DataFrame(arousal_metrics, columns=['PPG_Arousal_Metric'])

                # Use the last detected peak time as the index for the DataFrame
                if self.last_peak_time is not None:
                    output_df.index = [self.last_peak_time] * len(arousal_metrics)

                # Provide data for the next node
                self.o.data = output_df

class AttentionMetric(Node):

    def __init__(self, weights=None):
        super().__init__()
        if weights is None:
            weights = {'HRV_RMSSD': 0.34, 'HRV_SDNN': 0.33, 'HRV_pNN50': 0.33}
        self.weights = weights
        self.last_peak_time = None

        # Define min and max values for normalization
        self.hrv_rmssd_min = 20
        self.hrv_rmssd_max = 100
        self.hrv_sdnn_min = 20
        self.hrv_sdnn_max = 100
        self.hrv_pnn50_min = 0
        self.hrv_pnn50_max = 20

    def update(self):
        if self.i.ready():
            attention_metrics = []

            for time, row in self.i.data.iterrows():
                # Retrieve the HRV indices
                hrv_rmssd = row['HRV_RMSSD']
                hrv_sdnn = row['HRV_SDNN']
                hrv_pnn50 = row['HRV_pNN50']

                # Normalize the indices
                normalized_hrv_rmssd = max(min(1 - ((hrv_rmssd - self.hrv_rmssd_min) / (self.hrv_rmssd_max - self.hrv_rmssd_min)), 1), 0)
                normalized_hrv_sdnn = max(min(1 - ((hrv_sdnn - self.hrv_sdnn_min) / (self.hrv_sdnn_max - self.hrv_sdnn_min)), 1), 0)
                normalized_hrv_pnn50 = max(min((hrv_pnn50 - self.hrv_pnn50_min) / (self.hrv_pnn50_max - self.hrv_pnn50_min), 1), 0)

                # Calculate the metric
                attention_metric = (self.weights['HRV_RMSSD'] * normalized_hrv_rmssd +
                                    self.weights['HRV_SDNN'] * normalized_hrv_sdnn +
                                    self.weights['HRV_pNN50'] * normalized_hrv_pnn50)

                attention_metrics.append(attention_metric)

                self.last_peak_time = time

            if attention_metrics:
                # Create a DataFrame with the calculated metrics
                output_df = pd.DataFrame(attention_metrics, columns=['PPG_Attention_Metric'])
                if self.last_peak_time is not None:
                    output_df.index = [self.last_peak_time] * len(attention_metrics)

                # Provide data for the next node
                self.o.data = output_df

class CognitiveLoadMetric(Node):

    def __init__(self, weights=None):
        super().__init__()
        if weights is None:
            weights = {'HRV_SDNN': 0.5, 'HRV_RMSSD': 0.5}
        self.weights = weights
        self.last_peak_time = None

        # Define min and max values for normalization
        self.hrv_sdnn_min = 30
        self.hrv_sdnn_max = 140
        self.hrv_rmssd_min = 20
        self.hrv_rmssd_max = 100

    def update(self):
        if self.i.ready():
            cognitive_load_metrics = []

            for time, row in self.i.data.iterrows():
                # Retrieve HRV indices suitable for real-time
                hrv_sdnn = row['HRV_SDNN']
                hrv_rmssd = row['HRV_RMSSD']

                # Normalized HRV indices within [0, 1]
                normalized_hrv_sdnn = max(min(1 - ((hrv_sdnn - self.hrv_sdnn_min) / (self.hrv_sdnn_max - self.hrv_sdnn_min)), 1), 0)
                normalized_hrv_rmssd = max(min(1 - ((hrv_rmssd - self.hrv_rmssd_min) / (self.hrv_rmssd_max - self.hrv_rmssd_min)), 1), 0)

                # Calculate the cognitive load metric
                cognitive_load_metric = (self.weights['HRV_SDNN'] * normalized_hrv_sdnn +
                                         self.weights['HRV_RMSSD'] * normalized_hrv_rmssd)

                cognitive_load_metrics.append(cognitive_load_metric)

                self.last_peak_time = time

            if cognitive_load_metrics:
                # Create a DataFrame with the calculated metrics
                output_df = pd.DataFrame(cognitive_load_metrics, columns=['PPG_Cognitive_Load_Metric'])

                # Use the last detected peak time as the index for the DataFrame
                if self.last_peak_time is not None:
                    output_df.index = [self.last_peak_time] * len(cognitive_load_metrics)

                # Provide data for the next node
                self.o.data = output_df

class StressMetric(Node):

    def __init__(self, weights=None):
        super().__init__()
        if weights is None:
            weights = {'HRV_SDNN': 0.33, 'HRV_RMSSD': 0.33, 'HRV_pNN50': 0.34}
        self.weights = weights
        self.last_peak_time = None

        # Define min and max values for normalization
        self.hrv_sdnn_min = 30
        self.hrv_sdnn_max = 140
        self.hrv_rmssd_min = 20
        self.hrv_rmssd_max = 100
        self.hrv_pnn50_min = 0
        self.hrv_pnn50_max = 20

    def update(self):
        if self.i.ready():
            stress_metrics = []

            for time, row in self.i.data.iterrows():
                # Retrieve the HRV indices
                hrv_sdnn = row['HRV_SDNN']
                hrv_rmssd = row['HRV_RMSSD']
                hrv_pnn50 = row['HRV_pNN50']

                # Normalized HRV indices within [0, 1]
                normalized_hrv_sdnn = max(min(1 - ((hrv_sdnn - self.hrv_sdnn_min) / (self.hrv_sdnn_max - self.hrv_sdnn_min)), 1), 0)
                normalized_hrv_rmssd = max(min(1 - ((hrv_rmssd - self.hrv_rmssd_min) / (self.hrv_rmssd_max - self.hrv_rmssd_min)), 1), 0)
                normalized_hrv_pnn50 = max(min((hrv_pnn50 - self.hrv_pnn50_min) / (self.hrv_pnn50_max - self.hrv_pnn50_min), 1), 0)

                # Calculate stress metric
                stress_metric = (self.weights['HRV_SDNN'] * normalized_hrv_sdnn +
                                 self.weights['HRV_RMSSD'] * normalized_hrv_rmssd +
                                 self.weights['HRV_pNN50'] * normalized_hrv_pnn50)

                stress_metrics.append(stress_metric)

                self.last_peak_time = time

            if stress_metrics:
                output_df = pd.DataFrame(stress_metrics, columns=['PPG_Stress_Metric'])
                if self.last_peak_time is not None:
                    output_df.index = [self.last_peak_time] * len(stress_metrics)
                self.o.data = output_df
