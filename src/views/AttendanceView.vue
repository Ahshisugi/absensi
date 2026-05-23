<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { supabase } from '../supabase';
import { getCurrentLocation, haversine, formatTime, formatDate } from '../utils';
import * as faceapi from '@vladmandic/face-api';
import CameraScan from '../components/CameraScan.vue';
import DistanceRadar from '../components/DistanceRadar.vue';

const emit = defineEmits(['toast', 'open-admin']);

// App States
const attendanceType = ref(null); // 'in', 'out' atau null (halaman pemilihan awal)
const employees = ref([]);
const officeSettings = ref(null);
const faceMatcher = ref(null);

// Geolocation States
const userLocation = ref(null);
const distanceToOffice = ref(null);
const gpsAccuracy = ref(null);
const loadingLocation = ref(false);
const locationError = ref('');
let locationInterval = null;

// Clock
const currentTime = ref(new Date());
let clockInterval = null;

// Status & Progress
const loadingApp = ref(true);
const processingAttendance = ref(false);
const attendanceSuccessData = ref(null); // Menyimpan info presensi yang sukses untuk splash screen

// Labeled Face Descriptors for face-api
async function initAttendanceSystem() {
  loadingApp.value = true;
  try {
    // 1. Ambil pengaturan kantor (geofence & waktu)
    const { data: settingsData, error: settingsErr } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (settingsErr && settingsErr.code !== 'PGRST116') throw settingsErr;
    officeSettings.value = settingsData || {
      office_name: 'Kantor Pusat',
      office_lat: -6.200000,
      office_lng: 106.816666,
      radius_meters: 20,
      work_start_time: '08:00:00',
      work_end_time: '17:00:00'
    };

    // 2. Ambil data seluruh pegawai & deskriptor wajahnya (diperbolehkan public-read via RLS)
    const { data: employeesData, error: employeesErr } = await supabase
      .from('employees')
      .select('*');

    if (employeesErr) throw employeesErr;
    employees.value = employeesData || [];

    // 3. Bangun FaceMatcher dari deskriptor wajah karyawan terdaftar
    if (employees.value.length > 0) {
      const labeledDescriptors = employees.value.map(emp => {
        // Ubah array JSON kembali menjadi Float32Array
        const descArray = new Float32Array(emp.face_descriptor);
        // Gabungkan Nama dan NIP sebagai label pencocokan
        const label = `${emp.name}|${emp.employee_id}|${emp.id}`;
        return new faceapi.LabeledFaceDescriptors(label, [descArray]);
      });

      // Ambang batas kecocokan (distance threshold), 0.45 adalah titik manis akurasi tinggi
      faceMatcher.value = new faceapi.FaceMatcher(labeledDescriptors, 0.45);
    }
  } catch (err) {
    console.error('Inisialisasi sistem gagal:', err);
    emit('toast', { message: `Gagal memuat database pegawai: ${err.message}`, type: 'error' });
  } finally {
    loadingApp.value = false;
  }
}

// Geolocation tracking
async function trackLocation() {
  loadingLocation.value = true;
  try {
    const loc = await getCurrentLocation();
    userLocation.value = loc;
    gpsAccuracy.value = loc.accuracy;
    locationError.value = '';

    if (officeSettings.value) {
      const dist = haversine(
        loc.latitude,
        loc.longitude,
        officeSettings.value.office_lat,
        officeSettings.value.office_lng
      );
      distanceToOffice.value = dist;
    }
  } catch (err) {
    console.error(err);
    locationError.value = err.message;
    distanceToOffice.value = null;
    gpsAccuracy.value = null;
  } finally {
    loadingLocation.value = false;
  }
}

// Live ticking clock
function startClock() {
  clockInterval = setInterval(() => {
    currentTime.value = new Date();
  }, 1000);
}

