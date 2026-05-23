<script setup>
import { computed } from 'vue';

const props = defineProps({
  distance: {
    type: Number,
    default: null
  },
  radius: {
    type: Number,
    default: 20
  },
  gpsAccuracy: {
    type: Number,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  errorMsg: {
    type: String,
    default: ''
  }
});

const isWithin = computed(() => {
  if (props.distance === null) return false;
  return props.distance <= props.radius;
});

const distanceText = computed(() => {
  if (props.distance === null) return '--';
  if (props.distance < 1) return 'Kurang dari 1 m';
  return `${props.distance.toFixed(1)} m`;
});

const radarStatusClass = computed(() => {
  if (props.loading) return 'radar-loading';
  if (props.errorMsg) return 'radar-error';
  if (props.distance === null) return 'radar-inactive';
  return isWithin.value ? 'radar-inside' : 'radar-outside';
});
</script>

<template>
  <div class="radar-card">
    <div :class="['radar-circle', radarStatusClass]">
      <!-- Radar Lines & Pulse -->
      <div class="radar-pulse-1"></div>
      <div class="radar-pulse-2"></div>
      <div class="radar-pulse-3"></div>
      <div class="radar-line"></div>
      
      <!-- Icon Indicator -->
      <div class="radar-center">
        <svg v-if="loading" class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="32" height="32">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else-if="errorMsg" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <svg v-else-if="isWithin" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <svg v-else-if="props.distance !== null" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </div>
    </div>
    
    <!-- Info Display -->
    <div class="radar-info">
      <div class="radar-title">Geofencing Radar (Radius: {{ radius }}m)</div>
      <div class="radar-value" :class="{'text-success': isWithin && props.distance !== null, 'text-error': !isWithin && props.distance !== null}">
        {{ distanceText }}
      </div>
      <div class="radar-status">
        <span v-if="loading" class="status-badge text-info">Mendeteksi GPS...</span>
        <span v-else-if="errorMsg" class="status-badge text-error">{{ errorMsg }}</span>
        <span v-else-if="props.distance === null" class="status-badge text-muted">Mencari lokasi GPS...</span>
        <span v-else-if="isWithin" class="status-badge bg-success-glow">Aman (Di Dalam Area Absen)</span>
        <span v-else class="status-badge bg-error-glow">Di Luar Jangkauan (Maks. 20m)</span>
      </div>
      <div v-if="gpsAccuracy !== null" class="gps-accuracy">
        Akurasi GPS: ±{{ gpsAccuracy.toFixed(1) }} meter
      </div>
    </div>
  </div>
</template>

<style scoped>
.radar-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.02);
  width: 100%;
}

.radar-circle {
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all 0.5s ease;
}

.radar-center {
  position: relative;
  z-index: 10;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.5s ease;
}

/* Radar states */
.radar-inactive .radar-center {
  color: rgba(255, 255, 255, 0.5);
}

.radar-loading {
  border-color: rgba(59, 130, 246, 0.3);
}
.radar-loading .radar-center {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.radar-error {
  border-color: rgba(239, 68, 68, 0.3);
}
.radar-error .radar-center {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

.radar-inside {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
}
.radar-inside .radar-center {
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
}

.radar-outside {
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.15);
}
.radar-outside .radar-center {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
}

/* Pulses */
.radar-pulse-1, .radar-pulse-2, .radar-pulse-3 {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0.4);
  opacity: 0;
  pointer-events: none;
  box-sizing: border-box;
}

.radar-inside .radar-pulse-1 {
  border: 1px solid rgba(16, 185, 129, 0.4);
  animation: radar-ping 4s infinite linear;
}
.radar-inside .radar-pulse-2 {
  border: 1px solid rgba(16, 185, 129, 0.3);
  animation: radar-ping 4s infinite linear 1.3s;
}
.radar-inside .radar-pulse-3 {
  border: 1px solid rgba(16, 185, 129, 0.2);
  animation: radar-ping 4s infinite linear 2.6s;
}

.radar-outside .radar-pulse-1 {
  border: 1px solid rgba(245, 158, 11, 0.4);
  animation: radar-ping 3s infinite linear;
}
.radar-outside .radar-pulse-2 {
  border: 1px solid rgba(245, 158, 11, 0.3);
  animation: radar-ping 3s infinite linear 1s;
}
.radar-outside .radar-pulse-3 {
  border: 1px solid rgba(245, 158, 11, 0.2);
  animation: radar-ping 3s infinite linear 2s;
}

.radar-loading .radar-pulse-1 {
  border: 1px dashed rgba(59, 130, 246, 0.3);
  animation: radar-ping 3s infinite linear;
}

/* Sweep line */
.radar-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
}

.radar-inside .radar-line {
  background: conic-gradient(from 0deg, rgba(16, 185, 129, 0.15) 0deg, rgba(16, 185, 129, 0) 90deg);
  animation: radar-sweep 5s infinite linear;
}
.radar-outside .radar-line {
  background: conic-gradient(from 0deg, rgba(245, 158, 11, 0.15) 0deg, rgba(245, 158, 11, 0) 90deg);
  animation: radar-sweep 4s infinite linear;
}
.radar-loading .radar-line {
  background: conic-gradient(from 0deg, rgba(59, 130, 246, 0.15) 0deg, rgba(59, 130, 246, 0) 90deg);
  animation: radar-sweep 3s infinite linear;
}

/* Animations */
@keyframes radar-ping {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0;
  }
}

@keyframes radar-sweep {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1.2s linear infinite;
}
.opacity-25 { opacity: 0.25; }
.opacity-75 { opacity: 0.75; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Info styling */
.radar-info {
  text-align: center;
  width: 100%;
}

.radar-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.radar-value {
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  font-feature-settings: "tnum";
  margin-bottom: 10px;
  letter-spacing: -0.5px;
}

.radar-status {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
}

.bg-success-glow {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.05);
}

.bg-error-glow {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.25);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.05);
}

.text-success { color: #34d399 !important; }
.text-error { color: #f87171 !important; }
.text-info { color: #60a5fa; }
.text-muted { color: rgba(255, 255, 255, 0.4); }

.gps-accuracy {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}
</style>
