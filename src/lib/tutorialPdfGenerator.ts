import { jsPDF } from 'jspdf';
import { ProjectConfig } from '../types';

/**
 * GENERATOR BUKU PANDUAN PENGGUNA (BERGAMBAR) — SIP VSS EDISI v4.0
 * Menghasilkan dokumen PDF 8 Halaman A4 lengkap dengan Simulasi Tampilan Layar (UI Mockup)
 * dan Lingkaran Petunjuk Klik (① ② ③ ④) untuk Operator Lapangan, Viewer, dan Admin.
 */
export function generateTutorialPdf(activeProject?: ProjectConfig): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182
  const totalPages = 8;

  const projectName = activeProject?.name || 'PROYEK TRANSMISI SUTT 150 kV / SUTET 500 kV';
  const projectCode = activeProject?.id ? activeProject.id.toUpperCase() : 'SIP-VSS-V4';
  const printedDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Helper: Header & Footer
  const drawPageChrome = (pageNum: number, sectionTitle: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 13, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('BUKU PANDUAN PENGGUNA BERGAMBAR — SIP VSS EDISI v4.0', margin, 8.2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(sectionTitle, pageWidth - margin, 8.2, { align: 'right' });

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Panduan Praktis Pengguna • ${projectName}`, margin, pageHeight - 7);
    doc.setFont('helvetica', 'bold');
    doc.text(`Halaman ${pageNum} dari ${totalPages}`, pageWidth - margin, pageHeight - 7, {
      align: 'right',
    });
  };

  // Helper: Section Banner
  const drawSectionBanner = (y: number, badge: string, title: string, subtitle: string): number => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 17, 2.5, 2.5, 'FD');

    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin + 3, y + 3, 28, 5.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text(badge.toUpperCase(), margin + 17, y + 6.8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 34, y + 7.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    doc.text(subtitle, margin + 3, y + 13.8);

    return y + 21;
  };

  // Helper: Red Callout Circle (1, 2, 3...)
  const drawCallout = (x: number, y: number, num: number) => {
    doc.setFillColor(225, 29, 72); // rose-600
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.circle(x, y, 3.1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(num), x, y + 1, { align: 'center' });
  };

  // Helper: Browser/Window Frame for Visual Screenshot
  const drawScreenWindow = (
    y: number,
    height: number,
    windowTitle: string,
    rightBadge?: string
  ) => {
    // Outer frame
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, height, 3, 3, 'FD');

    // Top bar
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, contentWidth, 8, 3, 3, 'F');
    doc.rect(margin, y + 4, contentWidth, 4, 'F');

    // Traffic dots
    doc.setFillColor(239, 68, 68);
    doc.circle(margin + 4.5, y + 4, 1.2, 'F');
    doc.setFillColor(245, 158, 11);
    doc.circle(margin + 8.5, y + 4, 1.2, 'F');
    doc.setFillColor(16, 185, 129);
    doc.circle(margin + 12.5, y + 4, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(226, 232, 240);
    doc.text(`TAMPILAN LAYAR: ${windowTitle.toUpperCase()}`, margin + 17, y + 5);

    if (rightBadge) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(rightBadge, pageWidth - margin - 4, y + 5, { align: 'right' });
    }
  };

  // Helper: Numbered Step Explanation Row
  const drawStepRow = (y: number, num: number, title: string, desc: string): number => {
    const descLines = doc.splitTextToSize(desc, contentWidth - 16);
    const boxH = 8 + descLines.length * 3.8;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, 'FD');

    drawCallout(margin + 5.5, y + 5.5, num);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 11, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(descLines, margin + 11, y + 9.8);

    return y + boxH + 2.5;
  };

  /* ==========================================================================
   * HALAMAN 1: SAMPUL & DAFTAR ISI BERGAMBAR
   * ========================================================================== */
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 88, 'F');

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 85, pageWidth, 3, 'F');

  // Badge Edisi
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin, 16, 68, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('EDISI PENGGUNA BERGAMBAR v4.0', margin + 34, 20.8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('BUKU PANDUAN PENGGUNA', margin, 36);
  doc.setFontSize(14);
  doc.setTextColor(147, 197, 253);
  doc.text('Dilengkapi Simulasi Layar & Petunjuk Klik Nomor (1, 2, 3)', margin, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    'Panduan praktis untuk Tim Lapangan, Operator, dan Admin dalam menggunakan seluruh menu',
    margin,
    54
  );
  doc.text(
    'Sistem Informasi Inventarisasi Tanah, Bangunan & Tanaman (SIP VSS).',
    margin,
    59
  );

  // Box Proyek
  doc.setFillColor(30, 41, 59);
  doc.setDrawColor(71, 85, 105);
  doc.roundedRect(margin, 65, contentWidth, 15, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`PROYEK AKTIF: ${projectName}`, margin + 4, 71.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Kode Proyek: ${projectCode}   |   Dicetak Tanggal: ${printedDate}`, margin + 4, 76.8);

  let y = 96;

  // Cara Membaca Buku Panduan Ini
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(253, 164, 175);
  doc.roundedRect(margin, y, contentWidth, 18, 2.5, 2.5, 'FD');
  drawCallout(margin + 7, y + 9, 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(159, 18, 57);
  doc.text('CARA MEMBACA PANDUAN BERGAMBAR INI:', margin + 13, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 19, 55);
  doc.text(
    'Setiap halaman menampilkan GAMBAR SIMULASI LAYAR APLIKASI. Perhatikan lingkaran merah bernomor (1, 2, 3)',
    margin + 13,
    y + 11.8
  );
  doc.text(
    'pada gambar layar, lalu baca urutan langkah sesuai nomor tersebut di bawah gambarnya.',
    margin + 13,
    y + 15.8
  );

  y += 24;

  // Daftar Isi Visual
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DAFTAR ISI PANDUAN PENGGUNA (8 HALAMAN)', margin, y);
  y += 4;

  const tocList = [
    [
      'Halaman 2',
      'Langkah Awal: Cara Login, Pilih Proyek, & Hubungkan Google Drive',
      'Pengenalan Sidebar Kiri & Peran Akun (Viewer, Operator, Admin)',
    ],
    [
      'Halaman 3',
      'Menu 1 & 1.1: Dashboard & Daftar Nominatif (Gabung, Pecah, Hapus)',
      'Gambar letak tombol Cari, Cetak, Gabung Bidang, Pecah Bidang & Hapus Bidang (n-1)',
    ],
    [
      'Halaman 4',
      'Menu 1.2 & 1.3: Peta Spasial (GIS) & Cetak Peta Bidang Tanah',
      'Gambar klik poligon, Rute Google Maps, Split-View Peta & Slider Rotasi Kompas 0-360°',
    ],
    [
      'Halaman 5',
      'Menu 1.4 & 1.5: Resume Kegiatan Desa (Wajib 4 Foto) & Surat Instansi',
      'Gambar form Resume Desa 4 foto dokumentasi & arsip otomatis folder Surat Instansi',
    ],
    [
      'Halaman 6',
      'Menu 2 (Bagian 1): Formulir Input Lahan 5 Tab & Simpan Cepat (Ctrl+S)',
      'Gambar navigasi 5 Tab Input Lahan (Identitas, Bangunan, Tanaman, Berkas, Ringkasan)',
    ],
    [
      'Halaman 7',
      'Menu 2 (Bagian 2): Ambil 7 Tanda Tangan & Cap Desa Resmi dari HP',
      'Gambar layar 7 kartu Tanda Tangan & Cap Desa via Kamera/Galeri HP untuk Form Inventarisasi',
    ],
    [
      'Halaman 8',
      'Menu 3, 3.1, 3.2, 4 & 5: Verifikasi QC, Sanding Data & Update Peta QGIS',
      'Gambar panel Approve/Reject QC, Sanding Peta/PDF ESDM, dan aturan 3 file GeoJSON',
    ],
  ];

  tocList.forEach(([hal, judul, sub]) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');

    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin + 3, y + 3, 22, 10, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(hal, margin + 14, y + 9.2, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(judul, margin + 28, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(100, 116, 139);
    doc.text(sub, margin + 28, y + 12.2);

    y += 18.5;
  });

  drawPageChrome(1, 'Sampul & Daftar Isi');

  /* ==========================================================================
   * HALAMAN 2: CARA LOGIN, SIDEBAR KIRI, & HUBUNGKAN GOOGLE
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(2, 'Bab 1 — Langkah Awal & Navigasi Sidebar');
  y = 18;
  y = drawSectionBanner(
    y,
    'Bab 1',
    'Cara Masuk (Login) & Mengenal Tombol di Sidebar Kiri',
    'Langkah pertama yang wajib dilakukan sebelum melihat peta atau menginput data lahan'
  );

  // VISUAL SCREENSHOT: SIDEBAR & LAYAR UTAMA
  drawScreenWindow(y, 78, 'Sidebar Navigasi Kiri & Tombol Koneksi Google', 'Tampilan Awal Aplikasi');

  // Left Mock Sidebar inside screen
  const sbX = margin + 4;
  const sbY = y + 11;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(sbX, sbY, 72, 63, 2, 2, 'F');

  // Project Selector Box
  doc.setFillColor(30, 41, 59);
  doc.setDrawColor(71, 85, 105);
  doc.roundedRect(sbX + 3, sbY + 3, 66, 11, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('PROYEK AKTIF SAAT INI:', sbX + 5, sbY + 6.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(252, 211, 77);
  doc.text('SUTET 500 kV / SUTT 150 kV  [v]', sbX + 5, sbY + 11.5);
  drawCallout(sbX + 64, sbY + 8.5, 1);

  // Menu List
  const menuMocks = [
    '1. Dashboard Utama',
    '1.1. Daftar Nominatif',
    '1.2. Peta Spasial (GIS)',
    '1.3. Peta Bidang Tanah',
    '2. Input & Edit Lahan',
  ];
  menuMocks.forEach((m, idx) => {
    const my = sbY + 16.5 + idx * 5.6;
    doc.setFillColor(idx === 0 ? 37 : 30, idx === 0 ? 99 : 41, idx === 0 ? 235 : 59);
    doc.roundedRect(sbX + 3, my, 66, 4.8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(m, sbX + 5, my + 3.3);
  });
  drawCallout(sbX + 64, sbY + 25, 2);

  // Connect Google Button
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(sbX + 3, sbY + 46, 66, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(255, 255, 255);
  doc.text('Hubungkan Google Drive & Sheets', sbX + 6, sbY + 50.5);
  drawCallout(sbX + 64, sbY + 49.5, 3);

  // Sync Button
  doc.setFillColor(51, 65, 85);
  doc.roundedRect(sbX + 3, sbY + 54.5, 66, 6.5, 1.5, 1.5, 'F');
  doc.setTextColor(226, 232, 240);
  doc.text('Sinkronisasi Data Master', sbX + 6, sbY + 58.8);
  drawCallout(sbX + 64, sbY + 57.8, 4);

  // Right Dashboard Preview inside screen
  const dbX = sbX + 76;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(dbX, sbY, contentWidth - 84, 63, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('RINGKASAN DASHBOARD PROYEK', dbX + 4, sbY + 7);

  // Mini KPI Cards
  const kpis = [
    ['Total Bidang', '245 Bidang'],
    ['Sudah Terinput', '198 Bidang'],
    ['Terverifikasi QC', '164 Bidang'],
  ];
  kpis.forEach(([lbl, val], idx) => {
    const kx = dbX + 4 + idx * 30.5;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(kx, sbY + 11, 28.5, 16, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(lbl, kx + 2, sbY + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(37, 99, 235);
    doc.text(val, kx + 2, sbY + 23);
  });

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(dbX + 4, sbY + 31, contentWidth - 92, 28, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 64, 175);
  doc.text('Grafik Progres per Desa & Span Tower + Kelengkapan 4 Berkas Digital', dbX + 8, sbY + 46);

  y += 83;

  // Steps Explanation
  y = drawStepRow(
    y,
    1,
    'Pilih Jalur Proyek di Pojok Kiri Atas',
    'Klik kotak Pilihan Proyek di bagian paling atas menu kiri. Pastikan Anda memilih jalur SUTT/SUTET yang sesuai dengan lokasi kerja Anda sebelum mulai bekerja.'
  );
  y = drawStepRow(
    y,
    2,
    'Daftar Menu Kerja (Urut Nomor 1 sampai 5)',
    'Klik nama menu di sidebar kiri untuk berpindah halaman: mulai dari Daftar Nominatif (1.1), Peta Spasial GIS (1.2), Peta Bidang Tanah (1.3), hingga Input & Edit Lahan (Menu 2).'
  );
  y = drawStepRow(
    y,
    3,
    'WAJIB: Klik Tombol Hijau "Hubungkan Google Drive & Sheets"',
    'Saat Anda ingin menyimpan data warga, memotret tanda tangan dari HP, mengunggah foto KTP/lokasi, atau melakukan Gabung/Pecah/Hapus bidang, klik tombol ini sekali dan pilih akun Google Anda.'
  );
  y = drawStepRow(
    y,
    4,
    'Klik "Sinkronisasi Data Master" untuk Menarik Data Terbaru',
    'Jika rekan kerja Anda baru saja menginput data dari HP atau laptop lain, klik tombol ini agar daftar bidang di layar Anda langsung ikut diperbarui.'
  );

  /* ==========================================================================
   * HALAMAN 3: MENU 1.1 DAFTAR NOMINATIF (GABUNG, PECAH, HAPUS BIDANG)
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(3, 'Bab 2 — Menu 1.1 Daftar Nominatif');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 1.1',
    'Cara Menggunakan Daftar Nominatif (Cari, Cetak, Gabung, Pecah & Hapus)',
    'Halaman utama untuk mencari data warga, mencetak tabel resmi, dan memodifikasi nomor bidang'
  );

  // VISUAL SCREENSHOT: DAFTAR NOMINATIF
  drawScreenWindow(y, 74, 'Menu 1.1 — Daftar Nominatif & Toolbar Aksi Bidang', 'Tabel Data Master');

  const dnY = y + 11;
  // Search & Filter Bar
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + 4, dnY, 68, 9, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Cari Nama / No. Bidang / Desa...', margin + 7, dnY + 5.6);
  drawCallout(margin + 67, dnY + 4.5, 1);

  // Action Buttons: Gabung, Pecah, Hapus, Cetak
  // Gabung
  doc.setFillColor(79, 70, 229);
  doc.roundedRect(margin + 75, dnY, 25, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(255, 255, 255);
  doc.text('Gabung', margin + 84, dnY + 5.6, { align: 'center' });
  drawCallout(margin + 96.5, dnY + 4.5, 2);

  // Pecah
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(margin + 102, dnY, 25, 9, 1.5, 1.5, 'F');
  doc.text('Pecah', margin + 111, dnY + 5.6, { align: 'center' });
  drawCallout(margin + 123.5, dnY + 4.5, 3);

  // Hapus
  doc.setFillColor(225, 29, 72);
  doc.roundedRect(margin + 129, dnY, 25, 9, 1.5, 1.5, 'F');
  doc.text('Hapus', margin + 138, dnY + 5.6, { align: 'center' });
  drawCallout(margin + 150.5, dnY + 4.5, 4);

  // Cetak
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(margin + 156, dnY, 22, 9, 1.5, 1.5, 'F');
  doc.text('Cetak', margin + 164, dnY + 5.6, { align: 'center' });
  drawCallout(margin + 174.5, dnY + 4.5, 5);

  // Table Header
  const tbY = dnY + 13;
  doc.setFillColor(30, 41, 59);
  doc.rect(margin + 4, tbY, contentWidth - 8, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(255, 255, 255);
  doc.text('No. Bidang', margin + 7, tbY + 5.2);
  doc.text('Span Tower', margin + 28, tbY + 5.2);
  doc.text('Nama Pemilik Lahan', margin + 55, tbY + 5.2);
  doc.text('Desa', margin + 102, tbY + 5.2);
  doc.text('Luas (m2)', margin + 128, tbY + 5.2);
  doc.text('Tombol Aksi Baris', margin + 150, tbY + 5.2);

  // Table Rows
  const sampleRows = [
    ['011', 'T.01 - T.02', 'SUHERMAN BIN H. BASRI', 'SUKAMAJU', '320,00'],
    ['012', 'T.01 - T.02', 'H. AHMAD SUBANDI', 'SUKAMAJU', '450,00'],
    ['013', 'T.01 - T.02', 'WAWAN SETIAWAN', 'SUKAMAJU', '280,00'],
  ];
  sampleRows.forEach((r, idx) => {
    const ry = tbY + 8 + idx * 11;
    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin + 4, ry, contentWidth - 8, 11, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(29, 78, 216);
    doc.text(r[0], margin + 7, ry + 6.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(r[1], margin + 28, ry + 6.8);
    doc.setFont('helvetica', 'bold');
    doc.text(r[2], margin + 55, ry + 6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(r[3], margin + 102, ry + 6.8);
    doc.text(r[4], margin + 128, ry + 6.8);

    // Edit & Lihat Peta mini buttons
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(margin + 148, ry + 2.5, 11, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(29, 78, 216);
    doc.text('Edit', margin + 153.5, ry + 6.5, { align: 'center' });

    doc.setFillColor(209, 250, 229);
    doc.roundedRect(margin + 160.5, ry + 2.5, 14, 6, 1, 1, 'F');
    doc.setTextColor(4, 120, 87);
    doc.text('Peta', margin + 167.5, ry + 6.5, { align: 'center' });
  });
  drawCallout(margin + 175, tbY + 24, 6);

  y += 79;

  y = drawStepRow(
    y,
    1,
    'Kotak Pencarian & Filter Span / Desa',
    'Ketik nama warga atau nomor bidang (contoh: 012) untuk mencari cepat, atau gunakan filter Span Tower dan Desa di sebelahnya.'
  );
  y = drawStepRow(
    y,
    2,
    'Tombol "Gabung Bidang" (Menyatukan Beberapa Bidang)',
    'Klik tombol ini jika 2 atau lebih bidang tanah dimiliki orang yang sama dan ingin disatukan. Pilih 1 Bidang Induk, centang bidang lain yang akan digabung, lalu klik Proses. Luas tanah, jumlah pohon, dan bangunan otomatis dijumlahkan ke Bidang Induk dan tersimpan ke Google Sheets.'
  );
  y = drawStepRow(
    y,
    3,
    'Tombol "Pecah Bidang" (Membagi 1 Bidang Menjadi 012A, 012B, dst.)',
    'Klik jika 1 bidang tanah terbagi menjadi beberapa pemilik/ahli waris. Pilih bidang asal, masukkan jumlah pecahan, lalu bagi luas m2 untuk masing-masing pecahan.'
  );
  y = drawStepRow(
    y,
    4,
    'Tombol "Hapus Bidang" (Otomatis Menggeser Nomor Urut n-1)',
    'Klik untuk menghapus bidang yang batal/ganda. Nomor bidang urut setelahnya di Span yang sama akan otomatis bergeser mundur 1 angka (misal: No. 015 dihapus -> No. 016 otomatis turun menjadi 015) dengan tetap menjaga format nol di depan.'
  );
  y = drawStepRow(
    y,
    5,
    'Tombol "Cetak / Excel" & (6) Tombol "Edit / Peta" di Setiap Baris',
    'Klik Cetak/Excel (5) untuk mengunduh tabel resmi ber-KOP atau file Excel. Klik tombol Edit atau Peta (6) di sebelah kanan baris warga untuk langsung mengedit formulirnya atau melompat ke titik petanya.'
  );

  /* ==========================================================================
   * HALAMAN 4: MENU 1.2 (PETA GIS) & MENU 1.3 (PETA BIDANG TANAH)
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(4, 'Bab 3 — Menu 1.2 Peta Spasial GIS & Menu 1.3 Peta Bidang Tanah');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 1.2 & 1.3',
    'Cara Memakai Peta Spasial (GIS) & Mencetak Peta Bidang Tanah',
    'Navigasi poligon di lapangan serta pencetakan Peta Bidang Tanah per Span & Desa'
  );

  // VISUAL SCREENSHOT: MENU 1.2 & 1.3
  drawScreenWindow(
    y,
    76,
    'Atas: Menu 1.2 Peta GIS Interaktif  |  Bawah: Menu 1.3 Peta Bidang Tanah Siap Cetak',
    '2 Mode Peta Spasial'
  );

  const mpY = y + 11;
  // Top Half: Menu 1.2 GIS Map
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin + 4, mpY, contentWidth - 8, 28, 2, 2, 'F');

  // Layer Switch
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 7, mpY + 3, 62, 6, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(15, 23, 42);
  doc.text('[v] Bidang   [v] Jalur ROW   [v] Tower', margin + 9, mpY + 7);
  drawCallout(margin + 72, mpY + 6, 1);

  // Polygons in center
  doc.setFillColor(16, 185, 129);
  doc.setDrawColor(167, 243, 208);
  doc.rect(margin + 22, mpY + 12, 26, 12, 'FD');
  doc.setTextColor(255, 255, 255);
  doc.text('011 - SUHERMAN', margin + 35, mpY + 19, { align: 'center' });

  doc.setFillColor(37, 99, 235);
  doc.setDrawColor(253, 224, 71);
  doc.rect(margin + 52, mpY + 11, 30, 14, 'FD');
  doc.text('012 - H. AHMAD', margin + 67, mpY + 19, { align: 'center' });
  drawCallout(margin + 83, mpY + 13, 2);

  // Popup Card on Right of GIS Map
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 96, mpY + 4, 78, 20, 1.5, 1.5, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(6.5);
  doc.text('BIDANG 012 • H. AHMAD SUBANDI (450 m2)', margin + 99, mpY + 9.5);
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(margin + 99, mpY + 13, 28, 7, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Rute Google Maps', margin + 113, mpY + 17.5, { align: 'center' });
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(margin + 130, mpY + 13, 26, 7, 1, 1, 'F');
  doc.text('Lihat Berkas', margin + 143, mpY + 17.5, { align: 'center' });
  drawCallout(margin + 164, mpY + 16.5, 3);

  // Bottom Half: Menu 1.3 Peta Bidang Tanah Split-View
  const pbY = mpY + 32;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + 4, pbY, contentWidth - 8, 29, 2, 2, 'FD');

  // Top Controls of 1.3
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin + 7, pbY + 2.5, 52, 6, 1, 1, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(6);
  doc.text('Span: T.01-T.02 | Desa: SUKAMAJU', margin + 9, pbY + 6.5);
  drawCallout(margin + 62, pbY + 5.5, 4);

  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin + 70, pbY + 2.5, 54, 6, 1, 1, 'F');
  doc.setTextColor(146, 64, 14);
  doc.text('Rotasi Kompas: 0° ----(o)---- 360°', margin + 73, pbY + 6.5);
  drawCallout(margin + 127, pbY + 5.5, 5);

  doc.setFillColor(37, 99, 235);
  doc.roundedRect(margin + 135, pbY + 2.5, 38, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Cetak PDF Peta Bidang', margin + 154, pbY + 6.5, { align: 'center' });
  drawCallout(margin + 174, pbY + 5.5, 6);

  // 3 Split Panels
  const pLabels = [
    '1. Peta Kartografi Teknis',
    '2. Citra Satelit + Poligon',
    '3. Tabel Nominatif & Kompas',
  ];
  pLabels.forEach((pl, idx) => {
    const px = margin + 7 + idx * 56.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(px, pbY + 11, 53.5, 15, 1.5, 1.5, 'FD');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(6.2);
    doc.text(pl, px + 26.7, pbY + 19.5, { align: 'center' });
  });

  y += 81;

  y = drawStepRow(
    y,
    1,
    'Menu 1.2 — Pilih Layer Peta (Bidang Tanah, Jalur ROW, Titik Tower)',
    'Centang layer yang ingin Anda lihat di layar dan pilih jenis peta dasar (Satelit atau Peta Jalan).'
  );
  y = drawStepRow(
    y,
    2,
    'Menu 1.2 — Klik Poligon Bidang Tanah di Peta',
    'Nomor bidang dan nama warga tampil tepat di tengah poligon tanah. Klik poligon mana saja untuk membuka kartu rincian pemiliknya.'
  );
  y = drawStepRow(
    y,
    3,
    'Menu 1.2 — Klik "Rute Google Maps" atau "Lihat Berkas"',
    'Dari kartu yang muncul di peta, klik Rute Google Maps untuk memandu arah perjalanan ke lokasi bidang, atau klik Lihat Berkas untuk membuka KTP dan foto lahan.'
  );
  y = drawStepRow(
    y,
    4,
    'Menu 1.3 — Pilih Span Tower & Desa yang Ingin Dicetak',
    'Pada Menu 1.3 Peta Bidang Tanah, pilih Span Tower dan Desa. Layar otomatis menampilkan Peta Kartografi, Peta Satelit, dan Tabel Nominatif khusus Span & Desa tersebut.'
  );
  y = drawStepRow(
    y,
    5,
    'Menu 1.3 — Putar Kemiringan Jalur dengan Slider Rotasi (0° s/d 360°) & (6) Cetak PDF',
    'Geser slider Rotasi (5) agar koridor jalur yang miring menjadi lurus mendatar mengikuti kertas cetak (arah panah Utara kompas otomatis ikut berputar). Lalu klik Cetak PDF Peta Bidang (6).'
  );

  /* ==========================================================================
   * HALAMAN 5: MENU 1.4 (RESUME PROJECT) & MENU 1.5 (SURAT INSTANSI)
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(5, 'Bab 4 — Menu 1.4 Resume Project & Menu 1.5 Surat Instansi');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 1.4 & 1.5',
    'Cara Mengisi Resume Kegiatan Desa (Wajib 4 Foto) & Surat Instansi',
    'Pelaporan tahapan kegiatan per Desa dan pengarsipan surat lintas instansi otomatis ke Google Drive'
  );

  // VISUAL SCREENSHOT: RESUME PROJECT 4 FOTO
  drawScreenWindow(
    y,
    74,
    'Menu 1.4 — Form Kegiatan Desa (Wajib Minimal 4 Foto Dokumentasi)',
    'Auto-Folder Google Drive'
  );

  const rpY = y + 11;
  // Form Fields
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + 4, rpY, 84, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('NAMA DESA / KELURAHAN:', margin + 7, rpY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DESA SUKAMAJU', margin + 7, rpY + 9.5);
  drawCallout(margin + 82, rpY + 6, 1);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 92, rpY, 86, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('TAHAPAN KEGIATAN DESA:', margin + 95, rpY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Sosialisasi & Penyuluhan Warga  [v]', margin + 95, rpY + 9.5);
  drawCallout(margin + 172, rpY + 6, 2);

  // 4 Photo Grid Box
  const phY = rpY + 15;
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(252, 211, 77);
  doc.roundedRect(margin + 4, phY, contentWidth - 8, 30, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(146, 64, 14);
  doc.text('UNGGAH FOTO DOKUMENTASI KEGIATAN (WAJIB MINIMAL 4 FOTO):', margin + 8, phY + 6);
  drawCallout(margin + 104, phY + 4.8, 3);

  for (let i = 0; i < 4; i++) {
    const px = margin + 8 + i * 42;
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(110, 231, 183);
    doc.roundedRect(px, phY + 9, 39, 17, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(4, 120, 87);
    doc.text(`[v] Foto Kegiatan #${i + 1}`, px + 19.5, phY + 18.5, { align: 'center' });
  }

  // Save Bar
  const svY = phY + 33;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Otomatis membuat folder di Google Drive:  / DESA SUKAMAJU / Sosialisasi & Penyuluhan Warga /',
    margin + 6,
    svY + 5.5
  );
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(margin + 132, svY, 46, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('Simpan Resume Desa', margin + 155, svY + 5.8, { align: 'center' });
  drawCallout(margin + 174, svY + 4.5, 4);

  y += 79;

  y = drawStepRow(
    y,
    1,
    'Menu 1.4 — Pilih atau Ketik Nama Desa',
    'Buka Menu 1.4 Resume Project, lalu pilih Desa yang sedang dilaksanakan kegiatan. Aplikasi otomatis menyiapkan folder Google Drive dengan nama Desa tersebut.'
  );
  y = drawStepRow(
    y,
    2,
    'Menu 1.4 — Pilih Tahapan Kegiatan (Sosialisasi, Inventarisasi, Musyawarah, dll.)',
    'Pilih jenis tahapan kegiatan, tanggal pelaksanaan, serta statusnya (Belum Mulai, Sedang Berjalan, atau Selesai).'
  );
  y = drawStepRow(
    y,
    3,
    'Menu 1.4 — Unggah Minimal 4 Foto Dokumentasi Kegiatan & Berita Acara',
    'Anda wajib memilih minimal 4 foto dokumentasi kegiatan lapangan (bisa lebih dari 4 foto) agar tombol simpan dapat memproses laporan kegiatan desa tersebut.'
  );
  y = drawStepRow(
    y,
    4,
    'Klik "Simpan Resume Desa" & Cara Pakai Menu 1.5 (Surat Instansi)',
    'Klik Simpan (4) untuk mengunggah seluruh foto ke sub-folder <Nama Desa>/<Nama Kegiatan>. Untuk mengarsipkan surat keluar/masuk (Pemda, BPN, Kehutanan, Desa), buka Menu 1.5 Surat Instansi -> isi Nomor Surat & Nama Instansi -> upload file surat. File otomatis masuk ke folder <Nama Instansi>.'
  );

  /* ==========================================================================
   * HALAMAN 6: MENU 2 (BAGIAN 1) — FORMULIR INPUT 5 TAB & STRUKTUR FOLDER
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(6, 'Bab 5 (Bagian 1) — Menu 2 Input & Edit Lahan (5 Tab)');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 2 (Bagian 1)',
    'Cara Mengisi Formulir Input & Edit Lahan (5 Tab Berurutan)',
    'Panduan pengisian identitas pemilik, bangunan, tanaman, berkas digital, dan simpan cepat Ctrl+S'
  );

  // VISUAL SCREENSHOT: 5 TABS FORM INPUT
  drawScreenWindow(
    y,
    72,
    'Menu 2 — Formulir Input & Edit Lahan (5 Tab + Pintasan Keyboard Ctrl + S)',
    'Auto-Uppercase'
  );

  const fiY = y + 11;
  const tabNames = [
    ['1. Identitas & Lokasi', true],
    ['2. Bangunan', false],
    ['3. Tanaman', false],
    ['4. Berkas & TTD HP', false],
    ['5. Ringkasan', false],
  ] as const;

  tabNames.forEach(([tName, active], idx) => {
    const tx = margin + 4 + idx * 35;
    doc.setFillColor(active ? 37 : 226, active ? 99 : 232, active ? 235 : 240);
    doc.roundedRect(tx, fiY, 33.5, 8.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(active ? 255 : 51, active ? 255 : 65, active ? 255 : 85);
    doc.text(tName, tx + 16.7, fiY + 5.3, { align: 'center' });
    drawCallout(tx + 30.5, fiY + 2, idx + 1);
  });

  // Mock Fields inside Tab 1
  const mfY = fiY + 12;
  const mockFields = [
    ['NO. BIDANG', '012'],
    ['SPAN TOWER', 'T.01 - T.02'],
    ['DESA / KELURAHAN', 'SUKAMAJU'],
    ['NAMA PEMILIK LAHAN', 'H. AHMAD SUBANDI'],
    ['ALAS HAK & LUAS (m2)', 'SHM No. 412  •  450,00 m2'],
    ['SAKSI 1, SAKSI 2 & KADES', 'BUDI (Saksi 1), DEDI (Saksi 2), H. KARMA (Kades)'],
  ];
  mockFields.forEach(([lbl, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const fx = margin + 4 + col * 88;
    const fy = mfY + row * 14.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(fx, fy, 86, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(lbl, fx + 3, fy + 4.3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(val, fx + 3, fy + 9.5);
  });

  y += 77;

  y = drawStepRow(
    y,
    1,
    'Tab 1 (Identitas & Lokasi) — Isi Data Pemilik, Saksi & Kepala Desa',
    'Ketik No. Bidang, Span Tower, Desa, Nama Pemilik, NIK, Alas Hak, Luas m2, serta Nama Saksi 1, Saksi 2, Tim Pelaksana 1 & 2, dan Kepala Desa. Seluruh huruf otomatis diubah menjadi HURUF KAPITAL rapi.'
  );
  y = drawStepRow(
    y,
    2,
    'Tab 2 (Bangunan & Benda Lain) — Tambah Item Bangunan Terdampak',
    'Klik tombol "+ Tambah Bangunan" jika terdapat bangunan rumah, teras, pagar, pondasi, atau sumur di bawah jalur transmisi.'
  );
  y = drawStepRow(
    y,
    3,
    'Tab 3 (Tanaman) — Input Jumlah Pohon Kecil, Sedang & Besar',
    'Klik "+ Tambah Tanaman", ketik nama pohon/tanaman produktif, lalu isi jumlah batangnya pada kolom ukuran Kecil, Sedang, dan Besar.'
  );
  y = drawStepRow(
    y,
    4,
    'Tab 4 (Berkas Digital & TTD HP) — Otomatis Masuk ke 4 Sub-Folder Google Drive',
    'Unggah file scan/foto pada 4 kategori berkas (1. Form Inventarisasi, 2. Identitas & Alas Hak, 3. Foto Lapangan, 4. Berita Acara). Aplikasi otomatis membuatkan ke-4 sub-folder tersebut di dalam folder bidang warga!'
  );
  y = drawStepRow(
    y,
    5,
    'Tab 5 (Ringkasan & Simpan) — Bisa Tekan Tombol Keyboard Ctrl + S Kapan Saja',
    'Periksa kembali rangkuman data warga lalu klik Simpan Data Lahan (atau tekan Ctrl + S di keyboard untuk menyimpan cepat dari tab mana saja).'
  );

  /* ==========================================================================
   * HALAMAN 7: MENU 2 (BAGIAN 2) — TANDA TANGAN & CAP DESA RESMI DARI HP
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(7, 'Bab 5 (Bagian 2) — 7 Tanda Tangan & Cap Desa Resmi via HP');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 2 (Bagian 2)',
    'Cara Mengambil 7 Tanda Tangan & Cap Desa Resmi Langsung dari HP',
    'Fitur pengesahan Form Inventarisasi: memotret tanda tangan fisik & stempel desa di lapangan'
  );

  // VISUAL SCREENSHOT: PERSIS SEPERTI GAMBAR SCREENSHOT USER (7 PENGESAHAN FORM INVENTARISASI)
  drawScreenWindow(
    y,
    92,
    'Tanda Tangan & Cap Desa Resmi (7 Pengesahan Form Inventarisasi)',
    'Kamera / Galeri HP'
  );

  const sgY = y + 11;
  // Header inside mockup
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Tanda Tangan & Cap Desa Resmi (7 Pengesahan Form Inventarisasi)', margin + 6, sgY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Ambil foto tanda tangan fisik secara langsung dari kamera HP atau unggah gambar dari penyimpanan perangkat.',
    margin + 6,
    sgY + 8
  );

  // Pill Kamera / Galeri HP
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(252, 211, 77);
  doc.roundedRect(pageWidth - margin - 34, sgY + 1, 29, 6, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(180, 83, 9);
  doc.text('Kamera / Galeri HP', pageWidth - margin - 19.5, sgY + 4.8, { align: 'center' });

  // Draw 6 Signature Cards (2 rows x 3 cols) + Cap Desa indicator
  const sigCards = [
    ['TANDA TANGAN PEMILIK LAHAN', 'H. AHMAD SUBANDI', 'Sudah Ada'],
    ['TANDA TANGAN SAKSI 1', 'BUDI SANTOSO', 'Belum Ada'],
    ['TANDA TANGAN SAKSI 2', 'DEDI KURNIAWAN', 'Belum Ada'],
    ['TANDA TANGAN TIM PELAKSANA 1', 'IRFAN HAKIM', 'Belum Ada'],
    ['TANDA TANGAN TIM PELAKSANA 2', 'RENDI PRATAMA', 'Belum Ada'],
    ['CAP / STEMPEL RESMI & KADES', 'Pemerintah Desa Sukamaju', 'Stempel Desa'],
  ];

  sigCards.forEach(([cTitle, cSub, cBadge], idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = margin + 5 + col * 58;
    const cy = sgY + 11 + row * 33;

    const isCap = idx === 5;
    doc.setFillColor(isCap ? 250 : 255, isCap ? 245 : 255, isCap ? 255 : 255);
    doc.setDrawColor(isCap ? 216 : 203, isCap ? 180 : 213, isCap ? 254 : 225);
    doc.roundedRect(cx, cy, 55, 30, 2, 2, 'FD');

    // Title & status badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(30, 41, 59);
    doc.text(cTitle, cx + 2.5, cy + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(cSub, cx + 2.5, cy + 8.3);

    // Dashed Upload Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cx + 2.5, cy + 10, 50, 11, 1.5, 1.5, 'FD');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Klik untuk Ambil dari HP', cx + 27.5, cy + 16.5, { align: 'center' });

    // Orange Button "Ambil dari HP"
    doc.setFillColor(245, 158, 11); // amber-500 orange button matching screenshot
    doc.roundedRect(cx + 2.5, cy + 22.5, 50, 5.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text('Ambil dari HP', cx + 27.5, cy + 26.2, { align: 'center' });

    if (idx === 0) drawCallout(cx + 51, cy + 7, 1);
    if (idx === 1) drawCallout(cx + 51, cy + 25, 2);
    if (idx === 5) drawCallout(cx + 51, cy + 15, 3);
  });

  y += 97;

  y = drawStepRow(
    y,
    1,
    'Kenapa Tertulis "Nama Pemilik / Saksi Belum Diisi"?',
    'Nama pada ke-6 kartu tanda tangan diambil otomatis dari isian teks di Tab 1. Pastikan Anda sudah mengetik Nama Pemilik, Nama Saksi 1 & 2, Nama Tim Pelaksana 1 & 2, dan Nama Kepala Desa agar namanya muncul otomatis di kartu ini.'
  );
  y = drawStepRow(
    y,
    2,
    'Cara Pakai Tombol Oranye "Ambil dari HP"',
    'Klik tombol oranye "Ambil dari HP" (atau kotak garis putus-putus di atasnya). Jika Anda membuka aplikasi lewat HP di lapangan, kamera HP bisa langsung memotret tanda tangan warga di atas kertas putih, atau memilih foto dari Galeri.'
  );
  y = drawStepRow(
    y,
    3,
    'Kartu Ke-7: Cap / Stempel Resmi Desa & Hasil Cetak PDF',
    'Gunakan kotak paling akhir (ungu) untuk memotret atau mengunggah Stempel/Cap Resmi Pemerintah Desa. Ketujuh foto pengesahan ini akan otomatis menempel rapi di bagian bawah saat Anda mencetak Form Inventarisasi PDF!'
  );

  /* ==========================================================================
   * HALAMAN 8: MENU 3, 3.1, 3.2, 4, 5 & UPDATE PETA DARI QGIS DESKTOP
   * ========================================================================== */
  doc.addPage();
  drawPageChrome(8, 'Bab 6 & 7 — Verifikasi QC, Sanding Data & Update Peta QGIS');
  y = 18;
  y = drawSectionBanner(
    y,
    'Menu 3, 4 & 5',
    'Verifikasi QC, Sanding Peta/ESDM & Cara Update Peta lewat QGIS',
    'Pemeriksaan kualitas data, audit selisih otomatis, dan sinkronisasi 3 file GeoJSON di Google Drive'
  );

  // VISUAL SCREENSHOT: QC + SANDING + FOLDER GEOJSON
  drawScreenWindow(
    y,
    68,
    'Kiri: Menu 3 QC & Sanding Data  |  Kanan: Menu 5 Folder Peta GeoJSON & QGIS',
    'Kontrol Mutu & Peta'
  );

  const qY = y + 11;
  // Left Box: QC & Sanding
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + 4, qY, 85, 53, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('MENU 3 — VERIFIKASI & QC', margin + 7, qY + 6);
  drawCallout(margin + 83, qY + 5, 1);

  doc.setFillColor(5, 150, 105);
  doc.roundedRect(margin + 7, qY + 9, 36, 7, 1, 1, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('Setujui (APPROVED)', margin + 25, qY + 13.5, { align: 'center' });

  doc.setFillColor(225, 29, 72);
  doc.roundedRect(margin + 46, qY + 9, 36, 7, 1, 1, 'F');
  doc.text('Revisi (REJECTED)', margin + 64, qY + 13.5, { align: 'center' });

  // Sanding 3.1 & 3.2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('MENU 3.1 & 3.2 — SANDING PETA & PDF ESDM', margin + 7, qY + 23);
  drawCallout(margin + 83, qY + 22, 2);

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin + 7, qY + 26, 78, 10, 1, 1, 'F');
  doc.setFontSize(6);
  doc.setTextColor(4, 120, 87);
  doc.text('[MATCH] Bidang 012: Peta, Input & PDF ESDM Cocok', margin + 10, qY + 32);

  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin + 7, qY + 38, 78, 10, 1, 1, 'F');
  doc.setTextColor(180, 83, 9);
  doc.text('[SELISIH] Bidang 014: Ada di Peta, Belum Diinput', margin + 10, qY + 44);

  // Right Box: Menu 5 & QGIS GeoJSON Folder
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin + 93, qY, 85, 53, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(252, 211, 77);
  doc.text('MENU 5 — 1 FOLDER DRIVE PETA GEOJSON', margin + 97, qY + 6.5);
  drawCallout(margin + 172, qY + 5.5, 3);

  const gFiles = [
    ['BIDANG_SUTET.geojson', 'Poligon Bidang Tanah'],
    ['TOWER_SUTET.geojson', 'Titik Koordinat Tower'],
    ['JALUR_SUTET.geojson', 'Garis Koridor ROW'],
  ];
  gFiles.forEach(([fn, fd], idx) => {
    const gy = qY + 11 + idx * 13;
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(71, 85, 105);
    doc.roundedRect(margin + 97, gy, 77, 10.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(52, 211, 153);
    doc.text(fn, margin + 100, gy + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(203, 213, 225);
    doc.text(fd, margin + 100, gy + 8.5);
  });
  drawCallout(margin + 172, qY + 44, 4);

  y += 73;

  y = drawStepRow(
    y,
    1,
    'Menu 3 (Verifikasi & QC) & Menu 4 (Log Aktivitas)',
    'Admin memeriksa kelengkapan berkas warga di Menu 3: klik APPROVED jika sudah lengkap, atau tulis catatan perbaikan lalu klik REJECTED. Seluruh riwayat pengeditan dapat dipantau di Menu 4 Log Aktivitas.'
  );
  y = drawStepRow(
    y,
    2,
    'Menu 3.1 (Sanding Peta vs Input) & Menu 3.2 (Sanding PDF ESDM vs Input)',
    'Buka Menu 3.1 untuk mendeteksi bidang yang gambarnya sudah ada di peta tapi belum diinput. Buka Menu 3.2 lalu unggah file PDF Pengumuman ESDM untuk mencocokkan ejaan Nama & Luas m2 secara otomatis.'
  );
  y = drawStepRow(
    y,
    3,
    'Menu 5 (Manajemen Proyek) & Komparasi Cache vs Master',
    'Di Menu 5, Admin cukup menempelkan 1 ID Folder Google Drive Peta. Jika jumlah baris di aplikasi terasa berbeda dengan Google Sheets, buka menu Komparasi Cache vs Master di kiri bawah lalu klik Paksa Sinkronisasi.'
  );
  y = drawStepRow(
    y,
    4,
    'Cara Mengedit Poligon Peta lewat Aplikasi QGIS Desktop',
    '1) Edit batas poligon di QGIS Desktop -> 2) Klik kanan layer -> Export -> Save Features As -> pilih format GeoJSON dengan CRS EPSG:4326 (WGS 84) -> 3) Beri awalan nama BIDANG_, TOWER_, atau JALUR_ -> 4) Upload ke Folder Google Drive Peta lalu klik tombol Refresh Peta di aplikasi.'
  );

  // Simpan PDF
  const safeCode = projectCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Buku_Panduan_Pengguna_Bergambar_SIP_VSS_v4.0_${safeCode}.pdf`);
}
