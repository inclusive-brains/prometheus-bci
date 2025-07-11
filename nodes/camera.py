# Standard library imports
from datetime import datetime
import threading
from collections import deque
import traceback

# Third-party imports
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import pandas as pd
from filterpy.kalman import KalmanFilter
import pyautogui
from deepface import DeepFace

# Timeflux imports
from timeflux.core.node import Node
from timeflux.helpers.clock import now

class FaceBlendshapes(Node):
    """Node to detect face blendshapes using MediaPipe."""
    
    def __init__(self, device=0, model_path='nodes/model/face_landmarker_v2_with_blendshapes.task'):
        super().__init__()
        # Initialize video capture
        self._cap = cv2.VideoCapture(device)
        if not self._cap.isOpened():
            raise ValueError("Unable to open video camera")
        
        # Define all possible blendshape categories with default value zero
        self.default_blendshapes = {
            "_neutral": 0.0, "browDownLeft": 0.0, "browDownRight": 0.0, "browInnerUp": 0.0, "browOuterUpLeft": 0.0, 
            "browOuterUpRight": 0.0, "cheekPuff": 0.0, "cheekSquintLeft": 0.0, "cheekSquintRight": 0.0, "eyeBlinkLeft": 0.0,
            "eyeBlinkRight": 0.0, "eyeLookDownLeft": 0.0, "eyeLookDownRight": 0.0, "eyeLookInLeft": 0.0, "eyeLookInRight": 0.0,
            "eyeLookOutLeft": 0.0, "eyeLookOutRight": 0.0, "eyeLookUpLeft": 0.0, "eyeLookUpRight": 0.0, "eyeSquintLeft": 0.0,
            "eyeSquintRight": 0.0, "eyeWideLeft": 0.0, "eyeWideRight": 0.0, "jawForward": 0.0, "jawLeft": 0.0, "jawOpen": 0.0,
            "jawRight": 0.0, "mouthClose": 0.0, "mouthDimpleLeft": 0.0, "mouthDimpleRight": 0.0, "mouthFrownLeft": 0.0,
            "mouthFrownRight": 0.0, "mouthFunnel": 0.0, "mouthLeft": 0.0, "mouthLowerDownLeft": 0.0, "mouthLowerDownRight": 0.0,
            "mouthPressLeft": 0.0, "mouthPressRight": 0.0, "mouthPucker": 0.0, "mouthRight": 0.0, "mouthRollLower": 0.0,
            "mouthRollUpper": 0.0, "mouthShrugLower": 0.0, "mouthShrugUpper": 0.0, "mouthSmileLeft": 0.0, "mouthSmileRight": 0.0,
            "mouthStretchLeft": 0.0, "mouthStretchRight": 0.0, "mouthUpperUpLeft": 0.0, "mouthUpperUpRight": 0.0, 
            "noseSneerLeft": 0.0, "noseSneerRight": 0.0
        }

        # Initialize the detection model
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=False,
            num_faces=1
        )
        self._detector = vision.FaceLandmarker.create_from_options(options)

    def _extract_blendshapes(self, face_blendshapes):
        """Extracts blendshape scores from detection result and converts them to float64."""
        blendshapes_data = {blendshape.category_name: float(blendshape.score) for blendshape in face_blendshapes}
        return blendshapes_data

    def update(self):
        # Capture image from camera
        ret, frame = self._cap.read()
        if not ret:
            self.logger.error("Failed to capture image")
            self._send_default_blendshapes()
            return
        
        # Convert image to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        detection_result = self._detector.detect(mp_image)

        if detection_result and detection_result.face_blendshapes:
            # Extract detected blendshapes
            blendshapes = self._extract_blendshapes(detection_result.face_blendshapes[0])
            
            # Ensure all blendshapes are present by adding defaults for missing categories
            blendshapes = {**self.default_blendshapes, **blendshapes}
            
            # Save data with timestamp
            current_timestamp = now()
            df = pd.DataFrame([blendshapes]).astype(np.float64)  # Ensure float64 type
            self.o.set(df.values, timestamps=[current_timestamp], names=df.columns.tolist())
        else:
            # Send default values if no face is detected
            self._send_default_blendshapes()

    def _send_default_blendshapes(self):
        """Send default blendshape values if detection fails."""
        current_timestamp = now()
        df = pd.DataFrame([self.default_blendshapes]).astype(np.float64)
        self.o.set(df.values, timestamps=[current_timestamp], names=df.columns.tolist())

    def terminate(self):
        """Release the camera and close OpenCV windows."""
        self._cap.release()
        cv2.destroyAllWindows()

