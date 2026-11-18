let modelsReadyPromise = null;
let scriptReadyPromise = null;

const MODEL_URI = '/face-models';
const SCRIPT_URI = '/vendor/face-api.js';

const ensureFaceApiScriptLoaded = async () => {
    if (window.faceapi) return window.faceapi;

    if (!scriptReadyPromise) {
        scriptReadyPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${SCRIPT_URI}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve(window.faceapi));
                existing.addEventListener('error', () => reject(new Error('Failed to load face-api script.')));
                return;
            }

            const script = document.createElement('script');
            script.src = SCRIPT_URI;
            script.async = true;
            script.onload = () => resolve(window.faceapi);
            script.onerror = () => reject(new Error('Failed to load face-api script.'));
            document.head.appendChild(script);
        });
    }

    return scriptReadyPromise;
};

export const ensureFaceModelsLoaded = async () => {
    const faceapi = await ensureFaceApiScriptLoaded();

    if (!modelsReadyPromise) {
        modelsReadyPromise = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URI),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URI),
        ]);
    }

    await modelsReadyPromise;
};

export const extractDescriptorFromImageData = async (imageData) => {
    const faceapi = await ensureFaceApiScriptLoaded();
    await ensureFaceModelsLoaded();

    const image = await faceapi.fetchImage(imageData);
    const result = await faceapi
        .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!result?.descriptor) {
        return null;
    }

    return Array.from(result.descriptor);
};

export const detectFaceFromVideo = async (videoElement) => {
    if (!videoElement) return null;

    const faceapi = await ensureFaceApiScriptLoaded();
    await ensureFaceModelsLoaded();

    const result = await faceapi
        .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    return result || null;
};

const midpoint = (a, b) => ({
    x: ((a?.x || 0) + (b?.x || 0)) / 2,
    y: ((a?.y || 0) + (b?.y || 0)) / 2,
});

const meanPoint = (points = []) => {
    if (!points.length) return { x: 0, y: 0 };

    const total = points.reduce(
        (acc, point) => ({ x: acc.x + (point?.x || 0), y: acc.y + (point?.y || 0) }),
        { x: 0, y: 0 }
    );

    return { x: total.x / points.length, y: total.y / points.length };
};

// Averages multiple 128-d descriptors element-wise. Used at enrollment so
// each stored pose is the mean of N rapid samples — much cleaner than a
// single noisy frame, which directly improves match accuracy at scan time.
export const averageDescriptors = (descriptors = []) => {
    if (!descriptors.length) return null;
    const len = descriptors[0].length;
    const out = new Array(len).fill(0);
    for (const d of descriptors) {
        for (let i = 0; i < len; i += 1) out[i] += d[i];
    }
    for (let i = 0; i < len; i += 1) out[i] /= descriptors.length;
    return out;
};

export const estimateFacePose = (result) => {
    const landmarks = result?.landmarks;
    if (!landmarks) return null;

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();
    const jaw = landmarks.getJawOutline();

    if (!leftEye?.length || !rightEye?.length || !nose?.length || !jaw?.length) return null;

    const leftEyeCenter = meanPoint(leftEye);
    const rightEyeCenter = meanPoint(rightEye);
    const eyesCenter = midpoint(leftEyeCenter, rightEyeCenter);

    const noseTip = nose[3] || nose[Math.floor(nose.length / 2)];
    const jawLeft = jaw[0];
    const jawRight = jaw[jaw.length - 1];

    const faceWidth = Math.max(1, Math.abs((jawRight?.x || 0) - (jawLeft?.x || 0)));
    const yaw = ((noseTip?.x || 0) - eyesCenter.x) / faceWidth;
    const pitch = ((noseTip?.y || 0) - eyesCenter.y) / faceWidth;

    return { yaw, pitch };
};
