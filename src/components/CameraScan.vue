<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import * as faceapi from "@vladmandic/face-api";

const props = defineProps({
  registeredMatcher: {
    type: Object, // faceapi.FaceMatcher
    default: null,
  },
  isRegistering: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "face-detected",
  "face-matched",
  "status-change",
  "error",
]);

let stream = null;
let animationFrameId = null;
let modelsLoaded = false;

const videoRef = ref(null);
const canvasRef = ref(null);
const isModelLoading = ref(false);
const isCameraActive = ref(false);
const feedbackMessage = ref("Menyiapkan sistem pemindai...");
const feedbackType = ref("info"); // 'info', 'scanning', 'success', 'error'
const modelBasePath = `${import.meta.env.BASE_URL}models`;

async function loadModels() {
  if (modelsLoaded) return;
  isModelLoading.value = true;
  feedbackMessage.value =
    "Mengunduh kecerdasan pemindai wajah (100% client-side)...";
  feedbackType.value = "info";

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(modelBasePath);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelBasePath);
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelBasePath);
    modelsLoaded = true;
  } catch (err) {
    console.error("Gagal memuat model face-api:", err);
    throw new Error(
      "Gagal memuat model deteksi wajah. Pastikan file model tersedia di folder public/models.",
    );
  } finally {
    isModelLoading.value = false;
  }
}

async function startCamera() {
  try {
    feedbackMessage.value = "Mengaktifkan lensa kamera Anda...";
    feedbackType.value = "info";

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });

    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      isCameraActive.value = true;
      videoRef.value.onloadedmetadata = () => {
        videoRef.value.play();
        startDetectionLoop();
      };
    }
  } catch (err) {
    console.error("Error starting camera:", err);
    feedbackMessage.value =
      "Gagal mengakses kamera. Berikan izin akses kamera pada browser Anda.";
    feedbackType.value = "error";
    emit("error", "Izin kamera ditolak atau kamera tidak terhubung.");
  }
}

function startDetectionLoop() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;

  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.65 });

  async function detect() {
    if (!isCameraActive.value || !video || video.paused || video.ended) return;

    try {
      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detection) {
        const resizedDetection = faceapi.resizeResults(detection, displaySize);
        const { box } = resizedDetection.detection;

        // Menggambar sudut neon kustom premium
        ctx.strokeStyle = "#c084fc"; // Purple glow
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#c084fc";

        const r = 16;
        const x = box.x;
        const y = box.y;
        const w = box.width;
        const h = box.height;

        ctx.beginPath();
        // Top-left
        ctx.moveTo(x + r, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + r);
        // Top-right
        ctx.moveTo(x + w - r, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + r);
        // Bottom-right
        ctx.moveTo(x + w - r, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - r);
        // Bottom-left
        ctx.moveTo(x + r, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + h - r);
        ctx.stroke();

        // Matikan shadow agar tidak membebani render landmarks
        ctx.shadowBlur = 0;

        // Gambar titik-titik landmarks secara halus
        ctx.fillStyle = "rgba(192, 132, 252, 0.6)";
        resizedDetection.landmarks.positions.forEach((pos) => {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2, 0, 2 * Math.PI);
          ctx.fill();
        });

        if (props.isRegistering) {
          emit("face-detected", detection.descriptor);
          feedbackMessage.value =
            "Wajah terdeteksi secara stabil. Siap didaftarkan!";
          feedbackType.value = "success";
        } else if (props.registeredMatcher) {
          const bestMatch = props.registeredMatcher.findBestMatch(
            detection.descriptor,
          );

          emit("face-matched", {
            label: bestMatch.label,
            distance: bestMatch.distance,
            descriptor: detection.descriptor,
          });

          if (bestMatch.label !== "unknown") {
            feedbackMessage.value = `Wajah Dikenali: ${bestMatch.label}`;
            feedbackType.value = "success";

            // Gambar tag nama hijau neon
            ctx.fillStyle = "#34d399";
            ctx.font = "bold 16px Outfit, Inter, sans-serif";
            ctx.fillText(
              `${bestMatch.label} (${(100 * (1 - bestMatch.distance)).toFixed(0)}%)`,
              x,
              y - 10,
            );

            // Gambar kotak luar hijau tipis
            ctx.strokeStyle = "#34d399";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
          } else {
            feedbackMessage.value =
              "Pindai wajah Anda... (Wajah tidak dikenali)";
            feedbackType.value = "scanning";

            ctx.fillStyle = "#f87171";
            ctx.font = "bold 16px Outfit, Inter, sans-serif";
            ctx.fillText("Karyawan Tidak Terdaftar", x, y - 10);

            ctx.strokeStyle = "#f87171";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
          }
        } else {
          feedbackMessage.value = "Wajah terdeteksi!";
          feedbackType.value = "success";
        }
      } else {
        feedbackMessage.value = props.isRegistering
          ? "Posisikan wajah Anda tepat di depan kamera..."
          : "Mencari wajah untuk dipindai...";
        feedbackType.value = "scanning";
      }
    } catch (err) {
      console.error("Error in face detection loop:", err);
    }

    if (isCameraActive.value) {
      animationFrameId = requestAnimationFrame(detect);
    }
  }

  detect();
}