// Face matching action
async function handleFaceMatched({ label, distance, descriptor }) {
  if (label === 'unknown') return; // Abaikan jika wajah tidak dikenal
  if (processingAttendance.value || attendanceSuccessData.value) return; // Kunci jika sedang diproses/sukses

  processingAttendance.value = true;

  // 1. Pisahkan label nama|nip|id
  const [empName, empCode, empId] = label.split('|');

  // 2. Verifikasi Geofencing secara real-time
  if (distanceToOffice.value === null) {
    emit('toast', { message: 'GPS sedang menentukan lokasi. Harap tunggu...', type: 'error' });
    processingAttendance.value = false;
    return;
  }

  const isWithin = distanceToOffice.value <= officeSettings.value.radius_meters;
  if (!isWithin) {
    emit('toast', { message: `Presensi Ditolak! Anda di luar area (Jarak: ${distanceToOffice.value.toFixed(1)}m, Batas: ${officeSettings.value.radius_meters}m)`, type: 'error' });
    // Tahan 3 detik sebelum memperbolehkan pemindaian ulang agar tidak spam error
    setTimeout(() => {
      processingAttendance.value = false;
    }, 3000);
    return;
  }

  // 3. Hitung status waktu masuk/pulang
  let status = 'Hadir';
  const now = new Date();
  const timeString = formatTime(now);

  if (attendanceType.value === 'in') {
    const startTimeStr = officeSettings.value.work_start_time; // HH:MM:SS
    if (timeString > startTimeStr) {
      // Hitung keterlambatan dalam menit
      const [sh, sm, ss] = startTimeStr.split(':').map(Number);
      const startToday = new Date();
      startToday.setHours(sh, sm, ss, 0);
      
      const diffMs = now - startToday;
      const diffMins = Math.floor(diffMs / 60000);
      status = `Terlambat ${diffMins} menit`;
    } else {
      status = 'Tepat Waktu';
    }
  } else {
    status = 'Pulang';
  }

  // 4. Catat logs di Supabase database
  try {
    const { error } = await supabase
      .from('logs')
      .insert({
        employee_id: empId,
        employee_name: empName,
        employee_code: empCode,
        type: attendanceType.value,
        latitude: userLocation.value.latitude,
        longitude: userLocation.value.longitude,
        distance_meters: distanceToOffice.value,
        is_within_radius: true,
        status: status,
        confidence: 1 - distance // Confidence level pencocokan wajah
      });

    if (error) throw error;

    // Set data sukses untuk Splash Screen
    attendanceSuccessData.value = {
      name: empName,
      code: empCode,
      type: attendanceType.value === 'in' ? 'Masuk' : 'Pulang',
      time: formatDate(now),
      status: status,
      confidence: ((1 - distance) * 100).toFixed(0)
    };

    emit('toast', { message: `Presensi ${attendanceSuccessData.value.type} berhasil dicatat!`, type: 'success' });

    // Hapus sesi pilihan dan kembali ke home setelah 5 detik
    setTimeout(() => {
      handleCancel();
    }, 5000);

  } catch (err) {
    console.error('Gagal mencatat log absen:', err);
    emit('toast', { message: `Gagal mencatat kehadiran: ${err.message}`, type: 'error' });
    processingAttendance.value = false;
  }
}

function handleSelectType(type) {
  if (employees.value.length === 0) {
    emit('toast', { message: 'Belum ada pegawai terdaftar di sistem. Hubungi Admin!', type: 'error' });
    return;
  }
  attendanceType.value = type;
}

function handleCancel() {
  attendanceType.value = null;
  attendanceSuccessData.value = null;
  processingAttendance.value = false;
}

