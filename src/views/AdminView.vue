<script setup>
import { ref, onMounted } from "vue";
import { jsPDF } from "jspdf";
import { utils, writeFile } from "xlsx";
import { supabase } from "../supabase";
import { getCurrentLocation, formatDate } from "../utils";
import CameraScan from "../components/CameraScan.vue";

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["logout", "toast"]);

const activeTab = ref("logs");
const logs = ref([]);
const employees = ref([]);
const officeSettings = ref({
  id: 1,
  office_name: "Kantor Pusat",
  office_lat: -6.2,
  office_lng: 106.816666,
  radius_meters: 20,
  work_start_time: "08:00:00",
  work_end_time: "17:00:00",
});

const loadingLogs = ref(false);
const loadingEmployees = ref(false);
const loadingSettings = ref(false);
const savingSettings = ref(false);

const registerName = ref("");
const registerNip = ref("");
const capturedDescriptor = ref(null);
const isCameraOpen = ref(false);
const registering = ref(false);

const searchLogName = ref("");
const filterLogType = ref("");
const selectedMonth = ref(getCurrentMonthValue());

const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const date = new Date();
  date.setMonth(date.getMonth() - index);
  return {
    value: getMonthValue(date),
    label: formatMonthLabel(date),
  };
});

function getCurrentMonthValue() {
  return getMonthValue(new Date());
}

function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

async function fetchLogs() {
  loadingLogs.value = true;
  try {
    const { data, error } = await supabase
      .from("logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (error) throw error;
    logs.value = data || [];
  } catch (err) {
    console.error("Error fetching logs:", err);
    emit("toast", {
      message: "Gagal mengambil data log absensi.",
      type: "error",
    });
  } finally {
    loadingLogs.value = false;
  }
}

async function fetchEmployees() {
  loadingEmployees.value = true;
  try {
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_id, name, created_at")
      .order("name", { ascending: true });

    if (error) throw error;
    employees.value = data || [];
  } catch (err) {
    console.error("Error fetching employees:", err);
    emit("toast", {
      message: "Gagal mengambil daftar pegawai.",
      type: "error",
    });
  } finally {
    loadingEmployees.value = false;
  }
}

async function fetchSettings() {
  loadingSettings.value = true;
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    if (data) {
      officeSettings.value = data;
    }
  } catch (err) {
    console.error("Error fetching settings:", err);
    emit("toast", {
      message: "Gagal mengambil konfigurasi kantor.",
      type: "error",
    });
  } finally {
    loadingSettings.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    const { error } = await supabase
      .from("settings")
      .upsert(officeSettings.value);

    if (error) throw error;
    emit("toast", {
      message: "Pengaturan lokasi & jam kantor berhasil disimpan!",
      type: "success",
    });
  } catch (err) {
    console.error("Error saving settings:", err);
    emit("toast", {
      message: "Gagal menyimpan pengaturan kantor.",
      type: "error",
    });
  } finally {
    savingSettings.value = false;
  }
}

async function handleGetAdminLocation() {
  emit("toast", {
    message: "Membaca koordinat GPS Anda saat ini...",
    type: "info",
  });
  try {
    const loc = await getCurrentLocation();
    officeSettings.value.office_lat = parseFloat(loc.latitude.toFixed(6));
    officeSettings.value.office_lng = parseFloat(loc.longitude.toFixed(6));
    emit("toast", {
      message: `Lokasi berhasil disesuaikan! (Akurasi: ±${loc.accuracy.toFixed(1)}m)`,
      type: "success",
    });
  } catch (err) {
    console.error(err);
    emit("toast", { message: err.message, type: "error" });
  }
}

function handleFaceDetected(descriptor) {
  capturedDescriptor.value = descriptor;
}

async function handleRegisterEmployee() {
  if (!registerName.value || !registerNip.value) {
    emit("toast", {
      message: "Nama lengkap dan NIK harus diisi!",
      type: "error",
    });
    return;
  }
  if (!capturedDescriptor.value) {
    emit("toast", {
      message:
        "Silakan posisikan wajah ke kamera sampai terdeteksi sebelum menyimpan!",
      type: "error",
    });
    return;
  }

  registering.value = true;
  try {
    const serializedDescriptor = Array.from(capturedDescriptor.value);

    const { error } = await supabase.from("employees").insert({
      name: registerName.value,
      employee_id: registerNip.value,
      face_descriptor: serializedDescriptor,
    });

    if (error) throw error;

    emit("toast", {
      message: `Karyawan ${registerName.value} berhasil didaftarkan!`,
      type: "success",
    });

    registerName.value = "";
    registerNip.value = "";
    capturedDescriptor.value = null;
    isCameraOpen.value = false;

    fetchEmployees();
  } catch (err) {
    console.error("Error registering employee:", err);
    emit("toast", {
      message: `Gagal mendaftarkan pegawai: ${err.message}`,
      type: "error",
    });
  } finally {
    registering.value = false;
  }
}

