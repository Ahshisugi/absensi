-- Skema Database Absensi dengan Supabase
-- Anda dapat menjalankan skrip ini di SQL Editor Supabase Anda.

-- 1. Tabel Settings (Pengaturan Kantor)
create table if not exists settings (
  id integer primary key default 1,
  office_name text not null default 'Kantor Pusat',
  office_lat double precision not null default -6.200000,
  office_lng double precision not null default 106.816666,
  radius_meters integer not null default 20, -- Default radius 20 meter sesuai arahan user
  work_start_time time without time zone not null default '08:00:00',
  work_end_time time without time zone not null default '17:00:00',
  constraint check_single_row check (id = 1)
);

-- Insert default settings jika belum ada
insert into settings (id, office_name, office_lat, office_lng, radius_meters, work_start_time, work_end_time)
values (1, 'Kantor Pusat', -6.200000, 106.816666, 20, '08:00:00', '17:00:00')
on conflict (id) do nothing;

-- 2. Tabel Employees (Data Pegawai & Wajah)
create table if not exists employees (
  id uuid default gen_random_uuid() primary key,
  employee_id text not null unique,
  name text not null,
  face_descriptor jsonb not null, -- Menyimpan deskriptor wajah Float32Array dalam bentuk array JSON
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabel Logs (Riwayat Absensi)
create table if not exists logs (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references employees(id) on delete cascade,
  employee_name text not null,
  employee_code text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  type text not null check (type in ('in', 'out')), -- 'in' (Masuk), 'out' (Pulang)
  latitude double precision not null,
  longitude double precision not null,
  distance_meters double precision not null,
  is_within_radius boolean not null,
  status text not null, -- 'Tepat Waktu', 'Terlambat', 'Pulang'
  confidence double precision not null
);

-- Kebijakan Row Level Security (RLS)
alter table settings enable row level security;
alter table employees enable row level security;
alter table logs enable row level security;

-- Hapus kebijakan lama jika ada untuk mencegah duplikasi/konflik
drop policy if exists "Allow public read settings" on settings;
drop policy if exists "Allow admin write settings" on settings;
drop policy if exists "Allow public read employees" on employees;
drop policy if exists "Allow admin write employees" on employees;
drop policy if exists "Allow public insert logs" on logs;
drop policy if exists "Allow admin read logs" on logs;
drop policy if exists "Allow admin write logs" on logs;

-- Policies untuk settings
create policy "Allow public read settings" on settings for select using (true);
create policy "Allow admin write settings" on settings for all using (auth.role() = 'authenticated');

-- Policies untuk employees (Diperlukan agar sisi Public dapat mencocokkan wajah secara lokal)
create policy "Allow public read employees" on employees for select using (true);
create policy "Allow admin write employees" on employees for all using (auth.role() = 'authenticated');

-- Policies untuk logs (Sisi Public memasukkan log absen, Admin membaca & mengelolanya)
create policy "Allow public insert logs" on logs for insert with check (true);
create policy "Allow admin read logs" on logs for select using (auth.role() = 'authenticated');
create policy "Allow admin write logs" on logs for all using (auth.role() = 'authenticated');
