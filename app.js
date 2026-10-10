/* ============================================================
   Manajemen Proyek — Gantt Chart
   JavaScript murni (tanpa framework), data di localStorage.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     Konstanta & state
     --------------------------------------------------------- */

  // Halaman uji dapat mengganti kunci storage lewat window.GANTT_KUNCI_STORAGE
  var KUNCI_DATA = window.GANTT_KUNCI_STORAGE || 'manajemenProyek.v1';
  var KUNCI_PREF = KUNCI_DATA + '.pref';
  var KUNCI_KAL = KUNCI_DATA + '.kalender';
  var KUNCI_RES = KUNCI_DATA + '.res';
  var HARI_MAKS = 1500;          // batas lebar timeline
  var HARI_DEFAULT = 5;          // durasi awal form
  var PRANALA_MAKS = 20;         // batas pranala per tugas
  var JEDA_MAKS = 365;           // batas jeda hari kerja pranala
  var LIBUR_MAKS = 500;          // batas jumlah hari libur khusus

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  var LABEL_PRIORITAS = { tinggi: 'Tinggi', sedang: 'Sedang', rendah: 'Rendah' };
  var WARNA_PILIHAN = [
    '#2563eb', '#0891b2', '#059669', '#65a30d',
    '#ca8a04', '#ea580c', '#dc2626', '#db2777',
    '#7c3aed', '#475569'
  ];
  var WARNA_BAWAAN = '#2563eb';

  var daftarTugas = [];
  var pref = { sembunyikanAkhirPekan: false };
  var modeEdit = null;            // null = tambah, string = id diedit
  var idIndukDipilih = null;      // preselect saat tombol "+" sub-tugas
  var daftarHari = [];            // Date[] hari yang tampil di timeline
  var indeksHari = {};            // 'YYYY-MM-DD' -> index
  var rentang = { mulai: null, selesai: null, dibatasi: false };
  var penyimpananOk = true;

  // Kalender proyek: hari akhir pekan yang bisa diatur + hari libur khusus
  var kalender = { akhirPekan: [0, 6], libur: [] };
  var liburSet = new Set();       // cache Set('YYYY-MM-DD') untuk isKerja()
  var posisiBar = {};             // id tugas -> { i0, i1 } indeks hari pada timeline
  var draftKalender = null;       // salinan saat dialog kalender terbuka
  var draftPranala = [];          // salinan pranala saat dialog tugas terbuka

  // Sumber daya (Resource Management)
  var sumberDaya = [];            // {id, nama, email, peran, gaji}
  var draftSD = [];               // salinan alokasi saat dialog tugas terbuka
  var draftTim = null;            // salinan saat dialog tim terbuka

  bangunLiburSet();

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  /* ---------------------------------------------------------
     Utilitas umum
     --------------------------------------------------------- */

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(teks) {
    return String(teks).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  /* ---------------------------------------------------------
     Utilitas tanggal (lokal, tanpa zona UTC)
     --------------------------------------------------------- */

  function hariIni() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseTanggal(teks) {
    if (typeof teks !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks);
    if (!m) return null;
    var t = Number(m[1]), b = Number(m[2]), h = Number(m[3]);
    if (b < 1 || b > 12 || h < 1 || h > 31) return null;
    var d = new Date(t, b - 1, h);
    if (d.getFullYear() !== t || d.getMonth() !== b - 1 || d.getDate() !== h) return null;
    return d;
  }

  function keISO(d) {
    var b = String(d.getMonth() + 1).padStart(2, '0');
    var h = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + b + '-' + h;
  }

  function tambahHari(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function isKerja(d) {
    if (kalender.akhirPekan.indexOf(d.getDay()) !== -1) return false;
    return !liburSet.has(keISO(d));
  }

  /** Hari kerja pertama pada atau setelah tanggal d. */
  function keHariKerja(d) {
    var c = new Date(d.getTime());
    var jaga = 0;
    while (!isKerja(c) && jaga < 100000) { c = tambahHari(c, 1); jaga += 1; }
    return c;
  }

  /** Hari kerja pertama SETELAH tanggal d. */
  function hariKerjaBerikutnya(d) {
    var c = tambahHari(d, 1);
    var jaga = 0;
    while (!isKerja(c) && jaga < 100000) { c = tambahHari(c, 1); jaga += 1; }
    return c;
  }

  /** Majukan tanggal d sebanyak n HARI KERJA. */
  function majuHariKerja(d, n) {
    var c = keHariKerja(d);
    var sisa = Math.max(0, Math.floor(Number(n)) || 0);
    var jaga = 0;
    while (sisa > 0 && jaga < 100000) { c = hariKerjaBerikutnya(c); sisa -= 1; jaga += 1; }
    return c;
  }

  /** Nama libur untuk satu tanggal ISO, atau null bila bukan hari libur. */
  function namaLibur(iso) {
    for (var i = 0; i < kalender.libur.length; i++) {
      if (kalender.libur[i].tanggal === iso) return kalender.libur[i].nama || 'Libur';
    }
    return null;
  }

  function setara(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }

  function tglPanjang(d) {
    return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function tglPendek(d) {
    return d.getDate() + ' ' + BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear();
  }

  /**
   * Tanggal selesai: durasi dihitung dalam HARI KERJA (Sen–Jum),
   * dihitung mulai dari tanggal mulai (tanggal mulai ikut dihitung
   * jika jatuh pada hari kerja).
   */
  function akhirTugas(tugas) {
    var mulai = parseTanggal(tugas.tanggalMulai) || hariIni();
    var durasi = Math.floor(Number(tugas.durasi));
    if (!isFinite(durasi) || durasi < 1) durasi = 1;
    var d = new Date(mulai.getTime());
    var hitung = 0;
    var jaga = 0;
    while (hitung < durasi && jaga < 100000) {
      if (isKerja(d)) hitung += 1;
      if (hitung < durasi) d = tambahHari(d, 1);
      jaga += 1;
    }
    return d;
  }

  /* ---------------------------------------------------------
     Penyimpanan (localStorage)
     --------------------------------------------------------- */

  function cekPenyimpanan() {
    try {
      localStorage.setItem('__ujiPenyimpanan', '1');
      localStorage.removeItem('__ujiPenyimpanan');
      penyimpananOk = true;
    } catch (e) {
      penyimpananOk = false;
    }
    if (el.bannerPenyimpanan) el.bannerPenyimpanan.hidden = penyimpananOk;
  }

  function muatPref() {
    try {
      var raw = localStorage.getItem(KUNCI_PREF);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          pref.sembunyikanAkhirPekan = !!o.sembunyikanAkhirPekan;
        }
      }
    } catch (e) { /* abaikan */ }
  }

  function simpanPref() {
    if (!penyimpananOk) return;
    try { localStorage.setItem(KUNCI_PREF, JSON.stringify(pref)); } catch (e) { /* abaikan */ }
  }

  function setPref(patch) {
    Object.assign(pref, patch || {});
    simpanPref();
  }

  /* ---------------------------------------------------------
     Kalender proyek (akhir pekan + hari libur khusus)
     --------------------------------------------------------- */

  function bangunLiburSet() {
    liburSet = new Set();
    for (var i = 0; i < kalender.libur.length; i++) {
      liburSet.add(kalender.libur[i].tanggal);
    }
  }

  function kalenderBawaan() {
    return { akhirPekan: [0, 6], libur: [] };
  }

  /** Salinan dalam-dalam object/array sederhana. */
  function klona(x) { return JSON.parse(JSON.stringify(x)); }

  /**
   * Normalisasi & validasi kalender.
   * Mengembalikan { kalender: {...} } bila sah, atau { galat: {...} }.
   */
  function validasiKalender(data) {
    var galat = {};

    if (!data || typeof data !== 'object') {
      return { galat: { dasar: 'Data kalender tidak valid.' } };
    }

    var ap = Array.isArray(data.akhirPekan) ? data.akhirPekan : null;
    if (!ap) {
      galat.akhirPekan = 'Daftar akhir pekan tidak valid.';
    } else {
      var bersihAP = [];
      for (var i = 0; i < ap.length; i++) {
        var n = Math.floor(Number(ap[i]));
        if (!isFinite(n) || n < 0 || n > 6) {
          galat.akhirPekan = 'Hari akhir pekan harus berupa angka 0 (Min) sampai 6 (Sab).';
          break;
        }
        if (bersihAP.indexOf(n) === -1) bersihAP.push(n);
      }
      if (!galat.akhirPekan) {
        bersihAP.sort(function (a, b) { return a - b; });
        if (bersihAP.length >= 7) {
          galat.akhirPekan = 'Minimal satu hari harus tetap menjadi hari kerja.';
        }
      }
    }

    var lb = Array.isArray(data.libur) ? data.libur : null;
    if (!lb) {
      galat.libur = 'Daftar hari libur tidak valid.';
    } else if (lb.length > LIBUR_MAKS) {
      galat.libur = 'Jumlah hari libur maksimal ' + LIBUR_MAKS + '.';
    } else {
      var lihat = {};
      for (var j = 0; j < lb.length; j++) {
        var e = lb[j];
        if (!e || typeof e !== 'object' || !parseTanggal(e.tanggal)) {
          galat.libur = 'Ada tanggal libur yang tidak valid.';
          break;
        }
        if (lihat[e.tanggal]) {
          galat.libur = 'Tanggal ' + e.tanggal + ' terdaftar dua kali.';
          break;
        }
        lihat[e.tanggal] = true;
      }
    }

    if (Object.keys(galat).length) return { galat: galat };

    var hasilLibur = [];
    for (var k = 0; k < lb.length; k++) {
      hasilLibur.push({
        id: typeof lb[k].id === 'string' && lb[k].id ? lb[k].id : uid(),
        tanggal: lb[k].tanggal,
        nama: typeof lb[k].nama === 'string' && lb[k].nama.trim()
          ? lb[k].nama.trim().slice(0, 60) : 'Libur'
      });
    }
    hasilLibur.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; });

    return { kalender: { akhirPekan: bersihAP.slice(), libur: hasilLibur } };
  }

  function muatKalender() {
    try {
      var raw = localStorage.getItem(KUNCI_KAL);
      if (raw) {
        var o = JSON.parse(raw);
        var v = validasiKalender(o);
        if (v.kalender) kalender = v.kalender;
      }
    } catch (e) { /* abaikan */ }
    if (!kalender || !Array.isArray(kalender.akhirPekan)) kalender = kalenderBawaan();
    bangunLiburSet();
    return kalender;
  }

  /** Terapkan kalender baru. Mengembalikan {ok:true} atau {galat:{...}}. */
  function setKalender(data) {
    var v = validasiKalender(data);
    if (v.galat) return { galat: v.galat };
    kalender = v.kalender;
    bangunLiburSet();
    if (penyimpananOk) {
      try { localStorage.setItem(KUNCI_KAL, JSON.stringify(kalender)); }
      catch (e) { /* abaikan */ }
    }
    // kalender baru mengubah perhitungan hari kerja -> jadwalkan ulang
    var pindah = jadwalkanUlang();
    simpan();
    render();
    return { ok: true, pindah: pindah };
  }

  function getKalender() { return klona(kalender); }

  function resetKalender() { return setKalender(kalenderBawaan()); }

  /* ---------------------------------------------------------
     Predecessors (pranala) — FS / SS + jeda hari kerja
     --------------------------------------------------------- */

  /** Normalisasi daftar pranala dari storage / form. */
  function normalisasiPranala(x) {
    if (!Array.isArray(x)) return [];
    var hasil = [];
    var lihat = {};
    for (var i = 0; i < x.length && hasil.length < PRANALA_MAKS; i++) {
      var p = x[i];
      if (!p || typeof p !== 'object') continue;
      var ke = typeof p.ke === 'string' && p.ke ? p.ke : '';
      if (!ke || ke && lihat[ke]) continue;
      lihat[ke] = true;
      var jenis = p.jenis === 'SS' ? 'SS' : 'FS';
      var jeda = Math.floor(Number(p.jeda));
      if (!isFinite(jeda)) jeda = 0;
      hasil.push({ ke: ke, jenis: jenis, jeda: clamp(jeda, 0, JEDA_MAKS) });
    }
    return hasil;
  }

  /**
   * Buang pranala yatim, duplikat, self-reference, lalu putus siklus
   * dengan menghapus back-edge saat DFS (hasil dijamin DAG).
   */
  function putusSiklusPranala(list) {
    var peta = new Map();
    list.forEach(function (t) { peta.set(t.id, t); });

    list.forEach(function (t) {
      if (!Array.isArray(t.pranala)) { t.pranala = []; return; }
      var lihat = {};
      t.pranala = t.pranala.filter(function (p) {
        if (!p || typeof p !== 'object') return false;
        if (!p.ke || p.ke === t.id || !peta.has(p.ke)) return false;
        if (lihat[p.ke]) return false;
        lihat[p.ke] = true;
        return true;
      });
    });

    var WARNA = 0, ABU = 1, HITAM = 2;
    var warna = new Map();
    var aman = 0;
    function kunjungi(id) {
      if (aman > 200000) return;
      aman += 1;
      warna.set(id, ABU);
      var t = peta.get(id);
      if (!t) { warna.set(id, HITAM); return; }
      var bersih = [];
      for (var i = 0; i < t.pranala.length; i++) {
        var p = t.pranala[i];
        var w = warna.get(p.ke) || WARNA;
        if (w === ABU) continue;        // back-edge -> siklus, dibuang
        bersih.push(p);
        if (w === WARNA) kunjungi(p.ke);
      }
      t.pranala = bersih;
      warna.set(id, HITAM);
    }
    list.forEach(function (t) {
      if ((warna.get(t.id) || WARNA) === WARNA) kunjungi(t.id);
    });
    return list;
  }

  /** true jika `cari` termasuk pranala transitif dari `dari`. */
  function pranalaTransitif(dari, cari) {
    var peta = new Map();
    daftarTugas.forEach(function (t) { peta.set(t.id, t); });
    var lihat = new Set();
    var antrian = [dari];
    var jaga = 0;
    while (antrian.length && jaga < 100000) {
      var cur = antrian.pop();
      if (lihat.has(cur)) continue;
      lihat.add(cur);
      var t = peta.get(cur);
      if (!t || !Array.isArray(t.pranala)) continue;
      for (var i = 0; i < t.pranala.length; i++) {
        var ke = t.pranala[i].ke;
        if (ke === cari) return true;
        if (!lihat.has(ke)) antrian.push(ke);
      }
      jaga += 1;
    }
    return false;
  }

  /**
   * Tanggal mulai paling awal yang diizinkan pranala tugas ini,
   * atau null bila tidak ada pranala yang sah.
   *
   * FS (Finish-to-Start): mulai_suksesor >= hari kerja setelah selesai_pred + jeda
   * SS (Start-to-Start) : mulai_suksesor >= mulai_pred + jeda
   */
  function mulaiTerlama(t) {
    if (!t || !Array.isArray(t.pranala) || !t.pranala.length) return null;
    var batas = null;
    for (var i = 0; i < t.pranala.length; i++) {
      var p = t.pranala[i];
      var pred = cariTugas(p.ke);
      if (!pred) continue;
      var kandidat;
      if (p.jenis === 'SS') {
        var mulaiPred = parseTanggal(pred.tanggalMulai);
        if (!mulaiPred) continue;
        kandidat = majuHariKerja(mulaiPred, p.jeda);
      } else {
        kandidat = majuHariKerja(akhirTugas(pred), 1 + p.jeda);
      }
      if (!batas || kandidat > batas) batas = kandidat;
    }
    return batas;
  }

  /** Urutan topologi berbasis DFS (aman terhadap sisa siklus). */
  function urutanTopologi() {
    var peta = new Map();
    daftarTugas.forEach(function (t) { peta.set(t.id, t); });
    var hasil = [];
    var WARNA = 0, ABU = 1, HITAM = 2;
    var warna = new Map();
    var aman = 0;

    function kunjungi(id) {
      if (aman > 200000) return;
      aman += 1;
      var w = warna.get(id) || WARNA;
      if (w === HITAM || w === ABU) return;
      warna.set(id, ABU);
      var t = peta.get(id);
      if (t && Array.isArray(t.pranala)) {
        for (var i = 0; i < t.pranala.length; i++) {
          var ke = t.pranala[i].ke;
          if (peta.has(ke) && (warna.get(ke) || WARNA) === WARNA) kunjungi(ke);
        }
      }
      warna.set(id, HITAM);
      hasil.push(id);
    }

    daftarTugas.forEach(function (t) { kunjungi(t.id); });
    return hasil;
  }

  /**
   * Geser tugas ke depan agar seluruh pranala terpenuhi.
   * Hanya memundurkan (tidak pernah memajukan) -> idempoten & tanpa osilasi.
   * Mengembalikan jumlah tugas yang digeser.
   */
  function jadwalkanUlang() {
    if (!daftarTugas.length) return 0;
    var adaPranala = daftarTugas.some(function (t) {
      return Array.isArray(t.pranala) && t.pranala.length;
    });
    if (!adaPranala) return 0;

    var peta = new Map();
    daftarTugas.forEach(function (t) { peta.set(t.id, t); });
    var urut = urutanTopologi();
    var pindah = 0;
    for (var i = 0; i < urut.length; i++) {
      var t = peta.get(urut[i]);
      if (!t) continue;
      var batas = mulaiTerlama(t);
      if (!batas) continue;
      var sekarang = parseTanggal(t.tanggalMulai);
      if (!sekarang) continue;
      if (sekarang < batas) {
        t.tanggalMulai = keISO(batas);
        pindah += 1;
      }
    }
    return pindah;
  }

  /** Normalisasi satu entri dari penyimpanan. Mengembalikan null jika tidak valid. */
  function sesuaikan(x) {
    if (!x || typeof x !== 'object') return null;
    var nama = typeof x.nama === 'string' ? x.nama.trim().slice(0, 120) : '';
    if (!nama) return null;
    var tanggalMulai = parseTanggal(x.tanggalMulai) ? x.tanggalMulai : keISO(hariIni());
    var durasi = Math.floor(Number(x.durasi));
    if (!isFinite(durasi)) durasi = HARI_DEFAULT;
    durasi = clamp(durasi, 1, 1000);
    var prioritas = LABEL_PRIORITAS[x.prioritas] ? x.prioritas : 'sedang';
    var warna = (typeof x.warna === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.warna))
      ? x.warna : WARNA_BAWAAN;
    return {
      id: typeof x.id === 'string' && x.id ? x.id : uid(),
      nama: nama,
      tanggalMulai: tanggalMulai,
      durasi: durasi,
      prioritas: prioritas,
      warna: warna,
      parentId: (typeof x.parentId === 'string' && x.parentId) ? x.parentId : null,
      pranala: normalisasiPranala(x.pranala),
      alokasi: normalisasiAlokasi(x.alokasi),
      ciut: !!x.ciut,
      dibuat: Number(x.dibuat) || Date.now()
    };
  }

  /** Putus referensi induk yang yatim atau membentuk siklus. */
  function putusSiklus(list) {
    var peta = new Map();
    list.forEach(function (t) { peta.set(t.id, t); });
    list.forEach(function (t) {
      var lihat = new Set([t.id]);
      var cur = t.parentId;
      var langkah = 0;
      while (cur && langkah < 10000) {
        if (lihat.has(cur)) { t.parentId = null; break; }
        lihat.add(cur);
        var p = peta.get(cur);
        if (!p) { t.parentId = null; break; }
        cur = p.parentId;
        langkah += 1;
      }
    });
    return list;
  }

  function muat() {
    var hasil = [];
    try {
      var raw = localStorage.getItem(KUNCI_DATA);
      if (raw) {
        var obj = JSON.parse(raw);
        var arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.tugas) ? obj.tugas : []);
        arr.forEach(function (x) {
          var t = sesuaikan(x);
          if (t) hasil.push(t);
        });
      }
    } catch (e) {
      hasil = [];
      if (penyimpananOk && el.toastWadah) {
        toast('Gagal membaca data tersimpan, data direset aman.', 'galat');
      }
    }
    putusSiklus(hasil);
    putusSiklusPranala(hasil);
    daftarTugas = hasil;
    jadwalkanUlang();   // tanggal ikut menyesuaikan pranala yang tersimpan
    return daftarTugas;
  }

  function simpan() {
    if (!penyimpananOk) return;
    try {
      localStorage.setItem(KUNCI_DATA, JSON.stringify({ v: 1, tugas: daftarTugas }));
      // simpan SD tersendiri untuk ringkas & migrasi
      localStorage.setItem(KUNCI_RES, JSON.stringify({ v: 1, sumberDaya: sumberDaya }));
    } catch (e) {
      penyimpananOk = false;
      if (el.bannerPenyimpanan) el.bannerPenyimpanan.hidden = false;
      toast('Gagal menyimpan: penyimpanan browser penuh atau diblokir.', 'galat');
    }
  }

  /* ---------------------------------------------------------
     Resource Management
     --------------------------------------------------------- */

  function emailValid(e) {
    var re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(e).trim());
  }

  function normalisasiAlokasi(x) {
    if (!Array.isArray(x)) return [];
    var res = {};
    for (var i = 0; i < sumberDaya.length; i++) res[sumberDaya[i].id] = sumberDaya[i];
    var lihat = {};
    var hasil = [];
    for (var i = 0; i < x.length; i++) {
      var a = x[i];
      if (!a || typeof a !== 'object') continue;
      var sdId = a.sdId;
      if (!sdId || typeof sdId !== 'string') continue;
      if (!res[sdId] || lihat[sdId]) continue;
      lihat[sdId] = true;
      var beban = Math.floor(Number(a.beban));
      if (!isFinite(beban)) beban = 0;
      hasil.push({ sdId: sdId, beban: clamp(beban, 0, 100) });
    }
    return hasil;
  }

  function muatSumberDaya() {
    try {
      var raw = localStorage.getItem(KUNCI_RES);
      if (raw) {
        var o = JSON.parse(raw);
        var arr = (o && Array.isArray(o.sumberDaya)) ? o.sumberDaya : [];
        var hasil = [];
        for (var i = 0; i < arr.length; i++) {
          var s = arr[i];
          if (!s || typeof s !== 'object') continue;
          var nama = String(s.nama || '').trim().slice(0, 60);
          if (!nama) continue;
          var email = String(s.email || '').trim().slice(0, 80);
          var peran = String(s.peran || '').trim().slice(0, 40);
          var gaji = Math.floor(Number(s.gaji));
          if (!isFinite(gaji) || gaji < 0) gaji = 0;
          hasil.push({
            id: s.id || uid(),
            nama: nama,
            email: email,
            peran: peran,
            gaji: gaji
          });
        }
        sumberDaya = hasil;
      }
    } catch (e) { sumberDaya = []; }
  }

  function tambahSumberDaya(data) {
    var nama = String(data.nama || '').trim().slice(0, 60);
    if (!nama) return { galat: { nama: 'Nama wajib diisi.' } };
    var email = String(data.email || '').trim().slice(0, 80);
    if (email && !emailValid(email)) return { galat: { email: 'Email tidak valid.' } };
    var peran = String(data.peran || '').trim().slice(0, 40);
    var gaji = Math.floor(Number(data.gaji));
    if (!isFinite(gaji) || gaji < 0) gaji = 0;
    var sd = { id: uid(), nama: nama, email: email, peran: peran, gaji: gaji };
    sumberDaya.push(sd);
    simpan();
    return { ok: true, sd: sd };
  }

  function ubahSumberDaya(id, data) {
    var s = null;
    for (var i = 0; i < sumberDaya.length; i++) {
      if (sumberDaya[i].id === id) { s = sumberDaya[i]; break; }
    }
    if (!s) return { galat: { nama: 'Anggota tidak ditemukan.' } };
    if (data.nama !== undefined) {
      var nama = String(data.nama || '').trim().slice(0, 60);
      if (!nama) return { galat: { nama: 'Nama wajib diisi.' } };
      s.nama = nama;
    }
    if (data.email !== undefined) {
      var email = String(data.email || '').trim().slice(0, 80);
      if (email && !emailValid(email)) return { galat: { email: 'Email tidak valid.' } };
      s.email = email;
    }
    if (data.peran !== undefined) s.peran = String(data.peran || '').trim().slice(0, 40);
    if (data.gaji !== undefined) {
      var gaji = Math.floor(Number(data.gaji));
      if (!isFinite(gaji) || gaji < 0) gaji = 0;
      s.gaji = gaji;
    }
    simpan();
    return { ok: true, sd: s };
  }

  function hapusSumberDaya(id) {
    var ada = false;
    for (var i = sumberDaya.length - 1; i >= 0; i--) {
      if (sumberDaya[i].id === id) { sumberDaya.splice(i, 1); ada = true; break; }
    }
    if (ada) {
      for (var j = 0; j < daftarTugas.length; j++) {
        var t = daftarTugas[j];
        if (t.alokasi) {
          var baru = [];
          for (var k = 0; k < t.alokasi.length; k++) {
            if (t.alokasi[k].sdId !== id) baru.push(t.alokasi[k]);
          }
          t.alokasi = baru;
        }
      }
      simpan();
    }
    return ada;
  }

  function semua() { return daftarTugas.slice(); }

  function cariTugas(id) {
    for (var i = 0; i < daftarTugas.length; i++) {
      if (daftarTugas[i].id === id) return daftarTugas[i];
    }
    return null;
  }

  /* ---------------------------------------------------------
     Struktur pohon (parent-child)
     --------------------------------------------------------- */

  function bandingTugas(a, b) {
    if (a.tanggalMulai !== b.tanggalMulai) return a.tanggalMulai < b.tanggalMulai ? -1 : 1;
    if (a.dibuat !== b.dibuat) return a.dibuat - b.dibuat;
    return String(a.nama).localeCompare(String(b.nama), 'id');
  }

  /**
   * Susun daftar datar bertingkat.
   * hormatCiut = true  -> anak dari induk yang ciut tidak ditampilkan.
   * hormatCiut = false -> semua node ditampilkan (dipakai untuk opsi select).
   */
  function bangunDaftar(tasks, hormatCiut) {
    var peta = new Map();
    tasks.forEach(function (t) { peta.set(t.id, t); });

    var anakDari = new Map();
    tasks.forEach(function (t) {
      var induk = (t.parentId && peta.has(t.parentId)) ? t.parentId : '__akar__';
      if (!anakDari.has(induk)) anakDari.set(induk, []);
      anakDari.get(induk).push(t);
    });
    anakDari.forEach(function (list) { list.sort(bandingTugas); });

    var hasil = [];
    var ziarah = new Set();

    function jalan(induk, depth) {
      var list = anakDari.get(induk) || [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (ziarah.has(t.id)) continue;
        ziarah.add(t.id);
        var anak = anakDari.get(t.id) || [];
        hasil.push({
          tugas: t,
          depth: depth,
          punyaAnak: anak.length > 0,
          jumlahAnak: anak.length
        });
        if (!hormatCiut || !t.ciut) jalan(t.id, depth + 1);
      }
    }

    jalan('__akar__', 0);
    return hasil;
  }

  function kumpulKeturunan(id) {
    var hasil = new Set();
    var antrian = [id];
    var jaga = 0;
    while (antrian.length && jaga < 100000) {
      var cur = antrian.pop();
      daftarTugas.forEach(function (t) {
        if (t.parentId === cur && !hasil.has(t.id)) {
          hasil.add(t.id);
          antrian.push(t.id);
        }
      });
      jaga += 1;
    }
    return hasil;
  }

  /** true jika idCalon berada di bawah idLeluhur (untuk mencegah siklus). */
  function adalahKeturunan(idCalon, idLeluhur) {
    var peta = new Map();
    daftarTugas.forEach(function (t) { peta.set(t.id, t); });
    var cur = idCalon;
    var jaga = 0;
    while (cur && jaga < 10000) {
      if (cur === idLeluhur) return true;
      var t = peta.get(cur);
      if (!t) return false;
      cur = t.parentId;
      jaga += 1;
    }
    return false;
  }

  /* ---------------------------------------------------------
     Validasi & CRUD
     --------------------------------------------------------- */

  function validasi(data, idEdit) {
    var galat = {};

    var nama = typeof data.nama === 'string' ? data.nama.trim() : '';
    if (!nama) galat.nama = 'Nama tugas wajib diisi.';
    else if (nama.length > 120) galat.nama = 'Nama tugas maksimal 120 karakter.';

    var tgl = parseTanggal(data.tanggalMulai);
    if (!tgl) galat.tanggalMulai = 'Tanggal mulai wajib diisi dan harus valid.';
    else {
      var th = tgl.getFullYear();
      if (th < 1900 || th > 2100) galat.tanggalMulai = 'Tahun harus antara 1900 dan 2100.';
    }

    var dur = Number(data.durasi);
    if (!isFinite(dur) || Math.floor(dur) !== dur) galat.durasi = 'Durasi harus berupa bilangan bulat.';
    else if (dur < 1) galat.durasi = 'Durasi minimal 1 hari kerja.';
    else if (dur > 1000) galat.durasi = 'Durasi maksimal 1000 hari kerja.';

    if (data.prioritas && !LABEL_PRIORITAS[data.prioritas]) {
      galat.prioritas = 'Prioritas tidak dikenal.';
    }
    if (data.warna && !/^#[0-9a-fA-F]{6}$/.test(data.warna)) {
      galat.warna = 'Warna tidak valid.';
    }

    var induk = data.parentId || null;
    if (induk) {
      if (!cariTugas(induk)) galat.induk = 'Tugas induk tidak ditemukan.';
      else if (idEdit && induk === idEdit) galat.induk = 'Tugas tidak boleh menjadi sub-tugas dirinya sendiri.';
      else if (idEdit && adalahKeturunan(induk, idEdit)) galat.induk = 'Pilihan induk berada di bawah tugas ini.';
    }

    // --- pranala (predecessors) ---
    if (data.pranala !== undefined) {
      var pranala = normalisasiPranala(data.pranala);
      if (!Array.isArray(data.pranala)) {
        galat.pranala = 'Daftar pranala tidak valid.';
      } else if (data.pranala.length > PRANALA_MAKS) {
        galat.pranala = 'Maksimal ' + PRANALA_MAKS + ' pranala per tugas.';
      } else {
        for (var ip = 0; ip < data.pranala.length; ip++) {
          var p = data.pranala[ip];
          if (!p || typeof p !== 'object') { galat.pranala = 'Isi pranala tidak valid.'; break; }
          var ke = typeof p.ke === 'string' ? p.ke : '';
          if (!ke) { galat.pranala = 'Pilih tugas pranala terlebih dahulu.'; break; }
          if (idEdit && ke === idEdit) { galat.pranala = 'Tugas tidak boleh menjadi pranala dirinya sendiri.'; break; }
          if (!cariTugas(ke)) { galat.pranala = 'Tugas pranala tidak ditemukan.'; break; }
          if (p.jenis && p.jenis !== 'FS' && p.jenis !== 'SS') {
            galat.pranala = 'Jenis pranala harus FS atau SS.'; break;
          }
          var jeda = Number(p.jeda);
          if (!isFinite(jeda) || Math.floor(jeda) !== jeda || jeda < 0 || jeda > JEDA_MAKS) {
            galat.pranala = 'Jeda pranala harus bilangan bulat 0–' + JEDA_MAKS + ' hari kerja.'; break;
          }
          // deteksi siklus: jika tugas yang diedit sudah menjadi pranala transitif
          // dari `ke`, maka menambahkan ke->idEdit akan membentuk lingkaran.
          if (idEdit && pranalaTransitif(ke, idEdit)) {
            galat.pranala = 'Pranala membentuk siklus (tugas saling bergantung satu sama lain).';
            break;
          }
        }
        if (!galat.pranala) {
          var lihatP = {};
          for (var iq = 0; iq < pranala.length; iq++) {
            if (lihatP[pranala[iq].ke]) { galat.pranala = 'Tugas pranala tidak boleh dobel.'; break; }
            lihatP[pranala[iq].ke] = true;
          }
        }
      }
    }

    return galat;
  }

  function tambahTugas(data) {
    var galat = validasi(data, null);
    if (Object.keys(galat).length) return { galat: galat };

    var tugas = {
      id: uid(),
      nama: String(data.nama).trim().slice(0, 120),
      tanggalMulai: data.tanggalMulai,
      durasi: Math.floor(Number(data.durasi)),
      prioritas: data.prioritas && LABEL_PRIORITAS[data.prioritas] ? data.prioritas : 'sedang',
      warna: data.warna && /^#[0-9a-fA-F]{6}$/.test(data.warna) ? data.warna : WARNA_BAWAAN,
      parentId: data.parentId || null,
      pranala: normalisasiPranala(data.pranala),
      ciut: false,
      dibuat: Date.now()
    };
    daftarTugas.push(tugas);

    if (tugas.parentId) {
      var induk = cariTugas(tugas.parentId);
      if (induk) induk.ciut = false;   // buka induk agar sub-tugas langsung terlihat
    }

    // pranala baru dapat menarik tugas lain ke depan
    var pindah = jadwalkanUlang();
    simpan();
    render();
    return { ok: true, tugas: tugas, pindah: pindah };
  }

  function ubahTugas(id, data) {
    var lama = cariTugas(id);
    if (!lama) return { galat: { nama: 'Tugas tidak ditemukan.' } };

    var galat = validasi(data, id);
    if (Object.keys(galat).length) return { galat: galat };

    lama.nama = String(data.nama).trim().slice(0, 120);
    lama.tanggalMulai = data.tanggalMulai;
    lama.durasi = Math.floor(Number(data.durasi));
    lama.prioritas = LABEL_PRIORITAS[data.prioritas] ? data.prioritas : 'sedang';
    lama.warna = /^#[0-9a-fA-F]{6}$/.test(data.warna) ? data.warna : WARNA_BAWAAN;
    lama.parentId = data.parentId || null;
    if (data.pranala !== undefined) lama.pranala = normalisasiPranala(data.pranala);

    var pindah = jadwalkanUlang();
    simpan();
    render();
    return { ok: true, tugas: lama, pindah: pindah };
  }

  function hapusTugas(id) {
    var korban = new Set([id]);
    kumpulKeturunan(id).forEach(function (x) { korban.add(x); });
    daftarTugas = daftarTugas.filter(function (t) { return !korban.has(t.id); });
    // pranala yang menunjuk tugas terhapus dibersihkan, lalu jadwal dirapikan
    daftarTugas.forEach(function (t) {
      if (!Array.isArray(t.pranala) || !t.pranala.length) return;
      t.pranala = t.pranala.filter(function (p) { return !korban.has(p.ke); });
    });
    jadwalkanUlang();
    simpan();
    render();
    return korban.size;
  }

  function hapusSemua() {
    daftarTugas = [];
    try { localStorage.removeItem(KUNCI_DATA); } catch (e) { /* abaikan */ }
    render();
  }

  function toggleCiut(id) {
    var t = cariTugas(id);
    if (!t) return false;
    t.ciut = !t.ciut;
    simpan();
    render();
    return t.ciut;
  }

  /* ---------------------------------------------------------
     Data contoh
     --------------------------------------------------------- */

  function dataContoh() {
    var t0 = hariIni();
    var at = function (n) { return keISO(tambahHari(t0, n)); };
    var baris = [
      // nama, offset hari, durasi, prioritas, warna, indeks induk
      ['Perencanaan Proyek', 0, 5, 'tinggi', '#2563eb', null],
      ['Analisis kebutuhan', 0, 3, 'tinggi', '#0891b2', 0],
      ['Penyusunan dokumen', 3, 4, 'sedang', '#0891b2', 0],
      ['Desain Sistem', 5, 7, 'sedang', '#7c3aed', null],
      ['Wireframe antarmuka', 5, 3, 'tinggi', '#7c3aed', 3],
      ['Desain visual', 8, 4, 'sedang', '#db2777', 3],
      ['Pengembangan', 12, 15, 'tinggi', '#059669', null],
      ['Modul frontend', 12, 8, 'sedang', '#059669', 6],
      ['Modul backend & API', 14, 9, 'tinggi', '#65a30d', 6],
      ['Pengujian', 24, 6, 'sedang', '#ea580c', null],
      ['Uji fungsional', 24, 3, 'tinggi', '#ea580c', 9],
      ['Perbaikan temuan', 27, 3, 'rendah', '#ca8a04', 9],
      ['Peluncuran', 31, 2, 'tinggi', '#dc2626', null]
    ];
    var hasil = [];
    baris.forEach(function (b) {
      hasil.push({
        id: uid(),
        nama: b[0],
        tanggalMulai: at(b[1]),
        durasi: b[2],
        prioritas: b[3],
        warna: b[4],
        parentId: null,
        ciut: false,
        dibuat: Date.now() + hasil.length
      });
    });
    baris.forEach(function (b, i) {
      if (b[5] !== null) hasil[i].parentId = hasil[b[5]].id;
    });

    // contoh pranala: rantai utama FS + satu SS paralel
    var contohPranala = [
      [0, 3, 'FS', 0],    // Perencanaan -> Desain Sistem
      [3, 6, 'FS', 0],    // Desain Sistem -> Pengembangan
      [6, 9, 'FS', 0],    // Pengembangan -> Pengujian
      [9, 12, 'FS', 0],   // Pengujian -> Peluncuran
      [7, 8, 'SS', 2]     // Modul frontend -> Modul backend (SS + 2 hari kerja)
    ];
    contohPranala.forEach(function (c) {
      hasil[c[1]].pranala = [{ ke: hasil[c[0]].id, jenis: c[2], jeda: c[3] }];
    });

    return hasil;
  }

  function muatContoh() {
    daftarTugas = dataContoh();
    jadwalkanUlang();   // contoh berisi pranala -> rapikan tanggal
    simpan();
    render();
    scrollKeHariIni(false);
  }

  /* ---------------------------------------------------------
     Timeline (rentang, daftar hari, index bar)
     --------------------------------------------------------- */

  function hitungRentang() {
    if (!daftarTugas.length) {
      var t = hariIni();
      rentang = { mulai: tambahHari(t, -7), selesai: tambahHari(t, 30), dibatasi: false };
      return;
    }
    var min = null, max = null;
    daftarTugas.forEach(function (t) {
      var s = parseTanggal(t.tanggalMulai);
      var e = akhirTugas(t);
      if (s && (!min || s < min)) min = s;
      if (!max || e > max) max = e;
    });
    if (!min) min = hariIni();
    if (!max) max = tambahHari(min, 10);

    var th = hariIni();
    if (th < min) min = th;
    if (th > max) max = th;

    min = tambahHari(min, -3);
    max = tambahHari(max, 5);

    var total = Math.round((max.getTime() - min.getTime()) / 86400000) + 1;
    var dibatasi = false;
    if (total > HARI_MAKS) {
      max = tambahHari(min, HARI_MAKS - 1);
      total = HARI_MAKS;
      dibatasi = true;
    }
    rentang = { mulai: min, selesai: max, dibatasi: dibatasi };
  }

  function bangunDaftarHari() {
    daftarHari = [];
    indeksHari = {};
    var d = new Date(rentang.mulai.getTime());
    var jaga = 0;
    while (d <= rentang.selesai && jaga <= HARI_MAKS) {
      if (!(pref.sembunyikanAkhirPekan && !isKerja(d))) {
        indeksHari[keISO(d)] = daftarHari.length;
        daftarHari.push(new Date(d.getTime()));
      }
      d = tambahHari(d, 1);
      jaga += 1;
    }
  }

  function siapkanTimeline() {
    hitungRentang();
    bangunDaftarHari();
  }

  /** Cari index hari pada timeline. arah: 1 = cari ke depan, -1 = ke belakang. */
  function cariIndeks(tglStr, arah) {
    if (Object.prototype.hasOwnProperty.call(indeksHari, tglStr)) return indeksHari[tglStr];
    var d = parseTanggal(tglStr);
    if (!d) return -1;
    var k, idx;
    for (k = 1; k <= 7; k++) {
      idx = indeksHari[keISO(tambahHari(d, arah * k))];
      if (idx !== undefined) return idx;
    }
    for (k = 1; k <= 7; k++) {
      idx = indeksHari[keISO(tambahHari(d, -arah * k))];
      if (idx !== undefined) return idx;
    }
    return -1;
  }

  /* ---------------------------------------------------------
     Render
     --------------------------------------------------------- */

  function siapUI() { return !!(el.ganttScroll && el.ganttBadan); }

  function render() {
    if (!siapUI()) return;   // dipanggil di halaman uji tanpa UI

    var kosong = daftarTugas.length === 0;
    el.kosong.hidden = !kosong;
    el.ganttScroll.hidden = kosong;
    el.toolbar.hidden = kosong;

    siapkanTimeline();
    el.ganttInner.style.setProperty('--n-hari', String(daftarHari.length));
    renderRingkasan();
    renderPeringatan();

    if (kosong) {
      el.barisWadah.innerHTML = '';
      el.overlayGaris.innerHTML = '';
      kosongPanah();
      return;
    }

    var sl = el.ganttScroll.scrollLeft;
    var st = el.ganttScroll.scrollTop;

    renderHeader();
    renderBaris();
    renderOverlay();
    renderPanah();

    el.ganttScroll.scrollLeft = sl;
    el.ganttScroll.scrollTop = st;
  }

  function renderRingkasan() {
    var total = daftarTugas.length;
    var anak = daftarTugas.filter(function (t) { return !!t.parentId; }).length;
    el.stTotal.textContent = String(total);
    el.stInduk.textContent = String(total - anak);
    el.stAnak.textContent = String(anak);
    el.stRentang.textContent = total
      ? tglPendek(rentang.mulai) + ' – ' + tglPendek(rentang.selesai)
      : '—';
    el.stHariIni.textContent = tglPendek(hariIni());
    if (el.stLibur) el.stLibur.textContent = String(kalender.libur.length);
  }

  function renderPeringatan() {
    if (rentang.dibatasi) {
      el.peringatanRentang.hidden = false;
      el.peringatanRentang.textContent =
        'Rentang timeline dibatasi ' + HARI_MAKS +
        ' hari; tugas di luar rentang tersebut tidak digambar di bagan (daftar tugas tetap lengkap).';
    } else {
      el.peringatanRentang.hidden = true;
    }
  }

  function renderHeader() {
    // segmen bulan
    var bulan = [];
    daftarHari.forEach(function (d) {
      var key = d.getFullYear() + '-' + d.getMonth();
      var akhir = bulan[bulan.length - 1];
      if (akhir && akhir.key === key) {
        akhir.n += 1;
      } else {
        bulan.push({ key: key, n: 1, label: BULAN[d.getMonth()] + ' ' + d.getFullYear() });
      }
    });
    el.barisBulan.innerHTML = bulan.map(function (b) {
      return '<div class="kolom-bulan" style="width:calc(' + b.n + ' * var(--day-w))">' +
        escapeHtml(b.label) + '</div>';
    }).join('');

    // hari
    var th = hariIni();
    el.barisHari.innerHTML = daftarHari.map(function (d) {
      var we = !isKerja(d);
      var ini = setara(d, th);
      return '<div class="kolom-hari' + (we ? ' akhir-pekannya' : '') + (ini ? ' ini' : '') +
        '" title="' + escapeHtml(tglPanjang(d)) + '">' +
        '<span class="angka">' + d.getDate() + '</span>' +
        '<span class="kecil">' + HARI_PENDEK[d.getDay()] + '</span>' +
        '</div>';
    }).join('');
  }

  function teksKontras(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#111827' : '#ffffff';
  }

  function renderBaris() {
    var baris = bangunDaftar(daftarTugas, true);

    el.barisWadah.innerHTML = baris.map(function (b) {
      var t = b.tugas;
      var akhir = akhirTugas(t);
      var mulai = parseTanggal(t.tanggalMulai) || hariIni();
      var eid = escapeHtml(t.id);   // id dari storage bisa berisi karakter apa pun

      // --- bar ---
      var barHtml = '';
      var i0 = cariIndeks(t.tanggalMulai, 1);
      var i1 = cariIndeks(keISO(akhir), -1);
      if (i0 >= 0 && i1 >= 0) {
        var span = Math.max(1, i1 - i0 + 1);
        var tip = t.nama + ' • ' + t.durasi + ' hari kerja • ' +
          tglPendek(mulai) + ' s/d ' + tglPendek(akhir);
        barHtml = '<div class="bar ' + (b.depth === 0 ? 'bar-utama' : 'bar-anak') +
          '" data-aksi="edit" data-id="' + eid + '"' +
          ' style="--i:' + i0 + ';--span:' + span + ';' +
          'background:' + t.warna + ';color:' + teksKontras(t.warna) + '"' +
          ' title="' + escapeHtml(tip) + '" role="button" tabindex="0"' +
          ' aria-label="Edit ' + escapeHtml(t.nama) + '">' +
          '<span class="teks-bar">' + escapeHtml(t.nama) + '</span></div>';
      }

      // --- baris kiri ---
      var chev = b.punyaAnak
        ? '<button type="button" class="chev' + (t.ciut ? '' : ' buka') +
          '" data-aksi="toggle" data-id="' + eid + '"' +
          ' title="' + (t.ciut ? 'Buka' : 'Tutup') + ' sub-tugas"' +
          ' aria-label="' + (t.ciut ? 'Buka' : 'Tutup') + ' sub-tugas">▸</button>'
        : '<span class="chev-kosong"></span>';

      var teksPranala = '';
      if (Array.isArray(t.pranala) && t.pranala.length) {
        teksPranala = t.pranala.map(function (p) {
          return p.jenis + (p.jeda ? '+' + p.jeda : '');
        }).join(', ');
      }

      var meta = '<span class="badge pr-' + t.prioritas + '">' +
        LABEL_PRIORITAS[t.prioritas] + '</span>' +
        '<span>' + t.durasi + ' hr kerja</span>' +
        '<span>' + tglPendek(mulai) + ' – ' + tglPendek(akhir) + '</span>' +
        (teksPranala ? '<span class="badge badge-pranala" title="Pranala: ' +
          escapeHtml(teksPranala) + '">⛓ ' + escapeHtml(teksPranala) + '</span>' : '') +
        (b.punyaAnak ? '<span>' + b.jumlahAnak + ' sub</span>' : '');

      return '<div class="baris' + (b.depth === 0 ? ' baris-utama' : '') +
        '" data-id="' + eid + '" data-depth="' + b.depth + '">' +
        '<div class="baris-kiri" style="--depth:' + b.depth + '">' +
          chev +
          '<span class="titik" style="background:' + t.warna + '"></span>' +
          '<div class="teks">' +
            '<div class="nama" data-aksi="edit" data-id="' + eid + '" title="' +
              escapeHtml(t.nama) + '">' + escapeHtml(t.nama) + '</div>' +
            '<div class="meta">' + meta + '</div>' +
          '</div>' +
          '<div class="aksi">' +
            '<button type="button" class="tombol-kecil" data-aksi="anak" data-id="' + eid +
              '" title="Tambah sub-tugas" aria-label="Tambah sub-tugas">＋</button>' +
            '<button type="button" class="tombol-kecil" data-aksi="edit" data-id="' + eid +
              '" title="Edit tugas" aria-label="Edit tugas">✎</button>' +
            '<button type="button" class="tombol-kecil bahaya" data-aksi="hapus" data-id="' + eid +
              '" title="Hapus tugas" aria-label="Hapus tugas">🗑</button>' +
          '</div>' +
        '</div>' +
        '<div class="baris-tim">' + barHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function renderOverlay() {
    var html = '';
    daftarHari.forEach(function (d, i) {
      if (isKerja(d)) return;
      var kelas = namaLibur(keISO(d)) ? 'pita-libur' : 'pita-pek';
      html += '<span class="' + kelas + '" style="--i:' + i + '"></span>';
    });
    var th = keISO(hariIni());
    if (Object.prototype.hasOwnProperty.call(indeksHari, th)) {
      html += '<span class="garis-ini" style="--i:' + indeksHari[th] +
        '" title="Hari ini"></span>';
    }
    el.overlayGaris.innerHTML = html;
  }

  /* ---------------------------------------------------------
     Panah pranala (ketergantungan antar bar)
     --------------------------------------------------------- */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Geometri jalur panah (murni, diuji lewat halaman uji).
   * (x1,y1) = ujung kanan bar pranala · (x2,y2) = sisi kiri bar tujuan.
   * Menghasilkan nilai atribut d untuk <path> SVG.
   */
  function jalurPanah(x1, y1, x2, y2) {
    var celah = 2;      // jarak kepala panah dari bar tujuan
    var lekuk = 10;     // ruang putar elbow
    var ujung = x2 - celah;

    if (y1 === y2) {
      // sebaris: lurus, atau turun dulu bila bar tujuan mendekat/mundur
      if (ujung - x1 >= lekuk) return 'M' + x1 + ' ' + y1 + ' L' + ujung + ' ' + y2;
      return 'M' + x1 + ' ' + y1 + ' h' + lekuk + ' V' + (y2 + 15) + ' H' + ujung;
    }

    var mx;
    if (x2 - x1 >= lekuk * 2) mx = Math.round((x1 + x2) / 2);
    else mx = x1 + lekuk;   // tujuan mendekat/mundur -> putar di dekat bar sumber
    return 'M' + x1 + ' ' + y1 + ' H' + mx + ' V' + y2 + ' H' + ujung;
  }

  function kosongPanah() {
    var svg = el.panahLayer;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  /** Gambar panah ketergantungan di atas bar (dipanggil setelah renderBaris). */
  function renderPanah() {
    var svg = el.panahLayer;
    if (!svg) return;
    kosongPanah();
    if (!daftarTugas.length) return;

    // posisi bar relatif terhadap gantt-inner (bebas scroll)
    var ref = el.ganttInner.getBoundingClientRect();
    var petaBar = {};
    Array.prototype.forEach.call(el.barisWadah.querySelectorAll('.bar'), function (b) {
      petaBar[b.getAttribute('data-id')] = b;
    });

    var defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML =
      '<marker id="panahUjung" viewBox="0 0 10 10" refX="9" refY="5"' +
      ' markerWidth="5.5" markerHeight="5.5" orient="auto">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="#64748b"></path></marker>' +
      '<marker id="panahUjungSS" viewBox="0 0 10 10" refX="9" refY="5"' +
      ' markerWidth="5.5" markerHeight="5.5" orient="auto">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="#7c3aed"></path></marker>';
    svg.appendChild(defs);

    daftarTugas.forEach(function (t) {
      if (!Array.isArray(t.pranala)) return;
      for (var i = 0; i < t.pranala.length; i++) {
        var p = t.pranala[i];
        var pred = cariTugas(p.ke);
        if (!pred) continue;
        var barA = petaBar[p.ke];
        var barB = petaBar[t.id];
        if (!barA || !barB) continue;   // bar tidak tampil (di luar rentang / induk ciut)

        var ra = barA.getBoundingClientRect();
        var rb = barB.getBoundingClientRect();
        var x1 = ra.right - ref.left;
        var y1 = ra.top + ra.height / 2 - ref.top;
        var x2 = rb.left - ref.left;
        var y2 = rb.top + rb.height / 2 - ref.top;

        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', jalurPanah(x1, y1, x2, y2));
        path.setAttribute('class', 'panah-jalur' + (p.jenis === 'SS' ? ' ss' : ''));
        path.setAttribute('marker-end',
          p.jenis === 'SS' ? 'url(#panahUjungSS)' : 'url(#panahUjung)');

        var judul = document.createElementNS(SVG_NS, 'title');
        judul.textContent = pred.nama + ' → ' + t.nama + ' · ' + p.jenis +
          (p.jeda ? ' + ' + p.jeda + ' hari kerja' : ' (tanpa jeda)');
        path.appendChild(judul);
        svg.appendChild(path);
      }
    });
  }

  function scrollKeHariIni(halus) {
    if (!siapUI() || !daftarHari.length) return;
    var i = indeksHari[keISO(hariIni())];
    if (i === undefined) {
      // akhir pekan disembunyikan: pakai hari terdekat yang tampil
      var k;
      for (k = 1; k <= 4 && i === undefined; k++) {
        i = indeksHari[keISO(tambahHari(hariIni(), k))];
        if (i === undefined) i = indeksHari[keISO(tambahHari(hariIni(), -k))];
      }
    }
    if (i === undefined) return;

    var cs = getComputedStyle(el.ganttInner);
    var dayW = parseFloat(cs.getPropertyValue('--day-w')) || 32;
    var leftW = parseFloat(cs.getPropertyValue('--left-w')) || 360;
    var lebarTampil = el.ganttScroll.clientWidth - leftW;
    var target = Math.max(0, leftW + i * dayW + dayW / 2 - lebarTampil / 2);
    var maks = Math.max(0, el.ganttScroll.scrollWidth - el.ganttScroll.clientWidth);
    target = Math.min(target, maks);

    if (halus && typeof el.ganttScroll.scrollTo === 'function') {
      el.ganttScroll.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      el.ganttScroll.scrollLeft = target;
    }
  }

  /* ---------------------------------------------------------
     Toast
     --------------------------------------------------------- */

  function toast(pesan, jenis) {
    if (!el.toastWadah) return;
    var d = document.createElement('div');
    d.className = 'toast' + (jenis === 'galat' ? ' galat' : '');
    d.textContent = pesan;
    el.toastWadah.appendChild(d);
    setTimeout(function () {
      d.classList.add('lepas');
      setTimeout(function () { d.remove(); }, 300);
    }, 2600);
  }

  /* ---------------------------------------------------------
     Dialog form
     --------------------------------------------------------- */

  var PETA_GALAT = {
    nama: ['errNama', 'fldNama'],
    tanggalMulai: ['errMulai', 'fldMulai'],
    durasi: ['errDurasi', 'fldDurasi'],
    induk: ['errInduk', 'fldInduk'],
    pranala: ['errPranala', null]
  };

  function bersihkanGalat(semua) {
    Object.keys(PETA_GALAT).forEach(function (k) {
      if (semua === true || k === semua) {
        var err = $(PETA_GALAT[k][0]);
        var inp = $(PETA_GALAT[k][1]);
        if (err) { err.hidden = true; err.textContent = ''; }
        if (inp) inp.classList.remove('invalid');
      }
    });
  }

  function tampilkanGalat(galat) {
    bersihkanGalat(true);
    var pertama = null;
    Object.keys(galat).forEach(function (k) {
      var p = PETA_GALAT[k];
      if (!p) return;
      var err = $(p[0]);
      var inp = $(p[1]);
      if (err) { err.textContent = galat[k]; err.hidden = false; }
      if (inp) { inp.classList.add('invalid'); if (!pertama) pertama = inp; }
    });
    if (pertama) pertama.focus();
  }

  function isiOpsiInduk(idEdit) {
    var buang = new Set();
    if (idEdit) {
      buang.add(idEdit);
      kumpulKeturunan(idEdit).forEach(function (x) { buang.add(x); });
    }
    var baris = bangunDaftar(daftarTugas, false);
    var opsi = ['<option value="">— Tugas utama (tanpa induk) —</option>'];
    baris.forEach(function (b) {
      if (buang.has(b.tugas.id)) return;
      var awalan = '';
      for (var i = 0; i < b.depth; i++) awalan += '— ';
      opsi.push('<option value="' + escapeHtml(b.tugas.id) + '">' +
        escapeHtml(awalan + b.tugas.nama) + '</option>');
    });
    el.fldInduk.innerHTML = opsi.join('');
  }

  /* ---------------------------------------------------------
     Editor pranala pada dialog tugas
     --------------------------------------------------------- */

  /** Opsi tugas untuk select pranala: semua tugas kecuali diri & keturunannya. */
  function opsiTugasPranala(idEdit) {
    var buang = new Set();
    if (idEdit) {
      buang.add(idEdit);
      kumpulKeturunan(idEdit).forEach(function (x) { buang.add(x); });
    }
    var baris = bangunDaftar(daftarTugas, false);
    var opsi = ['<option value="">— Pilih tugas —</option>'];
    baris.forEach(function (b) {
      if (buang.has(b.tugas.id)) return;
      var awalan = '';
      for (var i = 0; i < b.depth; i++) awalan += '— ';
      opsi.push('<option value="' + escapeHtml(b.tugas.id) + '">' +
        escapeHtml(awalan + b.tugas.nama) + '</option>');
    });
    return opsi.join('');
  }

  function isiDaftarPranala() {
    if (!draftPranala.length) {
      el.daftarPranala.innerHTML =
        '<p class="pranala-kosong">Belum ada pranala — tugas ini berjalan mandiri.</p>';
      return;
    }
    var opsiTugas = opsiTugasPranala(modeEdit);
    el.daftarPranala.innerHTML = draftPranala.map(function (p, i) {
      return '<div class="pranala-baris" data-idx="' + i + '">' +
        '<select class="pr-tugas" aria-label="Tugas pranala">' + opsiTugas + '</select>' +
        '<select class="pr-jenis" aria-label="Jenis pranala">' +
          '<option value="FS">FS — selesai → mulai</option>' +
          '<option value="SS">SS — mulai → mulai</option>' +
        '</select>' +
        '<label class="pr-jeda">Jeda <input type="number" class="pr-jeda-in"' +
          ' min="0" max="' + JEDA_MAKS + '" step="1" value="' + p.jeda + '"' +
          ' aria-label="Jeda hari kerja"> hari kerja</label>' +
        '<button type="button" class="tombol-kecil bahaya pr-hapus"' +
          ' title="Hapus pranala" aria-label="Hapus pranala">🗑</button>' +
      '</div>';
    }).join('');

    // terapkan nilai tersimpan (select harus disetelah opsi terpasang)
    Array.prototype.forEach.call(el.daftarPranala.querySelectorAll('.pranala-baris'),
      function (row, i) {
        row.querySelector('.pr-tugas').value = draftPranala[i].ke || '';
        row.querySelector('.pr-jenis').value = draftPranala[i].jenis || 'FS';
      });
  }

  /** Baca isi baris pranala dari DOM menjadi array draft. */
  function bacaDraftPranala() {
    var hasil = [];
    Array.prototype.forEach.call(el.daftarPranala.querySelectorAll('.pranala-baris'),
      function (row) {
        hasil.push({
          ke: row.querySelector('.pr-tugas').value,
          jenis: row.querySelector('.pr-jenis').value,
          jeda: Math.floor(Number(row.querySelector('.pr-jeda-in').value))
        });
      });
    return hasil;
  }

  function renderSwatch() {
    el.swatch.innerHTML = WARNA_PILIHAN.map(function (w) {
      return '<button type="button" class="pil-warna" data-warna="' + w +
        '" style="background:' + w + '" aria-label="Pilih warna ' + w + '"></button>';
    }).join('');
    tandaiSwatchAktif();
  }

  function tandaiSwatchAktif() {
    var nilai = String(el.fldWarna.value || '').toLowerCase();
    Array.prototype.forEach.call(el.swatch.querySelectorAll('.pil-warna'), function (b) {
      b.classList.toggle('aktif', b.getAttribute('data-warna').toLowerCase() === nilai);
    });
  }

  function updatePratinjau() {
    var teksInduk = 'Kosongkan jika ini tugas utama.';
    if (el.fldInduk.value) {
      var opt = el.fldInduk.options[el.fldInduk.selectedIndex];
      teksInduk = 'Akan menjadi sub-tugas dari “' + (opt ? opt.textContent : '') + '”.';
    }
    el.catatanInduk.textContent = teksInduk;

    var mulai = parseTanggal(el.fldMulai.value);
    var dur = Math.floor(Number(el.fldDurasi.value));
    if (!mulai || !isFinite(dur) || dur < 1) {
      el.pratinjau.innerHTML = 'Isi <b>tanggal mulai</b> dan <b>durasi</b> untuk melihat perkiraan tanggal selesai.';
      return;
    }
    var akhir = akhirTugas({ tanggalMulai: el.fldMulai.value, durasi: dur });
    var catatan = '';
    if (!isKerja(mulai)) {
      catatan = '<br><span class="catatan-warn">⚠ ' +
        HARI[mulai.getDay()] + ' bukan hari kerja (akhir pekan/libur)' +
        ' — dihitung mulai hari kerja berikutnya.</span>';
    }

    // pengaruh pranala terhadap tanggal mulai
    var batas = draftPranala.length ? mulaiTerlama({ pranala: draftPranala }) : null;
    if (batas) {
      catatan += '<br><b>Batas mulai dari pranala:</b> ' + tglPanjang(batas);
      if (mulai < batas) {
        catatan += ' <span class="catatan-warn">⚠ tanggal mulai akan digeser' +
          ' otomatis ke tanggal ini.</span>';
      }
    }

    el.pratinjau.innerHTML = '<b>Perkiraan selesai:</b> ' + tglPanjang(akhir) +
      ' <span class="redup">(' + dur + ' hari kerja sesuai kalender)</span>' + catatan;
  }

  function bukaModal(idEdit, idInduk) {
    modeEdit = idEdit || null;
    idIndukDipilih = idInduk || null;
    bersihkanGalat(true);
    isiOpsiInduk(modeEdit);

    if (modeEdit) {
      var t = cariTugas(modeEdit);
      if (!t) return;
      el.judulModal.textContent = 'Edit Tugas';
      el.btnSimpan.textContent = 'Simpan Perubahan';
      el.fldNama.value = t.nama;
      el.fldMulai.value = t.tanggalMulai;
      el.fldDurasi.value = String(t.durasi);
      el.fldPrioritas.value = t.prioritas;
      el.fldWarna.value = t.warna;
      el.fldInduk.value = t.parentId || '';
      draftPranala = klona(t.pranala || []);
    } else {
      el.judulModal.textContent = idIndukDipilih ? 'Tambah Sub-Tugas' : 'Tambah Tugas';
      el.btnSimpan.textContent = 'Simpan Tugas';
      el.fldNama.value = '';
      el.fldMulai.value = keISO(hariIni());
      el.fldDurasi.value = String(HARI_DEFAULT);
      el.fldPrioritas.value = 'sedang';
      var induk = idIndukDipilih ? cariTugas(idIndukDipilih) : null;
      el.fldWarna.value = induk ? induk.warna : WARNA_BAWAAN;
      el.fldInduk.value = idIndukDipilih || '';
      draftPranala = [];
    }

    isiDaftarPranala();
    tandaiSwatchAktif();
    updatePratinjau();
    el.tirai.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { el.fldNama.focus(); }, 0);
  }

  function tutupModal() {
    el.tirai.hidden = true;
    document.body.style.overflow = '';
    modeEdit = null;
    idIndukDipilih = null;
    draftPranala = [];
  }

  function modalTerbuka() { return !el.tirai.hidden; }

  /* ---------------------------------------------------------
     Dialog kalender proyek
     --------------------------------------------------------- */

  var HARI_OP_URUT = [1, 2, 3, 4, 5, 6, 0];   // tampil Senin..Minggu

  function bukaKalender() {
    draftKalender = klona(kalender);
    bersihkanGalatKalender();
    renderHariOp();
    renderDaftarLibur();
    updatePratinjauKalender();
    el.tiraiKalender.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function tutupKalender() {
    el.tiraiKalender.hidden = true;
    if (el.tirai.hidden) document.body.style.overflow = '';
    draftKalender = null;
  }

  function kalenderTerbuka() { return !el.tiraiKalender.hidden; }

  function bersihkanGalatKalender() {
    ['errAkhirPekan', 'errLibur'].forEach(function (id) {
      var e = $(id);
      if (e) { e.hidden = true; e.textContent = ''; }
    });
  }

  function tampilkanGalatKalender(galat) {
    bersihkanGalatKalender();
    if (galat.akhirPekan) {
      el.errAkhirPekan.textContent = galat.akhirPekan;
      el.errAkhirPekan.hidden = false;
    }
    var lain = galat.libur || galat.dasar;
    if (lain) {
      el.errLibur.textContent = lain;
      el.errLibur.hidden = false;
    }
  }

  function renderHariOp() {
    el.hariOp.innerHTML = HARI_OP_URUT.map(function (n) {
      var aktif = draftKalender.akhirPekan.indexOf(n) !== -1;
      return '<label><input type="checkbox" data-hari="' + n + '"' +
        (aktif ? ' checked' : '') + '> ' + HARI[n] + '</label>';
    }).join('');
  }

  function renderDaftarLibur() {
    if (!draftKalender.libur.length) {
      el.daftarLibur.innerHTML = '<p class="libur-kosong">Belum ada hari libur khusus.</p>';
      return;
    }
    el.daftarLibur.innerHTML = draftKalender.libur.map(function (l, i) {
      return '<div class="libur-baris" data-idx="' + i + '">' +
        '<input type="date" class="lib-tanggal" value="' + escapeHtml(l.tanggal) +
          '" aria-label="Tanggal libur">' +
        '<input type="text" class="lib-nama" maxlength="60"' +
          ' placeholder="Nama libur (opsional)" value="' + escapeHtml(l.nama || '') +
          '" aria-label="Nama hari libur">' +
        '<button type="button" class="tombol-kecil bahaya lib-hapus"' +
          ' title="Hapus hari libur" aria-label="Hapus hari libur">🗑</button>' +
      '</div>';
    }).join('');
  }

  /** Baca baris libur dari DOM menjadi array draft. */
  function bacaDraftLibur() {
    var hasil = [];
    Array.prototype.forEach.call(el.daftarLibur.querySelectorAll('.libur-baris'),
      function (row) {
        hasil.push({
          id: (draftKalender.libur[hasil.length] && draftKalender.libur[hasil.length].id) || uid(),
          tanggal: row.querySelector('.lib-tanggal').value,
          nama: row.querySelector('.lib-nama').value
        });
      });
    return hasil;
  }

  function updatePratinjauKalender() {
    if (!draftKalender) return;
    var nKerja = 7 - draftKalender.akhirPekan.length;
    var ap = draftKalender.akhirPekan.slice().sort(function (a, b) { return a - b; })
      .map(function (n) { return HARI[n]; }).join(', ');
    el.pratinjauKalender.innerHTML =
      '<b>Akhir pekan:</b> ' + (ap ? escapeHtml(ap) : 'tidak ada') +
      ' <span class="redup">(' + nKerja + ' hari kerja per minggu)</span>' +
      '<br><b>Hari libur terdaftar:</b> ' + draftKalender.libur.length +
      ' tanggal';
  }

  /* ---------------------------------------------------------
     Event
     --------------------------------------------------------- */

  function bind() {
    el.btnTambah.addEventListener('click', function () { bukaModal(null, null); });
    el.btnTambahKosong.addEventListener('click', function () { bukaModal(null, null); });

    el.btnContoh.addEventListener('click', function () {
      if (daftarTugas.length &&
          !confirm('Ganti seluruh tugas yang ada dengan data contoh?')) return;
      muatContoh();
      toast('Data contoh dimuat.');
    });
    el.btnContohKosong.addEventListener('click', function () {
      muatContoh();
      toast('Data contoh dimuat.');
    });

    el.btnReset.addEventListener('click', function () {
      if (!daftarTugas.length) { toast('Belum ada data untuk dihapus.'); return; }
      if (!confirm('Hapus SEMUA tugas dan sub-tugas? Tindakan ini tidak dapat dibatalkan.')) return;
      hapusSemua();
      toast('Semua data dihapus.');
    });

    el.btnHariIni.addEventListener('click', function () { scrollKeHariIni(true); });

    el.btnKalender.addEventListener('click', bukaKalender);
    el.btnTutupKalender.addEventListener('click', tutupKalender);
    el.btnKalenderBatal.addEventListener('click', tutupKalender);
    el.tiraiKalender.addEventListener('mousedown', function (e) {
      if (e.target === el.tiraiKalender) tutupKalender();
    });

    el.btnKalenderReset.addEventListener('click', function () {
      draftKalender = kalenderBawaan();
      bersihkanGalatKalender();
      renderHariOp();
      renderDaftarLibur();
      updatePratinjauKalender();
    });

    el.hariOp.addEventListener('change', function (e) {
      var cb = e.target;
      if (!cb || !cb.getAttribute || cb.getAttribute('data-hari') === null) return;
      var n = Number(cb.getAttribute('data-hari'));
      var ap = draftKalender.akhirPekan.slice();
      var i = ap.indexOf(n);
      if (cb.checked && i === -1) ap.push(n);
      if (!cb.checked && i !== -1) ap.splice(i, 1);
      draftKalender.akhirPekan = ap;
      updatePratinjauKalender();
    });

    el.btnTambahLibur.addEventListener('click', function () {
      if (draftKalender.libur.length >= LIBUR_MAKS) {
        toast('Maksimal ' + LIBUR_MAKS + ' hari libur khusus.', 'galat');
        return;
      }
      draftKalender.libur = bacaDraftLibur();
      draftKalender.libur.push({ id: uid(), tanggal: keISO(hariIni()), nama: '' });
      renderDaftarLibur();
      updatePratinjauKalender();
      var inp = el.daftarLibur.querySelector('.libur-baris:last-child .lib-tanggal');
      if (inp) inp.focus();
    });

    el.daftarLibur.addEventListener('input', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.libur-baris') : null;
      if (!row || !draftKalender) return;
      var idx = Number(row.getAttribute('data-idx'));
      var l = draftKalender.libur[idx];
      if (!l) return;
      if (e.target.classList.contains('lib-tanggal')) l.tanggal = e.target.value;
      if (e.target.classList.contains('lib-nama')) l.nama = e.target.value;
      updatePratinjauKalender();
    });

    el.daftarLibur.addEventListener('click', function (e) {
      var btn = e.target.closest('.lib-hapus');
      if (!btn || !draftKalender) return;
      var row = btn.closest('.libur-baris');
      var idx = Number(row.getAttribute('data-idx'));
      draftKalender.libur = bacaDraftLibur();
      draftKalender.libur.splice(idx, 1);
      renderDaftarLibur();
      updatePratinjauKalender();
    });

    el.formKalender.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!draftKalender) return;
      draftKalender.libur = bacaDraftLibur();
      var res = setKalender(draftKalender);
      if (res.galat) { tampilkanGalatKalender(res.galat); return; }
      tutupKalender();
      var pesan = 'Kalender disimpan.';
      if (res.pindah) pesan += ' ' + res.pindah + ' tugas digeser menyesuaikan jadwal.';
      toast(pesan);
    });

    el.chkAkhirPekan.addEventListener('change', function () {
      setPref({ sembunyikanAkhirPekan: el.chkAkhirPekan.checked });
      render();
    });

    // aksi pada baris / bar (delegasi)
    el.ganttBadan.addEventListener('click', function (e) {
      var target = e.target.closest('[data-aksi]');
      if (!target) return;
      var aksi = target.getAttribute('data-aksi');
      var id = target.getAttribute('data-id');
      if (aksi === 'toggle') {
        toggleCiut(id);
      } else if (aksi === 'edit') {
        bukaModal(id, null);
      } else if (aksi === 'anak') {
        bukaModal(null, id);
      } else if (aksi === 'hapus') {
        var t = cariTugas(id);
        if (!t) return;
        var keturunan = kumpulKeturunan(id).size;
        var pesan = keturunan
          ? 'Hapus “' + t.nama + '” beserta ' + keturunan + ' sub-tugasnya?'
          : 'Hapus tugas “' + t.nama + '”?';
        if (!confirm(pesan)) return;
        var n = hapusTugas(id);
        toast(n > 1 ? n + ' tugas dihapus.' : 'Tugas dihapus.');
      }
    });

    // dialog
    el.btnTutup.addEventListener('click', tutupModal);
    el.btnBatal.addEventListener('click', tutupModal);
    el.tirai.addEventListener('mousedown', function (e) {
      if (e.target === el.tirai) tutupModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (kalenderTerbuka()) tutupKalender();
      else if (modalTerbuka()) tutupModal();
    });

    // posisi panah pranala mengikuti perubahan ukuran jendela
    window.addEventListener('resize', function () {
      if (siapUI() && daftarTugas.length) renderPanah();
    });

    // bar Gantt dapat diakses lewat keyboard
    el.ganttBadan.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('tabindex') === '0' && t.hasAttribute('data-aksi')) {
        e.preventDefault();
        t.click();
      }
    });

    el.fldWarna.addEventListener('input', tandaiSwatchAktif);
    el.swatch.addEventListener('click', function (e) {
      var b = e.target.closest('.pil-warna');
      if (!b) return;
      el.fldWarna.value = b.getAttribute('data-warna');
      tandaiSwatchAktif();
    });

    ['fldNama', 'fldMulai', 'fldDurasi', 'fldInduk'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        bersihkanGalat(id === 'fldInduk' ? 'induk' :
          id === 'fldNama' ? 'nama' :
          id === 'fldMulai' ? 'tanggalMulai' : 'durasi');
        updatePratinjau();
      });
    });
    el.fldInduk.addEventListener('change', updatePratinjau);

    // --- editor pranala ---
    el.btnTambahPranala.addEventListener('click', function () {
      if (draftPranala.length >= PRANALA_MAKS) {
        toast('Maksimal ' + PRANALA_MAKS + ' pranala per tugas.', 'galat');
        return;
      }
      draftPranala = bacaDraftPranala();
      draftPranala.push({ ke: '', jenis: 'FS', jeda: 0 });
      isiDaftarPranala();
      updatePratinjau();
      var sel = el.daftarPranala.querySelector('.pranala-baris:last-child .pr-tugas');
      if (sel) sel.focus();
    });

    el.daftarPranala.addEventListener('change', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.pranala-baris') : null;
      if (!row) return;
      draftPranala = bacaDraftPranala();
      updatePratinjau();
    });

    el.daftarPranala.addEventListener('input', function (e) {
      if (!e.target || !e.target.classList || !e.target.classList.contains('pr-jeda-in')) return;
      draftPranala = bacaDraftPranala();
      updatePratinjau();
    });

    el.daftarPranala.addEventListener('click', function (e) {
      var btn = e.target.closest('.pr-hapus');
      if (!btn) return;
      var row = btn.closest('.pranala-baris');
      var idx = Number(row.getAttribute('data-idx'));
      draftPranala = bacaDraftPranala();
      draftPranala.splice(idx, 1);
      isiDaftarPranala();
      updatePratinjau();
    });

    el.formTugas.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        nama: el.fldNama.value,
        tanggalMulai: el.fldMulai.value,
        durasi: Math.floor(Number(el.fldDurasi.value)),
        prioritas: el.fldPrioritas.value,
        warna: el.fldWarna.value,
        parentId: el.fldInduk.value || null,
        pranala: bacaDraftPranala()
      };
      var idSebelum = modeEdit;
      var res = modeEdit ? ubahTugas(modeEdit, data) : tambahTugas(data);
      if (res.galat) { tampilkanGalat(res.galat); return; }
      tutupModal();
      var pesan;
      if (idSebelum) pesan = 'Perubahan disimpan.';
      else if (data.parentId) pesan = 'Sub-tugas ditambahkan.';
      else pesan = 'Tugas ditambahkan.';
      if (res.pindah) pesan += ' ' + res.pindah + ' tugas digeser menyesuaikan pranala.';
      toast(pesan);
    });
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  function initUI() {
    el = {
      bannerPenyimpanan: $('bannerPenyimpanan'),
      stTotal: $('stTotal'), stInduk: $('stInduk'), stAnak: $('stAnak'),
      stRentang: $('stRentang'), stHariIni: $('stHariIni'),
      toolbar: $('toolbar'), peringatanRentang: $('peringatanRentang'),
      ganttScroll: $('ganttScroll'), ganttInner: $('ganttInner'),
      ganttBadan: $('ganttBadan'), barisWadah: $('barisWadah'),
      overlayGaris: $('overlayGaris'), barisBulan: $('barisBulan'),
      barisHari: $('barisHari'), kosong: $('kosong'),
      btnTambah: $('btnTambah'), btnTambahKosong: $('btnTambahKosong'),
      btnContoh: $('btnContoh'), btnContohKosong: $('btnContohKosong'),
      btnReset: $('btnReset'), btnHariIni: $('btnHariIni'),
      btnKalender: $('btnKalender'),
      chkAkhirPekan: $('chkAkhirPekan'),
      stLibur: $('stLibur'),
      panahLayer: $('panahLayer'),
      tirai: $('tirai'), formTugas: $('formTugas'), judulModal: $('judulModal'),
      btnTutup: $('btnTutup'), btnBatal: $('btnBatal'), btnSimpan: $('btnSimpan'),
      fldNama: $('fldNama'), fldMulai: $('fldMulai'), fldDurasi: $('fldDurasi'),
      fldPrioritas: $('fldPrioritas'), fldWarna: $('fldWarna'), fldInduk: $('fldInduk'),
      catatanInduk: $('catatanInduk'), pratinjau: $('pratinjau'), swatch: $('swatch'),
      daftarPranala: $('daftarPranala'), btnTambahPranala: $('btnTambahPranala'),
      errPranala: $('errPranala'),
      tiraiKalender: $('tiraiKalender'), formKalender: $('formKalender'),
      btnTutupKalender: $('btnTutupKalender'), btnKalenderBatal: $('btnKalenderBatal'),
      btnKalenderReset: $('btnKalenderReset'), btnSimpanKalender: $('btnSimpanKalender'),
      hariOp: $('hariOp'), daftarLibur: $('daftarLibur'), btnTambahLibur: $('btnTambahLibur'),
      errAkhirPekan: $('errAkhirPekan'), errLibur: $('errLibur'),
      pratinjauKalender: $('pratinjauKalender'),
      toastWadah: $('toastWadah')
    };

    cekPenyimpanan();
    muatPref();
    muatKalender();   // harus sebelum muat() agar jadwalkanUlang memakai kalender tersimpan
    muat();
    el.chkAkhirPekan.checked = pref.sembunyikanAkhirPekan;
    renderSwatch();
    bind();
    render();

    setTimeout(function () { scrollKeHariIni(false); }, 60);
  }

  /* API untuk halaman uji */
  window.GanttApp = {
    tambah: tambahTugas,
    ubah: ubahTugas,
    hapus: hapusTugas,
    hapusSemua: hapusSemua,
    semua: semua,
    muat: muat,
    simpan: simpan,
    toggleCiut: toggleCiut,
    setPref: setPref,
    getPref: function () { return Object.assign({}, pref); },
    setKalender: setKalender,
    getKalender: getKalender,
    resetKalender: resetKalender,
    muatKalender: muatKalender,
    validasiKalender: validasiKalender,
    kalenderBawaan: kalenderBawaan,
    namaLibur: namaLibur,
    normalisasiPranala: normalisasiPranala,      mulaiTerlama: mulaiTerlama,
      jadwalkanUlang: jadwalkanUlang,
      majuHariKerja: majuHariKerja,
      jalurPanah: jalurPanah,
      renderPanah: function () { if (siapUI()) renderPanah(); return siapUI(); },
      sumberDaya: function () { return klona(sumberDaya); },
      tambahSumberDaya: tambahSumberDaya,
      ubahSumberDaya: ubahSumberDaya,
      hapusSumberDaya: hapusSumberDaya,
      muatSumberDaya: muatSumberDaya,
      normalisasiAlokasi: normalisasiAlokasi,
      validasi: validasi,
    akhirTugas: akhirTugas,
    bangunDaftar: bangunDaftar,
    kumpulKeturunan: kumpulKeturunan,
    siapkanTimeline: siapkanTimeline,
    daftarHariSemua: function () { return daftarHari.slice(); },
    cariIndeks: cariIndeks,
    parseTanggal: parseTanggal,
    keISO: keISO,
    tambahHari: tambahHari,
    isKerja: isKerja,
    tglPanjang: tglPanjang,
    tglPendek: tglPendek,
    escapeHtml: escapeHtml,
    hariIni: hariIni,
    dataContoh: dataContoh,
    ujiPenyimpanan: function () { return penyimpananOk; },
    initUI: initUI
  };

  if (document.getElementById('ganttScroll')) initUI();
})();
