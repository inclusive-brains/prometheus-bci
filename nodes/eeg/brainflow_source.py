"""Timeflux node for acquiring EEG data via BrainFlow.

Wraps BrainFlow's BoardShim to provide a Timeflux-compatible data source
that supports 15+ consumer EEG devices (Muse 2/S, OpenBCI Ganglion,
BrainBit, Unicorn, Crown, FreeEEG32, and more).
"""

import numpy as np
import pandas as pd
from timeflux.core.node import Node
from timeflux.helpers.clock import now

from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
from brainflow.data_filter import DataFilter

# Mapping from human-readable device names to BrainFlow board IDs
BOARD_MAP = {
    "synthetic": BoardIds.SYNTHETIC_BOARD,
    "muse2": BoardIds.MUSE_2_BOARD,
    "muse_s": BoardIds.MUSE_S_BOARD,
    "muse_2016": BoardIds.MUSE_2016_BOARD,
    "ganglion": BoardIds.GANGLION_BOARD,
    "ganglion_wifi": BoardIds.GANGLION_WIFI_BOARD,
    "cyton": BoardIds.CYTON_BOARD,
    "cyton_wifi": BoardIds.CYTON_WIFI_BOARD,
    "cyton_daisy": BoardIds.CYTON_DAISY_BOARD,
    "cyton_daisy_wifi": BoardIds.CYTON_DAISY_WIFI_BOARD,
    "brainbit": BoardIds.BRAINBIT_BOARD,
    "unicorn": BoardIds.UNICORN_BOARD,
    "notion1": BoardIds.NOTION_1_BOARD,
    "notion2": BoardIds.NOTION_2_BOARD,
    "crown": BoardIds.CROWN_BOARD,
    "freeeeg32": BoardIds.FREEEEG32_BOARD,
}

# Standard 10-20 channel names per device (BrainFlow doesn't always provide these)
CHANNEL_NAMES = {
    "synthetic": ["Fp1", "Fp2", "C3", "C4", "P7", "P8", "O1", "O2",
                   "F7", "F8", "F3", "Fz", "F4", "Cz", "Pz", "Oz"],
    "muse2": ["TP9", "AF7", "AF8", "TP10"],
    "muse_s": ["TP9", "AF7", "AF8", "TP10"],
    "muse_2016": ["TP9", "AF7", "AF8", "TP10"],
    "ganglion": ["Fp1", "Fp2", "C3", "C4"],
    "ganglion_wifi": ["Fp1", "Fp2", "C3", "C4"],
    "cyton": ["Fp1", "Fp2", "C3", "C4", "P7", "P8", "O1", "O2"],
    "cyton_wifi": ["Fp1", "Fp2", "C3", "C4", "P7", "P8", "O1", "O2"],
    "cyton_daisy": ["Fp1", "Fp2", "C3", "C4", "P7", "P8", "O1", "O2",
                     "F7", "F8", "F3", "Fz", "F4", "Cz", "Pz", "Oz"],
    "cyton_daisy_wifi": ["Fp1", "Fp2", "C3", "C4", "P7", "P8", "O1", "O2",
                          "F7", "F8", "F3", "Fz", "F4", "Cz", "Pz", "Oz"],
    "brainbit": ["T3", "T4", "O1", "O2"],
    "unicorn": ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"],
    "notion1": ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
    "notion2": ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
    "crown": ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
    "freeeeg32": [f"Ch{i}" for i in range(1, 33)],
}


class BrainFlowSource(Node):
    """Acquire EEG data from any BrainFlow-supported device.

    This node wraps BrainFlow's BoardShim to provide a Timeflux-compatible
    data source. It outputs a DataFrame with EEG channel columns and
    timestamp-based index.

    Args:
        device (str): Device name (e.g. "muse2", "ganglion", "synthetic").
            See BOARD_MAP for all supported names.
        serial_port (str): Serial port for USB devices (e.g. "/dev/ttyUSB0").
        mac_address (str): MAC address for Bluetooth devices (e.g. Muse).
        ip_address (str): IP address for WiFi devices.
        ip_port (int): IP port for WiFi devices.
        channels (list): Override default channel names.

    Attributes:
        o (Port): Default output, provides DataFrame with EEG data.
    """

    def __init__(self, device="synthetic", serial_port="", mac_address="",
                 ip_address="", ip_port=0, channels=None):
        self._device = device
        self._channels_override = channels

        # Resolve board ID
        if device in BOARD_MAP:
            self._board_id = BOARD_MAP[device]
        else:
            try:
                self._board_id = int(device)
            except (ValueError, TypeError):
                raise ValueError(
                    f"Unknown device '{device}'. "
                    f"Valid names: {sorted(BOARD_MAP.keys())}"
                )

        # Configure BrainFlow parameters
        params = BrainFlowInputParams()
        if serial_port:
            params.serial_port = serial_port
        if mac_address:
            params.mac_address = mac_address
        if ip_address:
            params.ip_address = ip_address
        if ip_port:
            params.ip_port = ip_port

        # Create and start board
        self._board = BoardShim(self._board_id, params)
        self._board.prepare_session()
        self._board.start_stream()

        # Resolve channel info
        self._eeg_channels = BoardShim.get_eeg_channels(self._board_id)
        self._timestamp_channel = BoardShim.get_timestamp_channel(self._board_id)
        self._sample_rate = BoardShim.get_sampling_rate(self._board_id)

        # Resolve column names
        if channels:
            self._column_names = channels[:len(self._eeg_channels)]
        elif device in CHANNEL_NAMES:
            names = CHANNEL_NAMES[device]
            self._column_names = names[:len(self._eeg_channels)]
        else:
            self._column_names = [f"Ch{i+1}" for i in range(len(self._eeg_channels))]

    def update(self):
        data = self._board.get_board_data()
        if data.shape[1] == 0:
            return

        # Extract EEG channels
        eeg_data = data[self._eeg_channels, :]

        # Build timestamps from BrainFlow's timestamp channel
        timestamps = data[self._timestamp_channel, :]
        index = pd.to_datetime(timestamps, unit="s", utc=True)

        # Build output DataFrame
        self.o.data = pd.DataFrame(
            eeg_data.T,
            index=index,
            columns=self._column_names,
        )
        self.o.meta = {"rate": self._sample_rate}

    def terminate(self):
        try:
            if self._board.is_prepared():
                self._board.stop_stream()
                self._board.release_session()
        except Exception:
            pass