async function handleDeleteEmployee(emp) {
  if (
    !confirm(
      `Apakah Anda yakin ingin menghapus data pegawai "${emp.name}"? Semua log presensi terkait akan ikut terhapus.`,
    )
  ) {
    return;
  }

  try {
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", emp.id);

    if (error) throw error;

    emit("toast", {
      message: `Data pegawai "${emp.name}" berhasil dihapus.`,
      type: "success",
    });
    fetchEmployees();
  } catch (err) {
    console.error("Error deleting employee:", err);
    emit("toast", { message: "Gagal menghapus pegawai.", type: "error" });
  }
}

async function handleDeleteLog(logId) {
  if (!confirm("Apakah Anda yakin ingin menghapus catatan log absensi ini?")) {
    return;
  }

  try {
    const { error } = await supabase.from("logs").delete().eq("id", logId);

    if (error) throw error;

    emit("toast", {
      message: "Catatan log absensi berhasil dihapus.",
      type: "success",
    });
    fetchLogs();
  } catch (err) {
    console.error("Error deleting log:", err);
    emit("toast", { message: "Gagal menghapus log.", type: "error" });
  }
}

function logsForExport() {
  return filteredLogs().map((log) => ({
    waktu: formatDate(log.timestamp),
    nama_pegawai: log.employee_name,
    nik: log.employee_code,
    tipe: log.type === "in" ? "Masuk" : "Pulang",
    jarak_meter: `${log.distance_meters.toFixed(1)} m`,
    status: log.status,
    kecocokan: `${(log.confidence * 100).toFixed(0)}%`,
  }));
}

function exportExcel() {
  const workbook = utils.book_new();
  const worksheet = utils.json_to_sheet(logsForExport());
  utils.book_append_sheet(workbook, worksheet, "Riwayat Presensi");
  writeFile(workbook, `riwayat-presensi-${selectedMonth.value}.xlsx`);
  emit("toast", {
    message: "Laporan Excel berhasil diekspor.",
    type: "success",
  });
}

function exportPdf() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const rows = logsForExport();

  doc.setFontSize(16);
  doc.text("Riwayat Presensi Karyawan", 14, 18);
  doc.setFontSize(10);
  doc.text(
    `Periode: ${formatMonthLabel(new Date(`${selectedMonth.value}-01`))}`,
    14,
    26,
  );

  let y = 36;
  const header = [
    "Waktu",
    "Nama",
    "NIK",
    "Tipe",
    "Jarak",
    "Status",
    "Kecocokan",
  ];
  const colX = [14, 42, 86, 115, 140, 168, 194];
  doc.setFontSize(9);
  header.forEach((text, index) => doc.text(text, colX[index], y));
  y += 6;

  rows.forEach((row) => {
    if (y > 285) {
      doc.addPage();
      y = 20;
    }

    doc.text(String(row.waktu), 14, y);
    doc.text(String(row.nama_pegawai), 42, y);
    doc.text(String(row.nik), 86, y);
    doc.text(String(row.tipe), 115, y);
    doc.text(String(row.jarak_meter), 140, y);
    doc.text(String(row.status), 168, y);
    doc.text(String(row.kecocokan), 194, y);
    y += 6;
  });

  doc.save(`riwayat-presensi-${selectedMonth.value}.pdf`);
  emit("toast", { message: "Laporan PDF berhasil diekspor.", type: "success" });
}

function filteredLogs() {
  return logs.value.filter((log) => {
    const logDate = new Date(log.timestamp);
    const matchMonth = getMonthValue(logDate) === selectedMonth.value;
    const matchName =
      log.employee_name
        .toLowerCase()
        .includes(searchLogName.value.toLowerCase()) ||
      log.employee_code
        .toLowerCase()
        .includes(searchLogName.value.toLowerCase());
    const matchType = filterLogType.value
      ? log.type === filterLogType.value
      : true;
    return matchMonth && matchName && matchType;
  });
}

function handleTabChange(tab) {
  activeTab.value = tab;
  if (tab === "logs") fetchLogs();
  if (tab === "employees") fetchEmployees();
  if (tab === "settings") fetchSettings();
}

onMounted(() => {
  fetchLogs();
});
</script>

