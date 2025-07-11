import pandas as pd
from timeflux.core.node import Node

class MultimodalMetric(Node):
    def __init__(self, metrics_weights=None, multimodal_metric='Average_Multimodal_Metric'):
        super().__init__()
        # Set default weights if none are provided
        if metrics_weights is None:
            metrics_weights = {'PPG_Stress_Metric': 0.3, 'EEG_Stress': 0.3, 'facial_stress': 0.4}
        self.metrics_weights = metrics_weights
        self.multimodal_metric = multimodal_metric
        self.last_peak_time = None

    def update(self):
        stress_metrics_multimodal = []
        for port_id, suffix, port_data in self.iterate("i_*"):
            if port_data.ready():
                for time, row in port_data.data.iterrows():
                    stress_metric_multimodal = 0
                    total_weight = 0
                    for metric, weight in self.metrics_weights.items():
                        value = row.get(metric)
                        if value is not None:
                            try:
                                value = float(value)
                                stress_metric_multimodal += weight * value
                                total_weight += weight
                            except ValueError:
                                self.logger.error(f"Unable to convert {value} to float for metric {metric}")
                                continue

                    # Normalize the result if some metrics are missing
                    if total_weight > 0:
                        stress_metric_multimodal /= total_weight

                    stress_metrics_multimodal.append(stress_metric_multimodal)
                    self.last_peak_time = time

        if stress_metrics_multimodal:
            average_stress_metric = sum(stress_metrics_multimodal) / len(stress_metrics_multimodal)
            output_df = pd.DataFrame([average_stress_metric], columns=[self.multimodal_metric])
            if self.last_peak_time is not None:
                output_df.index = pd.to_datetime([self.last_peak_time])
            self.o.data = output_df
