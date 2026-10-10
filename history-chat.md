# history-chat.md

Dokumen ini mendokumentasikan ringkasan percakapan pembuatan aplikasi Manajemen Proyek berbasis Gantt Chart (website statis).

## Ringkasan singkat

Aplikasi dibangun sebagai site statis murni (`index.html`, `styles.css`, `app.js`, `uji.html`) tanpa framework dan tanpa backend. Data disimpan di `localStorage`. Seluruh teks antarmuka berbahasa Indonesia.

Fitur yang dikerjakan:
- Manajemen tugas: tambah, edit, hapus.
- Field: nama, durasi (hari kerja), tanggal mulai, prioritas, warna indikator.
- Sub-tugas (parent-child) dengan tampilan bertingkat.
- Tampilan Gantt Chart visual pada timeline.
- Predecessors: hubungan antar tugas FS dan SS + jeda (delay) dengan penyesuaian tanggal otomatis.
- Kalender Proyek: pengaturan hari akhir pekan dan hari libur khusus yang tidak dihitung sebagai hari kerja.
- Resource Management: pendaftaran anggota tim (nama, email, peran, gaji) dan alokasi anggota ke tugas.
- Analisis Proyek: Critical Path (CPM) dan diagram PERT.
- Suite uji otomatis halaman `uji.html` untuk memverifikasi fitur.

## File dalam commit pertama

- `index.html`
- `styles.css`
- `app.js`
- `uji.html`
- `history-chat.md`

## Cara membuka

1. Buka `uji.html` di browser untuk menjalankan uji fitur.
2. Buka `index.html` di browser untuk menggunakan aplikasi.

Catatan: enviroment ini tidak menyediakan shell Git/Node untuk eksekusi lebih lanjut, sehingga semua manipulasi repositori dilakukan melalui perintah git yang tersedia.