class FacialLandmarks(Node):
    """Node to detect facial landmarks using MediaPipe."""
    
    def __init__(self, device=0, model_path='nodes/model/face_landmarker_v2_with_blendshapes.task'):
        self._cap = cv2.VideoCapture(device)
        if not self._cap.isOpened():
            raise ValueError("Unable to open video camera")

        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1
        )
        self._detector = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def update(self):
        ret, frame = self._cap.read()
        if not ret:
            self.logger.error("Failed to capture image")
            return
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        detection_result = self._detector.detect(mp_image)

        if detection_result and detection_result.face_landmarks:
            face_landmarks = detection_result.face_landmarks[0]

            # Store facial landmarks directly
            landmarks = {f'landmark_{i}': (landmark.x, landmark.y) for i, landmark in enumerate(face_landmarks)}

            df = pd.DataFrame([landmarks])
            self.o.set(df.values)  # Output DataFrame without timestamps

        else:
            self._send_default_landmarks()

    def _send_default_landmarks(self):
        # Output default (0, 0) for each landmark if no landmarks are detected
        landmarks = {f'landmark_{i}': (0.0, 0.0) for i in range(468)}  # Assuming 468 landmarks
        df = pd.DataFrame([landmarks])
        self.o.set(df.values)

    def terminate(self):
        self._cap.release()
        cv2.destroyAllWindows()



class EmotionNode(Node):
    """Node to analyze emotions from facial expressions using DeepFace."""
    
    def __init__(self, fork_size=10):
        super().__init__()
        self.logger.info("EmotionNode initialization")
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            self.logger.error("Error: Unable to open camera.")
            raise Exception("Error: Unable to open camera.")
        
        # Variables
        self.previous_time = pd.Timestamp.utcnow()
        self.fork_size = fork_size
        self.emotion_history = deque(maxlen=fork_size)
        self.emotion_order = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']

    def update(self):
        current_time = pd.Timestamp.utcnow()
        ret, frame = self.cap.read()
        if not ret:
            self.logger.error("Error: Unable to capture image.")
            return

        # Analyze the emotion of the detected face using DeepFace
        try:
            result = DeepFace.analyze(frame, 
                                      actions=['emotion'], 
                                      enforce_detection=False,
                                     )
            
            emotions = result[0]['emotion'] 
            # Add current values
            self.emotion_history.append(emotions)

            # Calculate the moving average for all emotions
            smoothed_emotions = {emotion: np.mean([e[emotion] for e in self.emotion_history]) for emotion in emotions.keys()}

            # Create a DataFrame with all detected emotions in the correct order
            emotion_values = [round(int(smoothed_emotions[emotion]), 4) for emotion in self.emotion_order]
            df = pd.DataFrame([emotion_values], columns=self.emotion_order, index=[current_time])
            
            # Set the output data
            self.o.data = df
        except Exception as e:
            self.logger.error(f"Error during emotion analysis: {e}")
            self.logger.error(traceback.format_exc())
                

    def terminate(self):
        self.logger.info("Releasing camera")
        self.cap.release()
        cv2.destroyAllWindows()

