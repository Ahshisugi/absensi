/**
 * Menghitung jarak antara dua titik koordinat menggunakan rumus Haversine.
 * @param {number} lat1 - Latitude titik pertama
 * @param {number} lon1 - Longitude titik pertama
 * @param {number} lat2 - Latitude titik kedua
 * @param {number} lon2 - Longitude titik kedua
 * @returns {number} Jarak dalam meter
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance; // dalam meter
}

/**
 * Mengambil lokasi GPS pengguna saat ini secara real-time.
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}>}
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung oleh browser Anda.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let msg = 'Gagal mengakses GPS Anda.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Izin akses lokasi ditolak. Silakan aktifkan izin lokasi di browser Anda.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Informasi lokasi tidak tersedia. Pastikan GPS aktif.';
            break;
          case error.TIMEOUT:
            msg = 'Waktu pengambilan lokasi habis (timeout).';
            break;
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Memformat waktu lokal menjadi string berformat HH:MM:SS
 * @param {Date} date 
 * @returns {string}
 */
export function formatTime(date) {
  return date.toTimeString().split(' ')[0];
}

/**
 * Memformat tanggal lengkap menjadi string lokal Indonesia
 * @param {string|Date} dateStr 
 * @returns {string}
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
