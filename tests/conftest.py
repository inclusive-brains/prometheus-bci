import sys
import os
from unittest.mock import MagicMock

# Add project root to path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Mock heavy/optional dependencies that may not be installed in test environments
# These mocks allow importing the source modules without the full dependency tree.

# Mock timeflux
timeflux_mock = MagicMock()

class FakeNode:
    """Minimal stand-in for timeflux.core.node.Node."""
    def __init__(self, *args, **kwargs):
        pass

timeflux_mock.core.node.Node = FakeNode
timeflux_mock.core.exceptions.WorkerInterrupt = Exception
timeflux_mock.helpers.port.make_event = lambda label, data, *a, **kw: {"label": label, "data": data}
timeflux_mock.helpers.clock.now = lambda: 0.0
timeflux_mock.nodes.window.TimeWindow = FakeNode

sys.modules["timeflux"] = timeflux_mock
sys.modules["timeflux.core"] = timeflux_mock.core
sys.modules["timeflux.core.node"] = timeflux_mock.core.node
sys.modules["timeflux.core.exceptions"] = timeflux_mock.core.exceptions
sys.modules["timeflux.helpers"] = timeflux_mock.helpers
sys.modules["timeflux.helpers.port"] = timeflux_mock.helpers.port
sys.modules["timeflux.helpers.clock"] = timeflux_mock.helpers.clock
sys.modules["timeflux.nodes"] = timeflux_mock.nodes
sys.modules["timeflux.nodes.window"] = timeflux_mock.nodes.window

# Mock neurokit2
nk_mock = MagicMock()
sys.modules["neurokit2"] = nk_mock

# Mock filterpy
sys.modules["filterpy"] = MagicMock()
sys.modules["filterpy.kalman"] = MagicMock()

# Mock mediapipe
sys.modules["mediapipe"] = MagicMock()

# Mock deepface
sys.modules["deepface"] = MagicMock()

# Mock pyautogui
sys.modules["pyautogui"] = MagicMock()

# Mock cv2
sys.modules["cv2"] = MagicMock()

# Mock brainflow
brainflow_mock = MagicMock()
# Provide BoardIds as an enum-like object with integer values
class FakeBoardIds:
    SYNTHETIC_BOARD = -1
    MUSE_2_BOARD = 22
    MUSE_S_BOARD = 21
    MUSE_2016_BOARD = 41
    GANGLION_BOARD = 1
    GANGLION_WIFI_BOARD = 4
    CYTON_BOARD = 0
    CYTON_WIFI_BOARD = 5
    CYTON_DAISY_BOARD = 2
    CYTON_DAISY_WIFI_BOARD = 6
    BRAINBIT_BOARD = 7
    UNICORN_BOARD = 8
    NOTION_1_BOARD = 13
    NOTION_2_BOARD = 14
    CROWN_BOARD = 23
    FREEEEG32_BOARD = 17

brainflow_mock.board_shim.BoardIds = FakeBoardIds
brainflow_mock.board_shim.BrainFlowInputParams = MagicMock
brainflow_mock.board_shim.BoardShim = MagicMock

sys.modules["brainflow"] = brainflow_mock
sys.modules["brainflow.board_shim"] = brainflow_mock.board_shim
sys.modules["brainflow.data_filter"] = brainflow_mock.data_filter
