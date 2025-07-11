import cv2
import mediapipe as mp
import pyautogui
import numpy as np
import threading
from filterpy.kalman import KalmanFilter
from timeflux.core.node import Node
from timeflux.core.exceptions import WorkerInterrupt

class FaceTracker(Node):

    def __init__(self):
        super().__init__()
        self.mp_face_detection = mp.solutions.face_detection
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_drawing = mp.solutions.drawing_utils
        self.prev_x, self.prev_y = 0, 0
        self.movement_threshold = 2
        self.amplification_factor = 3
        self.smooth_factor = 0.5
        self.tracking_enabled = False
        self.smile_detected = False
        self.cap = cv2.VideoCapture(0)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.kf = self._initialize_kalman_filter()
        self.face_detection = self.mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
        self.face_mesh = self.mp_face_mesh.FaceMesh(max_num_faces=1, min_detection_confidence=0.5, min_tracking_confidence=0.5)

    def _initialize_kalman_filter(self):
        kf = KalmanFilter(dim_x=4, dim_z=2)
        kf.x = np.array([0, 0, 0, 0])
        kf.F = np.array([[1, 0, 1, 0],
                         [0, 1, 0, 1],
                         [0, 0, 1, 0],
                         [0, 0, 0, 1]])
        kf.H = np.array([[1, 0, 0, 0],
                         [0, 1, 0, 0]])
        kf.P *= 1000.
        kf.R = 5
        kf.Q = np.eye(4)
        return kf

    def _smooth_movement(self, current, previous, factor):
        return previous + factor * (current - previous)

    def _move_cursor(self, smoothed_x, smoothed_y):
        delta_x = smoothed_x - self.prev_x
        delta_y = smoothed_y - self.prev_y
        delta_x = -delta_x
        if abs(delta_x) > self.movement_threshold or abs(delta_y) > self.movement_threshold:
            cursor_x, cursor_y = pyautogui.position()
            amplified_delta_x = delta_x * self.amplification_factor
            amplified_delta_y = delta_y * self.amplification_factor
            new_x = cursor_x + amplified_delta_x
            new_y = cursor_y + amplified_delta_y
            pyautogui.moveTo(new_x, new_y)
            self.prev_x, self.prev_y = smoothed_x, smoothed_y

    def _is_smiling(self, landmarks):
        top_lip_ids = [13, 14, 312, 311]
        bottom_lip_ids = [17, 18, 402, 403]
        top_lip_points = [landmarks[id] for id in top_lip_ids]
        bottom_lip_points = [landmarks[id] for id in bottom_lip_ids]
        top_lip = np.mean([(point.x, point.y) for point in top_lip_points], axis=0)
        bottom_lip = np.mean([(point.x, point.y) for point in bottom_lip_points], axis=0)
        distance = np.linalg.norm(top_lip - bottom_lip)
        return distance > 0.03

    def update(self):
        ret, frame = self.cap.read()
        if not ret:
            return
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results_detection = self.face_detection.process(rgb_frame)
        results_mesh = self.face_mesh.process(rgb_frame)
        if results_detection.detections and results_mesh.multi_face_landmarks and self.tracking_enabled:
            for detection, landmarks in zip(results_detection.detections, results_mesh.multi_face_landmarks):
                bboxC = detection.location_data.relative_bounding_box
                h, w, _ = frame.shape
                x, y, w, h = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)
                cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)
                center_x, center_y = x + w // 2, y + h // 2
                if self.prev_x == 0 and self.prev_y == 0:
                    self.prev_x, self.prev_y = center_x, center_y
                z = np.array([center_x, center_y])
                self.kf.predict()
                self.kf.update(z)
                kalman_x, kalman_y = self.kf.x[:2]
                smoothed_x = self._smooth_movement(kalman_x, self.prev_x, self.smooth_factor)
                smoothed_y = self._smooth_movement(kalman_y, self.prev_y, self.smooth_factor)
                threading.Thread(target=self._move_cursor, args=(smoothed_x, smoothed_y)).start()
                if self._is_smiling(landmarks.landmark):
                    print("Smile detected")  # Debug statement
                    if not self.smile_detected:
                        pyautogui.click()
                        self.smile_detected = True
                else:
                    self.smile_detected = False
        cv2.imshow('Face Tracking', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            raise WorkerInterrupt
        elif cv2.waitKey(1) & 0xFF == ord('$'):
            self.tracking_enabled = not self.tracking_enabled
            if self.tracking_enabled:
                print("Tracking enabled")
            else:
                print("Tracking disabled")

    def terminate(self):
        self.cap.release()
        cv2.destroyAllWindows()