const displayDate = computed(() => {
  return currentTime.value.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

const displayTime = computed(() => {
  return currentTime.value.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

onMounted(() => {
  initAttendanceSystem();
  startClock();
  trackLocation();
  // Lacak lokasi GPS secara berkala setiap 5 detik agar presisi
  locationInterval = setInterval(trackLocation, 5000);
});

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval);
  if (locationInterval) clearInterval(locationInterval);
});
</script>

<template>
  <div class="attendance-layout">
    <!-- loading app overlay -->
    <div v-if="loadingApp" class="app-preloader">
      <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="48" height="48">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="#a855f7" stroke-width="3"></circle>
        <path class="opacity-75" fill="#c084fc" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <h3>Menghubungkan ke Pusat Server...</h3>
      <p>Mengunduh enkripsi data wajah & konfigurasi kantor</p>
    </div>

    <!-- MAIN INTERFACE -->
    <div v-else class="content-wrapper">
      
      <!-- HEADER PANEL (Ticking Clock & Admin Portal Shortcut) -->
      <header class="attendance-header">
        <div class="brand">
          <div class="logo-shield">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h1>Presensi Wajah AI</h1>
        </div>

        <!-- Clock Widget -->
        <div class="clock-widget glass-panel">
          <div class="clock-time">{{ displayTime }}</div>
          <div class="clock-date">{{ displayDate }}</div>
        </div>

        <button @click="emit('open-admin')" class="btn btn-secondary btn-admin-portal">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Admin Portal
        </button>
      </header>

      <!-- 1. SPLASH SCREEN (Jika Absen Berhasil) -->
      <Transition name="fade">
        <div v-if="attendanceSuccessData" class="success-splash-card card">
          <div class="success-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" class="success-check" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h2>Absensi Berhasil Dicatat!</h2>
          <p class="splash-welcome">Halo, selamat bekerja / istirahat kembali.</p>

          <div class="splash-details glass-panel">
            <div class="detail-row">
              <span class="detail-label">Nama Pegawai</span>
              <span class="detail-value text-white">{{ attendanceSuccessData.name }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">NIK / NIP</span>
              <span class="detail-value"><code>{{ attendanceSuccessData.code }}</code></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Jenis Absen</span>
              <span class="detail-value tag-type">{{ attendanceSuccessData.type }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Waktu Presensi</span>
              <span class="detail-value">{{ attendanceSuccessData.time }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Keterangan / Status</span>
              <span class="detail-value text-success font-bold">{{ attendanceSuccessData.status }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Kecocokan AI</span>
              <span class="detail-value font-mono text-purple font-bold">{{ attendanceSuccessData.confidence }}%</span>
            </div>
          </div>
          <div class="splash-countdown">
            Kembali ke menu utama dalam 5 detik...
          </div>
        </div>
      </Transition>

      <!-- 2. HOME MODE (Pemilihan Absen Masuk/Pulang & Geofencing Radar pasif) -->
      <div v-if="!attendanceType && !attendanceSuccessData" class="selection-grid">
        <div class="intro-pane card">
          <h2>Selamat Datang!</h2>
          <p>Silakan pilih jenis presensi Anda di sebelah kanan untuk mengaktifkan pemindai wajah AI.</p>
          <div class="office-indicator glass-panel mt-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <div class="office-indicator-details">
              <strong>Batas Geofence: {{ officeSettings?.office_name }}</strong>
              <span class="d-block text-muted">Batas Absen: Radius {{ officeSettings?.radius_meters }} meter</span>
            </div>
          </div>
        </div>

        <!-- Choice Cards -->
        <div class="choice-cards-container">
          <button @click="handleSelectType('in')" class="choice-card card choice-in">
            <div class="choice-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </div>
            <div class="choice-text">
              <h3>Absen Masuk</h3>
              <p>Mulai jam kerja harian Anda. Pastikan jam kerja belum terlambat (Batas: {{ officeSettings?.work_start_time }}).</p>
            </div>
          </button>

          <button @click="handleSelectType('out')" class="choice-card card choice-out">
            <div class="choice-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </div>
            <div class="choice-text">
              <h3>Absen Pulang</h3>
              <p>Selesaikan jam kerja Anda hari ini. Tanda pulang akan otomatis tercatat ke riwayat.</p>
            </div>
          </button>
        </div>

        <!-- Pasive Radar Status in Selection Page -->
        <div class="radar-pane">
          <DistanceRadar 
            :distance="distanceToOffice"
            :radius="officeSettings?.radius_meters || 20"
            :gps-accuracy="gpsAccuracy"
            :loading="loadingLocation"
            :error-msg="locationError"
          />
        </div>
      </div>

      <!-- 3. CAMERA SCREEN ACTIVE (Setelah memilih jenis absen) -->
      <div v-if="attendanceType && !attendanceSuccessData" class="scanner-grid">
        <!-- Back button & Label -->
        <div class="scanner-header card">
          <button @click="handleCancel" class="btn btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Batalkan & Kembali
          </button>
          <div class="scanner-label-group">
            <h3>Mode Pemindaian Wajah</h3>
            <p>Melakukan: <strong :class="attendanceType === 'in' ? 'text-info' : 'text-warning'">Absen {{ attendanceType === 'in' ? 'Masuk' : 'Pulang' }}</strong></p>
          </div>
        </div>

        <!-- Camera scanning card -->
        <div class="camera-column">
          <CameraScan 
            :registered-matcher="faceMatcher"
            @face-matched="handleFaceMatched"
            @error="(msg) => emit('toast', { message: msg, type: 'error' })"
          />
        </div>

        <!-- Geofence check Radar card -->
        <div class="radar-column">
          <DistanceRadar 
            :distance="distanceToOffice"
            :radius="officeSettings?.radius_meters || 20"
            :gps-accuracy="gpsAccuracy"
            :loading="loadingLocation"
            :error-msg="locationError"
          />

          <!-- Live status panel -->
          <div class="card live-status-info mt-4">
            <h4>Panduan Presensi:</h4>
            <ul class="guidelines-list">
              <li>Posisikan wajah Anda tepat di tengah layar pemindai wajah.</li>
              <li>Pastikan penerangan cukup dan tidak memakai kacamata hitam/topi.</li>
              <li>Geofencing Radar wajib berstatus <span class="badge badge-success">Aman</span> dengan radius di bawah 20 meter dari titik koordinat kantor.</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.attendance-layout {
  width: 100%;
}

/* App preloader */
.app-preloader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 100px);
  gap: 16px;
  text-align: center;
}

.app-preloader h3 {
  font-size: 20px;
  margin-top: 8px;
}

.app-preloader p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Attendance Header */
.attendance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-shield {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(192, 132, 252, 0.1);
  border: 1px solid rgba(192, 132, 252, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 15px rgba(192, 132, 252, 0.1);
}

.brand h1 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.clock-widget {
  padding: 8px 24px;
  border-radius: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.clock-time {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
  line-height: 1.2;
}

.clock-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.btn-admin-portal {
  align-self: stretch;
}

/* Home Selection Mode */
.selection-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.intro-pane {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 32px;
  min-height: 300px;
}

.intro-pane h2 {
  font-size: 32px;
  margin-bottom: 12px;
}

.intro-pane p {
  color: rgba(255,255,255,0.6);
  font-size: 15px;
}

.office-indicator {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
}

.office-indicator-details strong {
  display: block;
  font-size: 14px;
  color: #fff;
}

.office-indicator-details span {
  font-size: 12px;
}

.d-block { display: block; }
.mt-6 { margin-top: 24px; }

.choice-cards-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.choice-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-radius: 20px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.choice-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.choice-card:hover {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.04);
}

.choice-in .choice-icon {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.choice-in:hover {
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 8px 30px rgba(59, 130, 246, 0.1);
}
.choice-in:hover .choice-icon {
  background: #3b82f6;
  color: #fff;
}

.choice-out .choice-icon {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
.choice-out:hover {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 8px 30px rgba(245, 158, 11, 0.1);
}
.choice-out:hover .choice-icon {
  background: #f59e0b;
  color: #fff;
}

.choice-text h3 {
  font-size: 18px;
  margin-bottom: 4px;
}

.choice-text p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
}

.radar-pane {
  grid-column: span 2;
}

/* Scanner View Mode */
.scanner-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
}

.scanner-header {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  border-radius: 16px;
}

.scanner-label-group h3 {
  font-size: 18px;
  line-height: 1.2;
}

.scanner-label-group p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.guidelines-list {
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 12px;
}

/* Splash Screen Success styling */
.success-splash-card {
  max-width: 520px;
  margin: 32px auto;
  text-align: center;
  padding: 40px;
  animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 20px 50px rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.2);
}

@keyframes slide-up {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.success-icon-wrapper {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.1);
  border: 2px solid rgba(16, 185, 129, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px auto;
  box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
}

.success-splash-card h2 {
  font-size: 26px;
  color: #fff;
  margin-bottom: 6px;
}

.splash-welcome {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 32px;
}

.splash-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  text-align: left;
  margin-bottom: 24px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 10px;
}

.detail-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-label {
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.detail-value {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

.tag-type {
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #fff;
}

.splash-countdown {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.font-bold { font-weight: 700; }
.text-info { color: #60a5fa !important; }
.text-warning { color: #fbbf24 !important; }
.text-success { color: #34d399 !important; }
.text-purple { color: #c084fc !important; }

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Responsive grid layouts */
@media (max-width: 768px) {
  .selection-grid, .scanner-grid {
    grid-template-columns: 1fr;
  }
  .radar-pane {
    grid-column: span 1;
  }
  .scanner-header {
    grid-column: span 1;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
