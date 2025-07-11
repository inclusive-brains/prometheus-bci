        // Copyright 2023 The MediaPipe Authors.
        
        // Licensed under the Apache License, Version 2.0 (the "License");
        // you may not use this file except in compliance with the License.
        // You may obtain a copy of the License at
        
        //      http://www.apache.org/licenses/LICENSE-2.0
        
        // Unless required by applicable law or agreed to in writing, software
        // distributed under the License is distributed on an "AS IS" BASIS,
        // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
        // See the License for the specific language governing permissions and
        // limitations under the License.
        
        import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
        const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;
        const demosSection = document.getElementById("demos");
        const videoBlendShapes = document.getElementById("video-blend-shapes");
        
        let faceLandmarker;
        let runningMode = "IMAGE";
        let enableWebcamButton;
        let webcamRunning = false;
        const videoWidth = 480;
        
        // Before we can use HandLandmarker class we must wait for it to finish
        // loading. Machine Learning models can be large and take a moment to
        // get everything needed to run.
        async function createFaceLandmarker() {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode,
            numFaces: 2
        });
        demosSection.classList.remove("invisible");
        }
        createFaceLandmarker();
        
        /********************************************************************
        // Demo 2: Continuously grab image from webcam stream and detect it.
        ********************************************************************/
        
        const video = document.getElementById("webcam");
        const canvasElement = document.getElementById("output_canvas");
        
        const canvasCtx = canvasElement.getContext("2d");
        
        // Check if webcam access is supported.
        function hasGetUserMedia() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        }
        
        // If webcam supported, add event listener to button for when user
        // wants to activate it.
        if (hasGetUserMedia()) {
        enableWebcamButton = document.getElementById("webcamButton");
        
        if (enableWebcamButton instanceof HTMLButtonElement) {
            enableWebcamButton.addEventListener("click", enableCam);
        } else {
            console.error("Element with ID 'webcamButton' is not a button.");
        }
        } else {
        console.warn("getUserMedia() is not supported by your browser");
        }
        
        
        // Enable the live webcam view and start detection.
        function enableCam(event) {
        if (!faceLandmarker) {
            console.log("Wait! faceLandmarker not loaded yet.");
            return;
        }
        
        if (webcamRunning === true) {
            webcamRunning = false;
            enableWebcamButton.innerText = "ENABLE WEBCAM";
        } else {
            webcamRunning = true;
            enableWebcamButton.innerText = "DISABLE WEBCAM";
        }
        
        // getUsermedia parameters.
        const constraints = {
            video: true
        };
        
        // Activate the webcam stream.
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
        }
        
        let lastVideoTime = -1;
        let results = undefined;
        const drawingUtils = new DrawingUtils(canvasCtx);
        async function predictWebcam() {
        const radio = video.videoHeight / video.videoWidth;
        video.style.width = videoWidth + "px";
        video.style.height = videoWidth * radio + "px";
        canvasElement.style.width = videoWidth + "px";
        canvasElement.style.height = videoWidth * radio + "px";
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        // Now let's start detecting the stream.
        if (runningMode === "IMAGE") {
            runningMode = "VIDEO";
            await faceLandmarker.setOptions({ runningMode: runningMode });
        }
        let startTimeMs = performance.now();
        if (lastVideoTime !== video.currentTime) {
            lastVideoTime = video.currentTime;
            results = faceLandmarker.detectForVideo(video, startTimeMs);
        }
        if (results.faceLandmarks) {
            for (const landmarks of results.faceLandmarks) {
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                { color: "#D3D3D3", lineWidth: 1 }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LIPS,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                { color: "#D3D3D3" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                { color: "#D3D3D3" }
            );
            }
        }
        drawBlendShapes(videoBlendShapes, results.faceBlendshapes);
        
        // Call this function again to keep predicting when the browser is ready.
        if (webcamRunning === true) {
            window.requestAnimationFrame(predictWebcam);
        }
        }
        
        function drawBlendShapes(el, blendShapes) {
        if (!blendShapes.length) {
            return;
        }

        console.log(blendShapes[0]);

        let htmlMaker = "";
        blendShapes[0].categories.forEach((shape) => {
            htmlMaker += `
            <li class="blend-shapes-item">
                <span class="blend-shapes-label">${shape.displayName || shape.categoryName}</span>
                <span class="blend-shapes-value" style="width: calc(${(+shape.score * 100).toFixed(4)}% - 120px)">${(+shape.score).toFixed(4)}</span>
            </li>
            `;
        });

        el.innerHTML = htmlMaker;
    }
