<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from './supabase';
import AttendanceView from './views/AttendanceView.vue';
import LoginView from './views/LoginView.vue';
import AdminView from './views/AdminView.vue';
import Toast from './components/Toast.vue';

const currentPage = ref('attendance'); // 'attendance', 'login', 'admin'
const user = ref(null);
const toastRef = ref(null);

function handleToast({ message, type }) {
  if (toastRef.value) {
    toastRef.value.show(message, type);
  }
}

async function checkUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    user.value = session.user;
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    user.value = null;
    currentPage.value = 'attendance';
    handleToast({ message: 'Anda telah berhasil keluar dari Panel Admin.', type: 'success' });
  } catch (err) {
    handleToast({ message: `Gagal logout: ${err.message}`, type: 'error' });
  }
}

function handleLoginSuccess(authenticatedUser) {
  user.value = authenticatedUser;
  currentPage.value = 'admin';
}

function handleOpenAdmin() {
  if (user.value) {
    currentPage.value = 'admin';
  } else {
    currentPage.value = 'login';
  }
}

onMounted(() => {
  checkUser();
  // Lacak perubahan status login admin secara persisten
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      user.value = session.user;
    } else {
      user.value = null;
    }
  });
});
</script>

<template>
  <div class="app-layout">
    <!-- Dekorasi Garis Gradien Premium di Atas Halaman -->
    <div class="top-gradient-line"></div>

    <main class="main-content container">
      <Transition name="page" mode="out-in">
        <AttendanceView 
          v-if="currentPage === 'attendance'"
          @toast="handleToast"
          @open-admin="handleOpenAdmin"
        />
        <LoginView 
          v-else-if="currentPage === 'login'"
          @toast="handleToast"
          @login-success="handleLoginSuccess"
        />
        <AdminView 
          v-else-if="currentPage === 'admin' && user"
          :user="user"
          @toast="handleToast"
          @logout="handleLogout"
        />
      </Transition>
    </main>

    <!-- Floating Global Toast system -->
    <Toast ref="toastRef" />

    <!-- Global Footer -->
    <footer class="app-footer">
      <p>&copy; 2026 Sistem Absensi AI Wajah & Geofencing. 100% Client-side AI. Powered by face-api.js & Supabase.</p>
    </footer>
  </div>
</template>

<style>
/* Global CSS transitions and rules for App.vue */
.top-gradient-line {
  height: 4px;
  background: linear-gradient(90deg, #c084fc, #6366f1, #3b82f6, #c084fc);
  background-size: 300% 100%;
  animation: shimmer 10s infinite linear;
  width: 100%;
}

@keyframes shimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
}

.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 32px 24px;
}

.app-footer {
  text-align: center;
  padding: 24px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(0, 0, 0, 0.2);
}

/* Page Slide Transition */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
