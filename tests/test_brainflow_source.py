"""Tests for the BrainFlow source node.

Uses mocked BoardShim to verify the node produces correctly shaped
DataFrames with expected column names — no hardware required.
"""

import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock, patch

from nodes.eeg.brainflow_source import (
    BrainFlowSource, BOARD_MAP, CHANNEL_NAMES,
)


@pytest.fixture
def mock_board():
    """Patch BoardShim so no real hardware is touched."""
    with patch("nodes.eeg.brainflow_source.BoardShim") as MockShim:
        instance = MagicMock()
        MockShim.return_value = instance
        instance.is_prepared.return_value = True

        # Synthetic board: 16 EEG channels, timestamp at index 30
        eeg_channels = list(range(1, 17))
        MockShim.get_eeg_channels.return_value = eeg_channels
        MockShim.get_timestamp_channel.return_value = 30
        MockShim.get_sampling_rate.return_value = 250

        # Simulate 100 samples: 31 rows (channels 0..30), 100 columns
        data = np.random.randn(31, 100)
        # Put realistic timestamps in row 30
        data[30, :] = np.linspace(1700000000, 1700000000 + 0.4, 100)
        instance.get_board_data.return_value = data

        yield MockShim, instance


class TestBrainFlowSource:

    def test_init_starts_stream(self, mock_board):
        MockShim, instance = mock_board
        node = BrainFlowSource(device="synthetic")
        instance.prepare_session.assert_called_once()
        instance.start_stream.assert_called_once()

    def test_update_produces_dataframe(self, mock_board):
        MockShim, instance = mock_board
        node = BrainFlowSource(device="synthetic")

        # Simulate Timeflux output port
        node.o = MagicMock()

        node.update()

        node.o.set.assert_called_once()
        df = node.o.set.call_args[0][0]
        assert isinstance(df, pd.DataFrame)
        assert df.shape == (100, 16)

    def test_column_names_match_device(self, mock_board):
        MockShim, instance = mock_board
        node = BrainFlowSource(device="synthetic")
        node.o = MagicMock()
        node.update()

        df = node.o.set.call_args[0][0]
        expected_names = CHANNEL_NAMES["synthetic"]
        assert list(df.columns) == expected_names

    def test_custom_channel_names(self, mock_board):
        MockShim, instance = mock_board
        custom = ["A", "B", "C", "D", "E", "F", "G", "H",
                  "I", "J", "K", "L", "M", "N", "O", "P"]
        node = BrainFlowSource(device="synthetic", channels=custom)
        node.o = MagicMock()
        node.update()

        df = node.o.set.call_args[0][0]
        assert list(df.columns) == custom

    def test_empty_data_produces_no_output(self, mock_board):
        MockShim, instance = mock_board
        instance.get_board_data.return_value = np.empty((31, 0))

        node = BrainFlowSource(device="synthetic")
        node.o = MagicMock()
        node.update()

        node.o.set.assert_not_called()

    def test_terminate_releases_session(self, mock_board):
        MockShim, instance = mock_board
        node = BrainFlowSource(device="synthetic")
        node.terminate()

        instance.stop_stream.assert_called_once()
        instance.release_session.assert_called_once()

    def test_unknown_device_raises(self, mock_board):
        with pytest.raises(ValueError, match="Unknown device"):
            BrainFlowSource(device="nonexistent_device_xyz")

    def test_timestamp_index_is_datetime(self, mock_board):
        MockShim, instance = mock_board
        node = BrainFlowSource(device="synthetic")
        node.o = MagicMock()
        node.update()

        df = node.o.set.call_args[0][0]
        assert pd.api.types.is_datetime64_any_dtype(df.index)


class TestBoardMap:

    def test_all_channel_names_have_board_map_entry(self):
        """Every device with channel names must also be in BOARD_MAP."""
        for device in CHANNEL_NAMES:
            assert device in BOARD_MAP, f"{device} in CHANNEL_NAMES but not BOARD_MAP"

    def test_board_map_values_are_integers(self):
        for device, board_id in BOARD_MAP.items():
            assert isinstance(board_id, int), f"{device} has non-int board_id: {board_id}"

    def test_channel_names_are_nonempty_lists(self):
        for device, names in CHANNEL_NAMES.items():
            assert isinstance(names, list), f"{device} names is not a list"
            assert len(names) > 0, f"{device} has empty channel names"