function stopCamera() {
  isCameraActive.value = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

onMounted(async () => {
  try {
    await loadModels();
    await startCamera();
  } catch (err) {
    feedbackMessage.value = err.message;
    feedbackType.value = "error";
    emit("error", err.message);
  }
});

onBeforeUnmount(() => {
  stopCamera();
});

watch(
  () => props.isRegistering,
  () => {
    // Clear canvas overlay
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    }
  },
);
</script>

<template>
  <div class="camera-card">
    <div class="video-container">
      <video
        ref="videoRef"
        autoplay
        muted
        playsinline
        class="webcam-feed"
      ></video>
      <canvas ref="canvasRef" class="canvas-overlay"></canvas>

      <!-- Glassmorphic Overlay for Scanning Effect -->
      <div v-if="feedbackType === 'scanning'" class="scan-bar"></div>

      <!-- Loading State -->
      <div v-if="isModelLoading" class="camera-loader">
        <svg
          class="animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          width="40"
          height="40"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="#a855f7"
            stroke-width="3"
          ></circle>
          <path
            class="opacity-75"
            fill="#c084fc"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span class="loader-text">Memuat AI Wajah...</span>
      </div>
    </div>

    <!-- Status Bar -->
    <div :class="['camera-status', `status-${feedbackType}`]">
      <span class="status-indicator"></span>
      <span class="status-msg">{{ feedbackMessage }}</span>
    </div>
  </div>
</template>

<style scoped>
.camera-card {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  width: 100%;
}

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  background: #09090b;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.webcam-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1); /* Efek Cermin */
}

.canvas-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: scaleX(-1); /* Sesuaikan dengan efek cermin kamera */
  z-index: 5;
  pointer-events: none;
}

/* Scan Line Animation */
.scan-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(192, 132, 252, 0.6),
    transparent
  );
  box-shadow: 0 0 10px rgba(192, 132, 252, 0.8);
  z-index: 4;
  animation: scan 2s infinite ease-in-out;
  pointer-events: none;
}

@keyframes scan {
  0% {
    top: 0%;
  }
  50% {
    top: 100%;
  }
  100% {
    top: 0%;
  }
}

.camera-loader {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.loader-text {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.5px;
}

/* Status Bar classes */
.camera-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.04);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  transition: all 0.3s ease;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Status Colors */
.status-info .status-indicator {
  background: #3b82f6;
  box-shadow: 0 0 8px #3b82f6;
}

.status-scanning .status-indicator {
  background: #a855f7;
  box-shadow: 0 0 8px #a855f7;
  animation: pulse 1.5s infinite;
}

.status-success .status-indicator {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.status-error .status-indicator {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
}

@keyframes pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
.opacity-25 {
  opacity: 0.25;
}
.opacity-75 {
  opacity: 0.75;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