<template>
  <div class="admin-container">
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="admin-avatar">A</div>
        <div class="admin-info">
          <h3>Administrator</h3>
          <p>{{ user.email }}</p>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          :class="['nav-item', { active: activeTab === 'logs' }]"
          @click="handleTabChange('logs')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Log Absensi
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'employees' }]"
          @click="handleTabChange('employees')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Kelola Karyawan
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'settings' }]"
          @click="handleTabChange('settings')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
          Lokasi & Jam Kerja
        </button>
      </nav>

      <button
        @click="emit('logout')"
        class="btn btn-danger sidebar-logout mt-auto"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Keluar Akun
      </button>
    </aside>

    <!-- Main Content Panel -->
    <main class="content-panel">
      <!-- 1. ATTENDANCE LOGS TAB -->
      <div v-if="activeTab === 'logs'" class="tab-content">
        <div class="content-header">
          <h2>Riwayat Presensi Karyawan</h2>
          <p>
            Daftar seluruh kehadiran pegawai berdasarkan pemindaian wajah &
            lokasi GPS
          </p>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar glass-panel mb-6">
          <div class="form-group flex-1">
            <label class="form-label">Cari Pegawai</label>
            <input
              v-model="searchLogName"
              type="text"
              class="form-control"
              placeholder="Cari nama atau NIK..."
            />
          </div>
          <div class="form-group select-group">
            <label class="form-label">Filter Bulan</label>
            <select v-model="selectedMonth" class="form-control select-control">
              <option
                v-for="month in monthOptions"
                :key="month.value"
                :value="month.value"
              >
                {{ month.label }}
              </option>
            </select>
          </div>
          <div class="form-group select-group">
            <label class="form-label">Tipe Presensi</label>
            <select v-model="filterLogType" class="form-control select-control">
              <option value="">Semua Tipe</option>
              <option value="in">Absen Masuk</option>
              <option value="out">Absen Pulang</option>
            </select>
          </div>
          <div class="form-group select-group">
            <label class="form-label">Ekspor</label>
            <div class="btn-group">
              <button
                type="button"
                @click="exportExcel"
                class="btn btn-secondary"
              >
                Excel
              </button>
              <button
                type="button"
                @click="exportPdf"
                class="btn btn-secondary"
              >
                PDF
              </button>
            </div>
          </div>
          <button @click="fetchLogs" class="btn btn-secondary align-end">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>

        <!-- Logs Table -->
        <div v-if="loadingLogs" class="loading-state">
          <p>Memuat data riwayat...</p>
        </div>
        <div v-else-if="filteredLogs().length === 0" class="empty-state">
          <p>Tidak ada data riwayat presensi ditemukan.</p>
        </div>
        <div v-else class="table-container">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Nama Pegawai</th>
                <th>NIK</th>
                <th>Tipe</th>
                <th>Jarak Lokasi</th>
                <th>Status</th>
                <th>Kecocokan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in filteredLogs()" :key="log.id">
                <td class="font-medium">{{ formatDate(log.timestamp) }}</td>
                <td class="font-semibold text-white">
                  {{ log.employee_name }}
                </td>
                <td>
                  <code>{{ log.employee_code }}</code>
                </td>
                <td>
                  <span
                    :class="[
                      'badge',
                      log.type === 'in' ? 'badge-info' : 'badge-warning',
                    ]"
                  >
                    {{ log.type === "in" ? "Masuk" : "Pulang" }}
                  </span>
                </td>
                <td>
                  <span
                    :class="
                      log.is_within_radius ? 'text-success' : 'text-error'
                    "
                  >
                    {{ log.distance_meters.toFixed(1) }} m
                    <small
                      >({{ log.is_within_radius ? "Aman" : "Diluar" }})</small
                    >
                  </span>
                </td>
                <td>
                  <span
                    :class="[
                      'badge',
                      log.status === 'Tepat Waktu'
                        ? 'badge-success'
                        : log.status === 'Terlambat'
                          ? 'badge-danger'
                          : 'badge-info',
                    ]"
                  >
                    {{ log.status }}
                  </span>
                </td>
                <td>
                  <span class="font-medium text-purple">
                    {{ (log.confidence * 100).toFixed(0) }}%
                  </span>
                </td>
                <td>
                  <button
                    @click="handleDeleteLog(log.id)"
                    class="btn btn-danger p-2"
                    title="Hapus Log"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. MANAGE EMPLOYEES TAB -->
      <div v-if="activeTab === 'employees'" class="tab-content">
        <div class="content-header">
          <h2>Kelola Data Karyawan</h2>
          <p>
            Daftarkan wajah karyawan baru dan kelola data karyawan terdaftar
          </p>
        </div>

        <div class="split-layout">
          <!-- Register Form -->
          <section class="card form-section">
            <h3>Daftarkan Wajah Pegawai</h3>
            <p class="subtitle mb-6">
              Pastikan nama dan NIK diisi dengan benar sebelum memindai wajah
            </p>

            <form @submit.prevent="handleRegisterEmployee">
              <div class="form-group">
                <label class="form-label">Nama Lengkap</label>
                <input
                  v-model="registerName"
                  type="text"
                  class="form-control"
                  placeholder="Contoh: Rian Anggoro"
                  required
                  :disabled="registering"
                />
              </div>

              <div class="form-group mb-6">
                <label class="form-label">NIK Pegawai</label>
                <input
                  v-model="registerNip"
                  type="text"
                  class="form-control"
                  placeholder="Contoh: 1992081512"
                  required
                  :disabled="registering"
                />
              </div>

              <!-- Webcam Area -->
              <div class="camera-wrapper mb-6">
                <div v-if="!isCameraOpen" class="camera-placeholder">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <button
                    type="button"
                    @click="isCameraOpen = true"
                    class="btn btn-secondary mt-4"
                    :disabled="!registerName || !registerNip"
                  >
                    Aktifkan Kamera Pemindai
                  </button>
                  <small
                    class="text-muted mt-2"
                    v-if="!registerName || !registerNip"
                    >Isi nama & NIK terlebih dahulu</small
                  >
                </div>
                <div v-else class="active-camera">
                  <CameraScan
                    is-registering
                    @face-detected="handleFaceDetected"
                    @error="
                      (msg) => emit('toast', { message: msg, type: 'error' })
                    "
                  />
                  <div class="camera-controls">
                    <button
                      type="button"
                      @click="isCameraOpen = false"
                      class="btn btn-secondary mt-2"
                    >
                      Tutup Kamera
                    </button>
                    <span
                      v-if="capturedDescriptor"
                      class="badge badge-success mt-2"
                      >Wajah Terkunci</span
                    >
                  </div>
                </div>
              </div>

              <button
                type="submit"
                class="btn btn-primary w-full"
                :disabled="
                  registering ||
                  !registerName ||
                  !registerNip ||
                  !capturedDescriptor
                "
              >
                {{ registering ? "Mendaftarkan..." : "Simpan Data Pegawai" }}
              </button>
            </form>
          </section>

          <!-- Registered List -->
          <section class="card list-section">
            <h3>Karyawan Terdaftar ({{ employees.length }})</h3>
            <p class="subtitle mb-6">
              Daftar profil wajah pegawai yang dapat melakukan absensi
            </p>

            <div v-if="loadingEmployees" class="loading-state">
              <p>Memuat daftar pegawai...</p>
            </div>
            <div v-else-if="employees.length === 0" class="empty-state">
              <p>Belum ada pegawai terdaftar.</p>
            </div>
            <div v-else class="employee-list-scroll">
              <div
                v-for="emp in employees"
                :key="emp.id"
                class="employee-item glass-panel"
              >
                <div class="emp-avatar">
                  {{ emp.name.charAt(0).toUpperCase() }}
                </div>
                <div class="emp-details">
                  <h4>{{ emp.name }}</h4>
                  <p>
                    NIK: <code>{{ emp.employee_id }}</code>
                  </p>
                  <span class="reg-date"
                    >Terdaftar:
                    {{
                      new Date(emp.created_at).toLocaleDateString("id-ID")
                    }}</span
                  >
                </div>
                <button
                  @click="handleDeleteEmployee(emp)"
                  class="btn btn-danger p-2 ml-auto"
                  title="Hapus Pegawai"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- 3. OFFICE SETTINGS TAB -->
      <div v-if="activeTab === 'settings'" class="tab-content">
        <div class="content-header">
          <h2>Konfigurasi Lokasi & Jam Kantor</h2>
          <p>
            Atur titik koordinat GPS kantor, radius geofencing presisi, dan jam
            jadwal absensi masuk/pulang
          </p>
        </div>

        <div class="card max-w-2xl">
          <form @submit.prevent="saveSettings">
            <div class="form-group">
              <label class="form-label">Nama Lokasi Kantor</label>
              <input
                v-model="officeSettings.office_name"
                type="text"
                class="form-control"
                required
                :disabled="savingSettings"
              />
            </div>

            <div class="grid-2 mt-4">
              <div class="form-group">
                <label class="form-label">Latitude Koordinat</label>
                <input
                  v-model.number="officeSettings.office_lat"
                  type="number"
                  step="0.000001"
                  class="form-control font-mono"
                  required
                  :disabled="savingSettings"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Longitude Koordinat</label>
                <input
                  v-model.number="officeSettings.office_lng"
                  type="number"
                  step="0.000001"
                  class="form-control font-mono"
                  required
                  :disabled="savingSettings"
                />
              </div>
            </div>

            <!-- Get Location Button -->
            <button
              type="button"
              @click="handleGetAdminLocation"
              class="btn btn-secondary w-full mt-2"
              :disabled="savingSettings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
              </svg>
              Gunakan Koordinat GPS Admin Saat Ini
            </button>
            <p class="form-helper mb-6">
              Disarankan berdiri tepat di gerbang/pintu kantor saat menekan
              tombol di atas.
            </p>

            <div class="form-group mb-6">
              <label class="form-label">Radius Geofencing (Meter)</label>
              <input
                v-model.number="officeSettings.radius_meters"
                type="number"
                min="5"
                max="500"
                class="form-control"
                required
                :disabled="savingSettings"
              />
              <p class="form-helper">
                Disetel pada
                <strong>{{ officeSettings.radius_meters }} meter</strong>
                (Rekomendasi pengguna: 20 meter).
              </p>
            </div>

            <div class="grid-2 mb-6">
              <div class="form-group">
                <label class="form-label">Batas Jam Masuk (Tepat Waktu)</label>
                <input
                  v-model="officeSettings.work_start_time"
                  type="time"
                  step="1"
                  class="form-control"
                  required
                  :disabled="savingSettings"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Jadwal Jam Pulang Kerja</label>
                <input
                  v-model="officeSettings.work_end_time"
                  type="time"
                  step="1"
                  class="form-control"
                  required
                  :disabled="savingSettings"
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-primary w-full"
              :disabled="savingSettings"
            >
              {{
                savingSettings ? "Menyimpan..." : "Simpan Perubahan Pengaturan"
              }}
            </button>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-container {
  display: flex;
  min-height: calc(100vh - 100px);
  gap: 32px;
  width: 100%;
}

