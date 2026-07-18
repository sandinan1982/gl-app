# Aplikasi GL (General Ledger) - Multi Cabang

Aplikasi General Ledger sederhana dengan Database, Backend (Node.js/Express + SQLite),
dan Frontend (HTML/JS) — mendukung multi cabang.

## Struktur Menu
- **Master Data**: Kode Cabang, Kode Account, Kode Department
- **Transaksi**: Jurnal Transaksi (input no bukti + baris jurnal), Posting Transaksi,
  Tutup Buku, Batal Tutup Buku
- **Laporan**: Neraca, Laba Rugi, Transaksi Harian
- **Setting**: Pembuatan User, Hak Akses User (permission per menu: lihat/tambah/edit/hapus/posting)

## Cara Menjalankan

1. Pastikan **Node.js** (versi 18 ke atas) sudah terpasang di komputer Anda.
2. Buka terminal, masuk ke folder `backend`:
   ```
   cd gl-app/backend
   npm install
   npm start
   ```
3. Buka browser ke: `http://localhost:3000`
4. Login dengan akun default:
   - **Username**: `admin`
   - **Password**: `admin123`

Database SQLite akan otomatis dibuat di `backend/data/gl.db` beserta data awal
(chart of account contoh, 1 cabang pusat, role ADMIN & STAFF).

> Jika `npm install` gagal karena `better-sqlite3` butuh kompilasi native,
> pastikan Anda punya build tools (di Windows: `npm install --global windows-build-tools`
> atau install Visual Studio Build Tools; di Mac: `xcode-select --install`;
> di Linux: `sudo apt install build-essential python3`).

## Alur Kerja Utama
1. **Master Data** — isi dulu Kode Cabang, Kode Account (COA), dan Kode Department.
2. **Jurnal Transaksi** — buat jurnal baru: input No Bukti (boleh dikosongkan untuk
   auto-generate, format `JV-{CABANG}-{YYYYMM}-{urut}`), tanggal, cabang, lalu tambahkan
   baris-baris jurnal debit/kredit. Sistem otomatis memvalidasi jurnal harus balance.
3. **Posting Transaksi** — jurnal berstatus DRAFT diposting agar masuk ke saldo laporan
   (setelah posting, jurnal tidak bisa diubah/dihapus).
4. **Tutup Buku** — menutup periode (bulan) per cabang. Semua jurnal DRAFT pada periode
   tersebut harus diposting terlebih dahulu. Setelah ditutup, tidak bisa input/posting
   transaksi baru pada periode itu.
5. **Batal Tutup Buku** — membuka kembali periode yang sudah ditutup bila diperlukan koreksi.
6. **Laporan** — Neraca (per tanggal), Laba Rugi (per rentang tanggal), dan Transaksi Harian
   (per tanggal), semuanya bisa difilter per cabang atau seluruh cabang (konsolidasi).
7. **Setting** — buat user baru, tentukan role & cabangnya (atau akses semua cabang),
   lalu atur hak akses (permission) per role di menu Hak Akses User.

## Multi Cabang
- Setiap transaksi jurnal terikat ke satu cabang.
- User bisa dibatasi hanya melihat/input data cabangnya sendiri, atau diberi akses
  "Semua Cabang" (misalnya untuk Head Office / Finance Pusat).
- Tutup buku dilakukan per cabang per periode, sehingga tiap cabang independen.
- Laporan bisa ditampilkan per cabang atau gabungan seluruh cabang.

## Struktur Folder
```
gl-app/
├── backend/
│   ├── server.js          # entry point Express
│   ├── db.js               # koneksi + auto-migrate + seed data
│   ├── schema.sql          # struktur database
│   ├── middleware/auth.js  # JWT auth & permission check
│   └── routes/              # REST API per modul
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/app.js           # SPA (vanilla JS, tanpa build tools)
```

## Deploy ke Railway (Rekomendasi - Gratis & Ada Volume Persisten)

Database pakai file SQLite, jadi butuh **persistent volume** supaya data tidak hilang
setiap deploy ulang. Railway punya fitur ini di tier gratis, Render tidak (butuh plan berbayar).

**Langkah-langkah:**

1. **Push project ini ke GitHub** (repo baru):
   ```
   cd gl-app
   git init
   git add .
   git commit -m "Initial commit - GL App"
   git branch -M main
   git remote add origin https://github.com/USERNAME/gl-app.git
   git push -u origin main
   ```
   (Buat dulu repo kosong bernama `gl-app` di GitHub, ganti USERNAME sesuai akun Anda)

2. **Buat akun/login di [railway.app](https://railway.app)** (bisa pakai akun GitHub).

3. **New Project → Deploy from GitHub repo** → pilih repo `gl-app` yang barusan dipush.
   Railway otomatis mendeteksi `Dockerfile` dan mem-build image-nya.

4. **Tambahkan Volume** (WAJIB, supaya database tidak hilang):
   - Buka service yang baru dibuat → tab **Settings** → **Volumes** → **New Volume**
   - Mount path: `/app/backend/data`
   - Simpan.

5. **Set Environment Variable** (opsional tapi disarankan untuk keamanan):
   - Tab **Variables** → tambahkan `JWT_SECRET` = (isi dengan string acak/rahasia)

6. **Generate domain**: tab **Settings** → **Networking** → **Generate Domain**.
   Railway akan memberi URL publik seperti `https://gl-app-production.up.railway.app`.

7. Buka URL tersebut, login dengan `admin` / `admin123`, lalu **segera ganti password admin**
   lewat menu Setting → Pembuatan User (edit user admin).

Setiap kali Anda push perubahan ke branch `main` di GitHub, Railway otomatis rebuild & redeploy.

## Alternatif: Deploy ke Render

File `render.yaml` sudah disediakan (Blueprint). Catatan: fitur **persistent disk** di Render
hanya tersedia di plan berbayar (bukan free tier) — di free tier, isi `backend/data/gl.db`
akan hilang setiap kali service di-restart/redeploy. Jika tetap ingin pakai Render:

1. Push project ke GitHub (sama seperti langkah Railway di atas).
2. Di [render.com](https://render.com) → **New → Blueprint** → hubungkan repo GitHub Anda.
   Render otomatis membaca `render.yaml` (plan `starter` berbayar, termasuk disk 1GB).
3. Deploy, lalu buka URL yang diberikan Render.

## Catatan Keamanan (untuk penggunaan produksi)
- Ganti `JWT_SECRET` di `middleware/auth.js` (atau set environment variable `JWT_SECRET`).
- Gunakan HTTPS di production.
- Pertimbangkan migrasi ke PostgreSQL/MySQL bila jumlah transaksi & user besar
  (struktur `schema.sql` mudah diadaptasi karena menggunakan SQL standar).
