import pandas as pd
from timeflux.core.node import Node

class Format(Node):
    """Parse predictions before sending to OSC server

    Attributes:
        i (Port): Predictions, expects DataFrame
        o (Port): OSC-friendly predictions, provides DataFrame
    """

    def update(self):

        # Loop through events
        if self.i.ready():
            timestamps = []
            rows = []
            for timestamp, row in self.i.data.iterrows():
                if row.label == "predict":
                    timestamps.append(timestamp)
                    rows.append([row.data["source"], row.data["target"]])
            if timestamps:
                self.o.data = pd.DataFrame(rows, index=timestamps, columns=["label", "data"])
                print(self.o.data)