/* Sidebar Styling */
.sidebar {
  width: 280px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 24px;
}

.admin-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
}

.admin-info h3 {
  font-size: 15px;
  line-height: 1.2;
}

.admin-info p {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
}

.nav-item.active {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.sidebar-logout {
  width: 100%;
}

.mt-auto {
  margin-top: auto;
}

/* Content Area */
.content-panel {
  flex-grow: 1;
  min-width: 0; /* Cegah flex item overflow */
}

.content-header {
  margin-bottom: 24px;
}

.content-header h2 {
  font-size: 28px;
  margin-bottom: 6px;
}

.content-header p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

/* Filter Bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.flex-1 {
  flex-grow: 1;
}

.select-group {
  width: 180px;
}

.select-control {
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 20px;
}

.align-end {
  align-self: flex-end;
  height: 46px;
  margin-bottom: 20px; /* Samakan dengan margin form-group */
}

.mb-6 {
  margin-bottom: 24px;
}

.p-2 {
  padding: 8px;
}

/* Split Layout for Employees management */
.split-layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 24px;
}

.form-section,
.list-section {
  border-radius: 20px;
  padding: 24px;
}

.subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

/* Camera Placeholder & styling */
.camera-wrapper {
  width: 100%;
}

.camera-placeholder {
  aspect-ratio: 4/3;
  background: rgba(255, 255, 255, 0.01);
  border: 2px dashed rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.active-camera {
  display: flex;
  flex-direction: column;
}

.camera-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Employee list scrollable area */
.employee-list-scroll {
  max-height: 480px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
}

.employee-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  transition: all 0.3s ease;
}

.employee-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
}

.emp-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
}

.emp-details h4 {
  font-size: 15px;
  color: #fff;
}

.emp-details p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 2px 0 4px 0;
}

.reg-date {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

.ml-auto {
  margin-left: auto;
}

/* Settings styling */
.max-w-2xl {
  max-width: 720px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.font-mono {
  font-family: monospace;
}

.form-helper {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}

/* Loading & Empty states */
.loading-state,
.empty-state {
  text-align: center;
  padding: 48px;
  background: rgba(255, 255, 255, 0.01);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.4);
}

.font-medium {
  font-weight: 500;
}
.font-semibold {
  font-weight: 600;
}
.text-purple {
  color: #c084fc;
}

/* Responsive Adjustments */
@media (max-width: 1024px) {
  .admin-container {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    height: auto;
  }
  .split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
