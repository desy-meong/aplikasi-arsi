# Aplikasi Manajemen Proyek — Gantt Chart

Website statis untuk mengelola proyek secara sederhana dengan tampilan Gantt Chart. Dibangun murni dengan **HTML, CSS, dan JavaScript** tanpa framework dan tanpa backend. Seluruh data tersimpan di **localStorage** di browser, sehingga aplikasi bisa langsung dibuka dan digunakan tanpa server.

Teks antarmuka menggunakan **bahasa Indonesia**.

## Fitur utama

- Manajemen tugas: tambah, edit, hapus.
- Field tugas: nama, durasi (hari kerja), tanggal mulai, prioritas, warna indikator.
- Sub-tugas (parent-child) dengan tampilan bertingkat.
- Tampilan Gantt Chart visual pada timeline.
- **Predecessors**: hubungan antar tugas Finish-to-Start (FS) dan Start-to-Start (SS) beserta jeda (delay). Tanggal tugas disesuaikan secara otomatis.
- **Kalender Proyek**: pengaturan hari akhir pekan dan hari libur khusus yang tidak dihitung sebagai hari kerja.
- **Resource Management**: pendaftaran anggota tim (nama, email, peran, gaji) dan alokasi anggota ke tugas.
- **Analisis Proyek**: menampilkan Critical Path dan diagram PERT.
- Halaman uji otomatis untuk memeriksa fitur aplikasi.

## File

- `index.html`
- `styles.css`
- `app.js`
- `uji.html`
- `history-chat.md`
- `README.md`

## Cara menggunakan

1. Buka `uji.html` di browser untuk menjalankan uji fitur.
2. Buka `index.html` di browser untuk menggunakan aplikasi.

Aplikasi bisa dibuka langsung dari folder tanpa menjalankan server. Jika diperlukan, file statis juga bisa di-serve dengan perintah seperti:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000/`.

## Catatan penyimpanan

- Data tersimpan di browser dalam `localStorage`.
- Jika browser memblokir `localStorage` pada `file://`, beberapa data mungkin tidak tersimpan permanen. Sebaiknya diuji melalui server lokal jika mengalami masalah.
- Halaman uji menggunakan kunci penyimpanan yang dipisahkan, sehingga data aplikasi utama tidak terganggu saat uji dijalankan.

## Lisensi

Projek ini dibuat untuk penggunaan pribadi/pengelolaan proyek sederhana.