class UnifiedFacialMetricsAndTracking(Node):
    """Node to unify facial metrics calculation and cursor tracking."""
    
    def __init__(self, device=0, model_path='nodes/model/face_landmarker_v2_with_blendshapes.task', scale_factor=100):
        super().__init__()
        self._cap = cv2.VideoCapture(device)
        if not self._cap.isOpened():
            raise ValueError("Impossible d'ouvrir la caméra vidéo")

        # Configure le détecteur de visage
        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1
        )
        self._detector = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        
        # Initialisation des constantes et des configurations
        self.LEFT_EYE = [33, 160, 158, 133, 153, 144]
        self.RIGHT_EYE = [362, 385, 387, 263, 373, 380]
        self.NOSE_TIP = 1  # Repère pour le bout du nez
        
        self.previous_landmarks = None
        self.previous_timestamp = None
        self.scale_factor = scale_factor

        self.mp_face_detection = mp.solutions.face_detection
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_drawing = mp.solutions.drawing_utils
        self.prev_x, self.prev_y = 0, 0
        self.movement_threshold = 2
        self.amplification_factor = 3
        self.smooth_factor = 0.5
        self.tracking_enabled = False
        self.smile_detected = False
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

    def _calculate_speed(self, current_landmark, previous_landmark, time_diff):
        distance = np.linalg.norm(np.array([current_landmark.x, current_landmark.y]) - 
                                  np.array([previous_landmark.x, previous_landmark.y]))
        return distance / time_diff if time_diff > 0 else 0

    def _calculate_eye_speed(self, face_landmarks, eye_indices, time_diff):
        current_eye_landmarks = [(face_landmarks[idx].x, face_landmarks[idx].y) for idx in eye_indices]
        previous_eye_landmarks = [(self.previous_landmarks[idx].x, self.previous_landmarks[idx].y) for idx in eye_indices]

        current_eye_center = np.mean(current_eye_landmarks, axis=0)
        previous_eye_center = np.mean(previous_eye_landmarks, axis=0)
        
        distance = np.linalg.norm(current_eye_center - previous_eye_center)
        return distance / time_diff if time_diff > 0 else 0

    def _calculate_EAR(self, face_landmarks, eye_indices):
        eye_landmarks = [(face_landmarks[idx].x, face_landmarks[idx].y) for idx in eye_indices]
        A = np.linalg.norm(np.array(eye_landmarks[1]) - np.array(eye_landmarks[5]))
        B = np.linalg.norm(np.array(eye_landmarks[2]) - np.array(eye_landmarks[4]))
        C = np.linalg.norm(np.array(eye_landmarks[0]) - np.array(eye_landmarks[3]))
        return (A + B) / (2.0 * C)

    def _calculate_attention(self, head_speed, avg_eye_speed):
        max_speed_head = 30
        max_speed_eyes = 4.0
        norm_head_speed = min(max(head_speed / max_speed_head, 0), 1)
        norm_avg_eye_speed = min(max(avg_eye_speed / max_speed_eyes, 0), 1)
        return 1.0 - ((norm_head_speed + norm_avg_eye_speed) / 2.0)

    def _calculate_vigilance(self, EAR):
        return min(max((EAR - 0.1) / (0.4 - 0.1), 0), 1)

    def _calculate_stress(self, head_speed, avg_eye_speed):
        max_speed_head = 30
        max_speed_eyes = 4.0
        norm_head_speed = min(max(head_speed / max_speed_head, 0), 1)
        norm_avg_eye_speed = min(max(avg_eye_speed / max_speed_eyes, 0), 1)
        return (norm_head_speed + norm_avg_eye_speed) / 2.0

    def _send_default_values(self):
        current_timestamp = np.datetime64(datetime.utcnow())
        df = pd.DataFrame([[0.0]*10], columns=['head_speed', 'left_eye_speed', 'right_eye_speed', 'avg_eye_speed', 'left_EAR', 'right_EAR', 'EAR', 'attention', 'vigilance', 'stress'])
        self.o.set(df.astype(np.float64).values, timestamps=[current_timestamp], names=df.columns.tolist())

    def update(self):
        ret, frame = self._cap.read()
        if not ret:
            self.logger.error("Échec de la capture d'image")
            self._send_default_values()
            return
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        detection_result = self._detector.detect(mp_image)

        if detection_result and detection_result.face_landmarks:
            face_landmarks = detection_result.face_landmarks[0]
            current_timestamp = np.datetime64(datetime.utcnow())

            if self.previous_landmarks is not None and self.previous_timestamp is not None:
                time_diff = (current_timestamp - self.previous_timestamp) / np.timedelta64(1, 's')

                if time_diff > 0:
                    head_speed = self._calculate_speed(face_landmarks[self.NOSE_TIP], self.previous_landmarks[self.NOSE_TIP], time_diff) * self.scale_factor
                    left_eye_speed = self._calculate_eye_speed(face_landmarks, self.LEFT_EYE, time_diff) * self.scale_factor
                    right_eye_speed = self._calculate_eye_speed(face_landmarks, self.RIGHT_EYE, time_diff) * self.scale_factor
                    avg_eye_speed = (left_eye_speed + right_eye_speed) / 2

                    left_EAR = self._calculate_EAR(face_landmarks, self.LEFT_EYE)
                    right_EAR = self._calculate_EAR(face_landmarks, self.RIGHT_EYE)
                    EAR = (left_EAR + right_EAR) / 2.0

                    eye_closed_threshold = 0.2
                    attention = 0 if left_EAR < eye_closed_threshold and right_EAR < eye_closed_threshold else self._calculate_attention(head_speed, avg_eye_speed)

                    vigilance = self._calculate_vigilance(EAR)
                    stress = self._calculate_stress(head_speed, avg_eye_speed)

                data = {
                    'head_speed': head_speed,
                    'left_eye_speed': left_eye_speed,
                    'right_eye_speed': right_eye_speed,
                    'avg_eye_speed': avg_eye_speed,
                    'left_EAR': left_EAR,
                    'right_EAR': right_EAR,
                    'EAR': EAR,
                    'attention': attention,
                    'vigilance': vigilance,
                    'stress': stress
                }
                
                df = pd.DataFrame([data]).astype(np.float64)
                self.o.set(df.values, timestamps=[current_timestamp], names=df.columns.tolist())

            self.previous_landmarks = face_landmarks
            self.previous_timestamp = current_timestamp
        else:
            self._send_default_values()

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
                    print("Smile detected")
                    if not self.smile_detected:
                        pyautogui.click()
                        self.smile_detected = True
                else:
                    self.smile_detected = False
        cv2.imshow('Face Tracking', frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            raise WorkerInterrupt
        elif key == ord('$'):
            self.tracking_enabled = not self.tracking_enabled
            if self.tracking_enabled:
                print("Tracking enabled")
            else:
                print("Tracking disabled")

    def terminate(self):
        self._cap.release()
        cv2.destroyAllWindows()
