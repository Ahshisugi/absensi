<script setup>
import { ref } from 'vue';
import { supabase } from '../supabase';

const emit = defineEmits(['login-success', 'toast']);

const email = ref('');
const password = ref('');
const loading = ref(false);

async function handleLogin() {
  if (!email.value || !password.value) {
    emit('toast', { message: 'Email dan password harus diisi!', type: 'error' });
    return;
  }

  loading.value = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    });

    if (error) throw error;

    emit('toast', { message: 'Login berhasil! Selamat datang Admin.', type: 'success' });
    emit('login-success', data.user);
  } catch (error) {
    console.error('Error logging in:', error);
    emit('toast', { message: `Login gagal: ${error.message}`, type: 'error' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="card login-card">
      <div class="login-header">
        <div class="logo-circle">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h2>Panel Administrasi</h2>
        <p>Masuk menggunakan kredensial admin Supabase Anda</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label class="form-label" for="email">Alamat Email</label>
          <input 
            v-model="email" 
            type="email" 
            id="email" 
            class="form-control" 
            placeholder="admin@office.com" 
            required
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Kata Sandi</label>
          <input 
            v-model="password" 
            type="password" 
            id="password" 
            class="form-control" 
            placeholder="••••••••" 
            required
            :disabled="loading"
          />
        </div>

        <button type="submit" class="btn btn-primary w-full mt-4" :disabled="loading">
          <span v-if="loading">Menghubungkan...</span>
          <span v-else>Masuk Sekarang</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 200px);
  padding: 16px;
  width: 100%;
}

.login-card {
  width: 100%;
  max-width: 440px;
  border-radius: 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(192, 132, 252, 0.1);
  border: 1px solid rgba(192, 132, 252, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px auto;
  box-shadow: 0 0 20px rgba(192, 132, 252, 0.1);
}

.login-header h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

.login-header p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
}

.w-full {
  width: 100%;
}

.mt-4 {
  margin-top: 16px;
}
</style>
