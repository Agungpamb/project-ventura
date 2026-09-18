import { jsPDF } from 'jspdf';
import { SURVEYOR_BASE64, IDSURVEY_BASE64, DANANTARA_BASE64 } from './embeddedLogos';

export interface TutorialPDFOptions {
  projectName?: string;
  generatedBy?: string;
}

export function generateTutorialPDF(options: TutorialPDFOptions = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  const totalPages = 5;

  // Colors definition
  const navy = [15, 23, 42]; // #0f172a
  const slate = [51, 65, 85]; // #334155
  const muted = [100, 116, 139]; // #64748b
  const lightBg = [248, 250, 252]; // #f8fafc
  const cardBorder = [226, 232, 240]; // #e2e8f0
  const emerald = [16, 185, 129]; // #10b981
  const amber = [245, 158, 11]; // #f59e0b
  const blue = [37, 99, 235]; // #2563eb
  const rose = [239, 68, 68]; // #ef4444

  const addHeaderFooter = (pageNumber: number, title: string) => {
    // Header
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, 0, pageWidth, 12, 'F');
    
    // Header Accent Line
    doc.setFillColor(amber[0], amber[1], amber[2]);
    doc.rect(0, 12, pageWidth, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('SISTEM INFORMASI PERTANAHAN (SIP - VENTURA / VSS)', margin, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(title, pageWidth - margin, 8, { align: 'right' });

    // Footer
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text('Dokumen Resmi Panduan Operasional & Teknis - PT Surveyor Indonesia / Ventura Sistem', margin, pageHeight - 9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Halaman ${pageNumber} dari ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  };

  // ==========================================
  // PAGE 1: COVER & MATRIKS PERAN PENGGUNA
  // ==========================================
  
  // Decorative Background Card for Cover
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, 20, contentWidth, 58, 4, 4, 'F');
  doc.setDrawColor(amber[0], amber[1], amber[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, 20, contentWidth, 58, 4, 4, 'S');

  // Add logos if available
  try {
    if (SURVEYOR_BASE64) {
      doc.addImage(SURVEYOR_BASE64, 'JPEG', margin + 6, 25, 28, 14);
    }
    if (IDSURVEY_BASE64) {
      doc.addImage(IDSURVEY_BASE64, 'JPEG', margin + 38, 25, 24, 14);
    }
    if (DANANTARA_BASE64) {
      doc.addImage(DANANTARA_BASE64, 'JPEG', pageWidth - margin - 32, 25, 26, 14);
    }
  } catch (e) {
    // Graceful fallback if logo fails
  }

  // Cover Main Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('BUKU PANDUAN PENGGUNA SISTEM (USER MANUAL)', margin + 6, 48);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(amber[0], amber[1], amber[2]);
  doc.text('SISTEM INFORMASI PERTANAHAN & INVENTARISASI JALUR TRANSMISI (SIP-VSS)', margin + 6, 55);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  const projText = options.projectName ? `Jalur Proyek: ${options.projectName} | ` : '';
  doc.text(`${projText}Versi 2.4 (Terintegrasi Google Sheets, Cloud Storage, Peta GIS & Pintasan Ergonomis)`, margin + 6, 62);
  doc.text(`Terbit: September 2026 | Tim Pengembang: Ventura System Solution`, margin + 6, 68);

  // Section 1: Pendahuluan
  let curY = 85;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('1. PENDAHULUAN & ARSITEKTUR SISTEM', margin, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  const introText = 
    'Sistem Informasi Pertanahan (SIP-VSS) dirancang khusus untuk memfasilitasi pendataan inventarisasi, ' +
    'verifikasi yuridis, pemetaan spasial bidang tanah (ROW & Tapak Tower SUTT/SUTET), serta pengarsipan digital berkas ' +
    'lahan proyek transmisi tenaga listrik. Sistem ini beroperasi secara hibrida antara Google Spreadsheet berkecepatan tinggi ' +
    'dan Google Drive Cloud Storage dengan sistem enkripsi dan hak akses berbasis peran (Role-Based Access Control).';
  const splitIntro = doc.splitTextToSize(introText, contentWidth);
  doc.text(splitIntro, margin, curY);

  curY += splitIntro.length * 4.5 + 4;

  // Section 2: Matriks Peran Pengguna (Role Matrix)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('2. MATRIKS HAK AKSES PERAN PENGGUNA', margin, curY);

  curY += 5;

  // Table header
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(margin, curY, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('PERAN (ROLE)', margin + 3, curY + 4.8);
  doc.text('TARGET PENGGUNA', margin + 35, curY + 4.8);
  doc.text('WEWENANG UTAMA', margin + 80, curY + 4.8);
  doc.text('MODUL YANG DAPAT DIAKSES', margin + 130, curY + 4.8);

  curY += 7;

  const roles = [
    {
      name: 'TAMU (GUEST)',
      color: [100, 116, 139],
      target: 'Stakeholder, Direksi, Instansi Luar, Publik',
      rights: 'Read-Only (Hanya Lihat), Eksplorasi Data, Cetak Dokumen Publik, Tidak dapat ubah data',
      modules: 'Dashboard, Tabel Nominatif, Peta GIS Spasial, Resume Jalur'
    },
    {
      name: 'LAPANGAN (FIELD)',
      color: [16, 185, 129],
      target: 'Tim Surveyor Lapangan, Petugas Identifikasi Fisik',
      rights: 'Input Data Baru, Edit Data Bidang Tanah, Upload Scan/Foto Dokumen, Cetak Formulir Lapangan',
      modules: 'Form Input (5 Tab + Ctrl+S), Nominatif, Berkas Fisik, Peta GIS'
    },
    {
      name: 'QC (VALIDATOR)',
      color: [245, 158, 11],
      target: 'Tim Quality Control, Legal Verifikator, Auditor',
      rights: 'Verifikasi Berkas Fisik, Penetapan Status APPROVED/REJECTED, Catatan Koreksi, Sandingan ESDM',
      modules: 'Modul QC Validasi, Sandingan ESDM, Berkas Fisik, Cetak Kwitansi'
    },
    {
      name: 'ADMINISTRATOR',
      color: [239, 68, 68],
      target: 'Manajer Proyek, Lead Engineer, IT Admin',
      rights: 'Manajemen Multi-Jalur Proyek, Ganti ID Spreadsheet/Drive, Hapus Bidang Tanah, Atur PIN',
      modules: 'Semua Modul + Manajemen Proyek + Log Audit + Konfigurasi PIN'
    }
  ];

  roles.forEach((r, idx) => {
    const rowH = 15;
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, curY, contentWidth, rowH, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.line(margin, curY + rowH, margin + contentWidth, curY + rowH);

    // Role badge
    doc.setFillColor(r.color[0], r.color[1], r.color[2]);
    doc.roundedRect(margin + 2, curY + 3.5, 28, 6.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(r.name, margin + 16, curY + 7.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    
    // Target
    const splitTarget = doc.splitTextToSize(r.target, 42);
    doc.text(splitTarget, margin + 35, curY + 4.5);

    // Rights
    const splitRights = doc.splitTextToSize(r.rights, 47);
    doc.text(splitRights, margin + 80, curY + 4.5);

    // Modules
    const splitModules = doc.splitTextToSize(r.modules, 46);
    doc.text(splitModules, margin + 130, curY + 4.5);

    curY += rowH;
  });

  // Flowchart Diagram Simulation (Alur Ringkas Sistem)
  curY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('3. ALUR OPERASIONAL SISTEM DARI HULU KE HILIR', margin, curY);

  curY += 5;
  const boxW = 39;
  const boxH = 18;
  const stepBoxes = [
    { num: '01', title: 'PENDATAAN LAPANGAN', desc: 'Tim Field ukur & catat tanah, alas hak, tegakan via Form Input.' },
    { num: '02', title: 'PENGUNGGAHAN BERKAS', desc: 'Upload scan KTP, Sertifikat, SPPT, foto langsung ke Google Drive.' },
    { num: '03', title: 'VERIFIKASI & QC', desc: 'Tim QC cek kelengkapan yuridis & tetapkan status APPROVED/REJECTED.' },
    { num: '04', title: 'PEMBAYARAN & BA', desc: 'Cetak Kwitansi resmi, Berita Acara, dan laporan eksekutif proyek.' }
  ];

  stepBoxes.forEach((s, idx) => {
    const bx = margin + (idx * (boxW + 8));
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(bx, curY, boxW, boxH, 2, 2, 'F');
    doc.setDrawColor(amber[0], amber[1], amber[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, curY, boxW, boxH, 2, 2, 'S');

    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.roundedRect(bx + 2, curY + 2, 7, 4, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(s.num, bx + 5.5, curY + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(s.title, bx + 11, curY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const splitDesc = doc.splitTextToSize(s.desc, boxW - 4);
    doc.text(splitDesc, bx + 2, curY + 9.5);

    // Arrow to next step
    if (idx < 3) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(amber[0], amber[1], amber[2]);
      doc.text('►', bx + boxW + 2.5, curY + 10.5);
    }
  });

  addHeaderFooter(1, 'Bagian 1: Pengenalan & Matriks Hak Akses');

  // ==========================================
  // PAGE 2: PANDUAN PENGGUNA TAMU (GUEST)
  // ==========================================
  doc.addPage();
  curY = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PANDUAN OPERASIONAL: PENGGUNA TAMU (GUEST MODE)', margin, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text(
    'Mode Tamu diperuntukkan bagi manajemen, auditor eksternal, atau mitra kerja yang membutuhkan akses pantau ' +
    'real-time tanpa mengubah atau memanipulasi data inventarisasi.',
    margin, curY
  );

  curY += 8;

  // Subsection: Cara Akses
  doc.setFillColor(blue[0], blue[1], blue[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('A. CARA MASUK KE SISTEM SEBAGAI PENGGUNA TAMU', margin + 4, curY + 4.8);

  curY += 10;
  const guestSteps = [
    '1. Buka tautan resmi aplikasi di peramban (Chrome, Edge, atau Firefox).',
    '2. Pada halaman utama / jendela masuk (Gate Portal), pilih jalur transmisi aktif yang ingin Anda tinjau.',
    '3. Klik tombol "Akses Tamu (Mode Pantau)" berwarna biru di bawah tombol login Google.',
    '4. Anda akan langsung masuk ke halaman Dashboard Progres tanpa memerlukan akun Google atau otorisasi tambahan.'
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  guestSteps.forEach(st => {
    doc.text(st, margin + 4, curY);
    curY += 4.5;
  });

  curY += 2;

  // Subsection: Menu Yang Dapat Dijelajahi
  doc.setFillColor(slate[0], slate[1], slate[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('B. EKSPLORASI FITUR & CARA MEMANTAU DATA', margin + 4, curY + 4.8);

  curY += 9;

  const guestFeatures = [
    {
      title: '1. Dashboard Ringkasan & Progres Lahan',
      desc: 'Menampilkan metrik utama: total bidang tanah terdaftar, persentase berkas lengkap, total luas ROW, dan rekapitulasi status verifikasi (APPROVED / PENDING / REJECTED).'
    },
    {
      title: '2. Daftar Nominatif (Tabel Induk Bidang)',
      desc: 'Melihat rincian seluruh pemilik tanah, nomor bidang, luas tanah, tanaman tegakan, dan alas hak. Anda dapat menyaring data berdasarkan desa, span tower, atau mencari nama pemilik secara langsung.'
    },
    {
      title: '3. Peta Bidang Spasial GIS & Navigasi Google Maps',
      desc: 'Visualisasi poligon tanah dan jalur span tower SUTT/SUTET. Klik pada poligon lahan untuk membuka kartu detail koordinat presisi dan klik tombol "Buka di Google Maps" untuk navigasi rute ke lokasi.'
    },
    {
      title: '4. Ekspor Rekapitulasi Data',
      desc: 'Pengguna tamu dapat mengunduh ringkasan data nominatif ke format Excel (.xlsx) atau CSV untuk keperluan pelaporan atau analisis mandiri tanpa risiko merusak database induk.'
    }
  ];

  guestFeatures.forEach(gf => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(gf.title, margin + 4, curY);
    curY += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const splitDesc = doc.splitTextToSize(gf.desc, contentWidth - 8);
    doc.text(splitDesc, margin + 4, curY);
    curY += splitDesc.length * 3.8 + 3;
  });

  // Visual Mockup / Screenshot Representation of Guest Dashboard & Map
  curY += 2;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, curY, contentWidth, 78, 3, 3, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin, curY, contentWidth, 78, 3, 3, 'S');

  // Header of mock screen
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.roundedRect(margin, curY, contentWidth, 8, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TAMPILAN ANTARMUKA: DASHBOARD & PETA SPASIAL GIS (MODE TAMU)', margin + 4, curY + 5.5);

  // Mock Dashboard Stats Cards
  const statY = curY + 12;
  const statW = (contentWidth - 12) / 4;
  const mockStats = [
    { label: 'TOTAL BIDANG', val: '142 Bidang', color: [37, 99, 235] },
    { label: 'BERKAS LENGKAP', val: '88% Terpenuhi', color: [16, 185, 129] },
    { label: 'STATUS APPROVED', val: '115 Bidang', color: [16, 185, 129] },
    { label: 'MENUNGGU QC', val: '27 Bidang', color: [245, 158, 11] }
  ];

  mockStats.forEach((st, idx) => {
    const sx = margin + 3 + (idx * (statW + 2));
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(sx, statY, statW, 16, 1.5, 1.5, 'F');
    doc.setDrawColor(st.color[0], st.color[1], st.color[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(sx, statY, statW, 16, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(st.label, sx + 2.5, statY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(st.val, sx + 2.5, statY + 11.5);
  });

  // Mock GIS Map Section below
  const mapY = statY + 20;
  doc.setFillColor(224, 231, 255); // soft indigo
  doc.roundedRect(margin + 3, mapY, contentWidth - 6, 42, 2, 2, 'F');
  doc.setDrawColor(165, 180, 252);
  doc.roundedRect(margin + 3, mapY, contentWidth - 6, 42, 2, 2, 'S');

  // Simulated transmission line
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.2);
  doc.line(margin + 20, mapY + 25, margin + 80, mapY + 18);
  doc.line(margin + 80, mapY + 18, margin + 140, mapY + 28);

  // Simulated Towers
  const towers = [
    { x: margin + 20, y: mapY + 25, label: 'T.01' },
    { x: margin + 80, y: mapY + 18, label: 'T.02' },
    { x: margin + 140, y: mapY + 28, label: 'T.03' }
  ];
  towers.forEach(tw => {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.circle(tw.x, tw.y, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(tw.label, tw.x - 3, tw.y - 4);
  });

  // Floating Card on Map
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 60, mapY + 6, 75, 28, 2, 2, 'F');
  doc.setDrawColor(amber[0], amber[1], amber[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin + 60, mapY + 6, 75, 28, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('KARTU INFORMASI SPASIAL (KLIK BIDANG)', margin + 63, mapY + 11);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text('Pemilik: H. Achmad Syafei | No Bidang: 042', margin + 63, mapY + 15.5);
  doc.text('Desa: Sukamaju | Span: T.01 - T.02 | Luas: 480 m2', margin + 63, mapY + 19.5);
  doc.text('Koordinat: -7.428519, 109.241830 (UTM 49S)', margin + 63, mapY + 23.5);

  // Google Maps Button Mock
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + 63, mapY + 25.5, 45, 6, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('🗺 Buka di Google Maps Presisi', margin + 66, mapY + 29.5);

  addHeaderFooter(2, 'Bagian 2: Panduan Pengguna Tamu (Guest Mode)');

  // ==========================================
  // PAGE 3: PANDUAN PETUGAS LAPANGAN (FIELD)
  // ==========================================
  doc.addPage();
  curY = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PANDUAN OPERASIONAL: PETUGAS LAPANGAN (FIELD OPERATOR)', margin, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text(
    'Petugas Lapangan bertanggung jawab mendata objek dan subjek pengadaan tanah, mencatat batas fisik, jenis tegakan, ' +
    'bangunan, serta mengunggah arsip digital hasil survei langsung ke cloud repository Google Drive.',
    margin, curY
  );

  curY += 8;

  // Highlight Box: Shortcut Ctrl+S
  doc.setFillColor(254, 243, 199); // soft amber
  doc.roundedRect(margin, curY, contentWidth, 18, 2, 2, 'F');
  doc.setDrawColor(amber[0], amber[1], amber[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, curY, contentWidth, 18, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 83, 9); // dark amber
  doc.text('⚡ FITUR ERGONOMIS: PINTASAN KEYBOARD "Ctrl + S" (SIMPAN CEPAT KAPAN SAJA)', margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  const shortcutNote = 
    'Kini Anda TIDAK PERLU berpindah-pindah sampai ke tab terakhir hanya untuk menekan tombol simpan! Cukup tekan kombinasi ' +
    'tombol "Ctrl + S" (atau "Cmd + S" pada Mac) di tab manapun saat Anda mengetik, atau klik tombol "⚡ Simpan Cepat" ' +
    'di sudut kanan atas bilah tab formulir. Data Anda akan langsung tersimpan aman ke database.';
  const splitShortcut = doc.splitTextToSize(shortcutNote, contentWidth - 8);
  doc.text(splitShortcut, margin + 4, curY + 10.5);

  curY += 23;

  // Subsection: Struktur 5 Tab Form Input
  doc.setFillColor(emerald[0], emerald[1], emerald[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('STRUKTUR FORMULIR INVENTARISASI BIDANG TANAH (5 TAB)', margin + 4, curY + 4.8);

  curY += 9;

  const tabsGuide = [
    {
      tab: 'TAB 1: LAHAN & PEMILIK',
      items: 'Desa, No Bidang, Span Tower (contoh: 01-02), Luas Tanah ROW/Tapak, Nama Pemilik, NIK KTP (16 Digit), Alamat KTP 4 Baris, dan Batas Lahan (Utara, Selatan, Timur, Barat).'
    },
    {
      tab: 'TAB 2: ALAS HAK & BANGUNAN',
      items: 'Jenis Alas Hak (SHM, Letter C, dll.), No Sertifikat, Tahun Terbit, Luas Bangunan terdampak, Konstruksi Bangunan, dan hingga 8 rincian slot bangunan terdampak.'
    },
    {
      tab: 'TAB 3: TANAMAN LAHAN',
      items: 'Inventarisasi tegakan tanaman terdampak (hingga 30 slot tanaman): Jenis tanaman, kategori Sudah Menghasilkan (SM), Belum Menghasilkan (BM), serta ukuran Kecil/Sedang/Besar.'
    },
    {
      tab: 'TAB 4: ADMINISTRASI & WILAYAH',
      items: 'Nama Kades/Lurah, Nama Saksi 1 & 2, Nama Tim Pelaksana Inventarisasi, Progres Upload TRABAS (SUDAH/BELUM), serta Catatan Khusus Kondisi Lapangan.'
    },
    {
      tab: 'TAB 5: CETAK & UNGGAH BERKAS',
      items: 'Cetak Formulir Inventarisasi resmi & unggah langsung dokumen fisik (KTP, KK, Sertifikat, SPPT PBB, Foto Patok Batas) ke Google Drive proyek.'
    }
  ];

  tabsGuide.forEach(tg => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(tg.tab, margin + 4, curY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const splitItems = doc.splitTextToSize(tg.items, contentWidth - 8);
    doc.text(splitItems, margin + 4, curY + 3.8);

    curY += splitItems.length * 3.8 + 3.5;
  });

  // Visual Mockup of Form Input with Ctrl+S highlighted
  curY += 2;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, curY, contentWidth, 70, 3, 3, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin, curY, contentWidth, 70, 3, 3, 'S');

  // Screen Bar
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.roundedRect(margin, curY, contentWidth, 8, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TAMPILAN ANTARMUKA: FORMULIR INPUT DATA DENGAN PINTASAN SIMPAN CEPAT', margin + 4, curY + 5.5);

  // Tab Strip Mock
  const tabY = curY + 11;
  const mockTabs = [
    { name: '1. Lahan & Pemilik', active: true },
    { name: '2. Alas Hak & Bgn', active: false },
    { name: '3. Tanaman', active: false },
    { name: '4. Administrasi', active: false },
    { name: '5. Cetak & Unggah', active: false }
  ];

  let tabX = margin + 3;
  mockTabs.forEach(mt => {
    const tWidth = 24;
    if (mt.active) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(tabX, tabY, tWidth, 6, 1, 1, 'F');
      doc.setDrawColor(amber[0], amber[1], amber[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(tabX, tabY, tWidth, 6, 1, 1, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(tabX, tabY, tWidth, 6, 1, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(muted[0], muted[1], muted[2]);
    }
    doc.setFontSize(5.8);
    doc.text(mt.name, tabX + (tWidth / 2), tabY + 4, { align: 'center' });
    tabX += tWidth + 1.5;
  });

  // Top Bar Save Button (Mock)
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + contentWidth - 42, tabY, 39, 6, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text('💾 Simpan Cepat [Ctrl+S]', margin + contentWidth - 22.5, tabY + 4.2, { align: 'center' });

  // Simulated Input Fields
  const formBoxY = tabY + 9;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 3, formBoxY, contentWidth - 6, 44, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin + 3, formBoxY, contentWidth - 6, 44, 1.5, 1.5, 'S');

  // Input Row 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text('DESA *', margin + 6, formBoxY + 5);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin + 6, formBoxY + 6.5, 52, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('SUKAMAJU', margin + 8, formBoxY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.text('SPAN TOWER *', margin + 62, formBoxY + 5);
  doc.rect(margin + 62, formBoxY + 6.5, 52, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('01-02', margin + 64, formBoxY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.text('NO BIDANG *', margin + 118, formBoxY + 5);
  doc.rect(margin + 118, formBoxY + 6.5, 56, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('042', margin + 120, formBoxY + 10.5);

  // Input Row 2
  doc.setFont('helvetica', 'bold');
  doc.text('NAMA LENGKAP PEMILIK *', margin + 6, formBoxY + 16.5);
  doc.rect(margin + 6, formBoxY + 18, 80, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('H. ACHMAD SYAFEI', margin + 8, formBoxY + 22);

  doc.setFont('helvetica', 'bold');
  doc.text('NIK KTP (16 DIGIT) *', margin + 90, formBoxY + 16.5);
  doc.rect(margin + 90, formBoxY + 18, 84, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('3302142005820003', margin + 92, formBoxY + 22);

  // Bottom Save Buttons in Form (Simpan Ctrl+S + Tab Berikutnya)
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + contentWidth - 75, formBoxY + 34, 34, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text('💾 Simpan (Ctrl+S)', margin + contentWidth - 58, formBoxY + 38.5, { align: 'center' });

  doc.setFillColor(amber[0], amber[1], amber[2]);
  doc.roundedRect(margin + contentWidth - 38, formBoxY + 34, 32, 7, 1.5, 1.5, 'F');
  doc.text('Tab Berikutnya ►', margin + contentWidth - 22, formBoxY + 38.5, { align: 'center' });

  addHeaderFooter(3, 'Bagian 3: Panduan Petugas Lapangan & Pintasan Ctrl+S');

  // ==========================================
  // PAGE 4: PANDUAN TIM QUALITY CONTROL (QC)
  // ==========================================
  doc.addPage();
  curY = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PANDUAN OPERASIONAL: TIM QUALITY CONTROL (QC / VALIDATOR)', margin, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text(
    'Tim Quality Control (QC) berfungsi sebagai gerbang validasi yuridis dan administratif. QC memeriksa kesesuaian berkas, ' +
    'alasan kepemilikan, akurasi nama pada KTP vs Alas Hak, serta memberikan status verifikasi resmi sebelum kompensasi dibayarkan.',
    margin, curY
  );

  curY += 8;

  // Subsection: 3 Status Verifikasi QC
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('A. PENETAPAN STATUS VERIFIKASI & MATRIKS KEPUTUSAN QC', margin + 4, curY + 4.8);

  curY += 10;
  const qcStatuses = [
    {
      status: 'APPROVED (DISETUJUI)',
      color: [16, 185, 129],
      criteria: 'Seluruh 7 berkas yuridis utama lengkap, nama pada KTP identik dengan Sertifikat/Letter C atau didukung Surat Keterangan Beda Nama resmi dari Kades. Siap diterbitkan Berita Acara & Kwitansi Kompensasi.'
    },
    {
      status: 'PENDING (DITAHAN / DALAM PROSES)',
      color: [245, 158, 11],
      criteria: 'Berkas belum lengkap (misal: SPPT PBB tahun berjalan belum dilampirkan atau menunggu surat keterangan waris). Bidang ditandai untuk dilengkapi oleh tim lapangan sebelum batas waktu audit.'
    },
    {
      status: 'REJECTED (DITOLAK / PERLU KOREKSI TOTAL)',
      color: [239, 68, 68],
      criteria: 'Ditemukan sengketa batas lahan, pemilik ganda, sertifikat dibatalkan, atau luas tanah tidak sinkron dengan penetapan lokasi (Penlok). Wajib disertai Catatan Koreksi detail agar tim lapangan melakukan investigasi ulang.'
    }
  ];

  qcStatuses.forEach(qs => {
    doc.setFillColor(qs.color[0], qs.color[1], qs.color[2]);
    doc.roundedRect(margin + 4, curY, 44, 6.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(qs.status, margin + 26, curY + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const splitCrit = doc.splitTextToSize(qs.criteria, contentWidth - 54);
    doc.text(splitCrit, margin + 52, curY + 3.5);

    curY += Math.max(splitCrit.length * 3.6 + 3, 9.5);
  });

  curY += 2;

  // Subsection: Checklist 7 Dokumen Fisik
  doc.setFillColor(slate[0], slate[1], slate[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('B. CHECKLIST 7 DOKUMEN YURIDIS UTAMA YANG WAJIB DIVERIFIKASI', margin + 4, curY + 4.8);

  curY += 9;
  const docsList = [
    '1. Identitas Pribadi: Fotokopi e-KTP dan Kartu Keluarga (KK) pemilik/ahli waris sah.',
    '2. Bukti Penguasaan Fisik: Sertifikat Hak Milik (SHM) / Letter C / Girik / Surat Pernyataan Fisik.',
    '3. Pajak Daerah: Bukti Lunas SPPT PBB tahun berjalan atau tahun terakhir.',
    '4. Surat Pernyataan Penguasaan Fisik Bidang Tanah (SPPFT) bermeterai cukup.',
    '5. Surat Keterangan Kepala Desa: Keterangan tidak sengketa dan beda nama (bila ada perbedaan ejaan).',
    '6. Surat Kuasa / Keterangan Waris (khusus tanah warisan atau bila diwakilkan kepada pihak kedua).',
    '7. Formulir Inventarisasi & Berita Acara Hasil Pengukuran yang ditandatangani pemilik dan tim pelaksana.'
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  docsList.forEach(dl => {
    doc.text(dl, margin + 4, curY);
    curY += 4.2;
  });

  // Visual Mockup / Screenshot Representation of QC Module
  curY += 4;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, curY, contentWidth, 72, 3, 3, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin, curY, contentWidth, 72, 3, 3, 'S');

  // Screen Title Bar
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.roundedRect(margin, curY, contentWidth, 8, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TAMPILAN ANTARMUKA: MODUL QUALITY CONTROL & VERIFIKASI DOKUMEN', margin + 4, curY + 5.5);

  // Split Panel: Left List, Right Detail
  const panelY = curY + 11;
  const listW = 65;
  const detailW = contentWidth - listW - 10;

  // Left List Mock
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 3, panelY, listW, 56, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin + 3, panelY, listW, 56, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('DAFTAR BIDANG MENUNGGU QC', margin + 5, panelY + 5);

  const mockRows = [
    { no: '042', name: 'H. Achmad Syafei', st: 'APPROVED', c: emerald },
    { no: '043', name: 'Siti Aminah', st: 'PENDING', c: amber },
    { no: '044', name: 'Kuswanto (Sengketa)', st: 'REJECTED', c: rose }
  ];

  let rowY = panelY + 8;
  mockRows.forEach(mr => {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + 5, rowY, listW - 4, 13, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(`Bidang #${mr.no} - ${mr.name}`, margin + 7, rowY + 5);

    // Status pill
    doc.setFillColor(mr.c[0], mr.c[1], mr.c[2]);
    doc.roundedRect(margin + 7, rowY + 7, 24, 4, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(255, 255, 255);
    doc.text(mr.st, margin + 19, rowY + 9.8, { align: 'center' });

    rowY += 15;
  });

  // Right Detail Mock
  const detailX = margin + listW + 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(detailX, panelY, detailW, 56, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(detailX, panelY, detailW, 56, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PANEL VALIDASI FISIK & YURIDIS BIDANG #042', detailX + 3, panelY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text('✔ Scan KTP & KK: LENGKAP & TERVERIFIKASI', detailX + 3, panelY + 11);
  doc.text('✔ Sertifikat Hak Milik: TERVALIDASI BPN', detailX + 3, panelY + 16);
  doc.text('✔ Bukti Bayar PBB 2026: TERLAMPIR LUNAS', detailX + 3, panelY + 21);

  // Catatan Koreksi Box Mock
  doc.setFont('helvetica', 'bold');
  doc.text('CATATAN KOREKSI QC:', detailX + 3, panelY + 27);
  doc.setFillColor(248, 250, 252);
  doc.rect(detailX + 3, panelY + 29, detailW - 6, 12, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.text('Data fisik dan yuridis klop. Lanjut ke proses penerbitan BA Kompensasi.', detailX + 5, panelY + 35);

  // QC Action Buttons Mock
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(detailX + 3, panelY + 44, 28, 6.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  doc.text('✔ SETUJUI (APPROVED)', detailX + 17, panelY + 48.5, { align: 'center' });

  doc.setFillColor(245, 158, 11);
  doc.roundedRect(detailX + 34, panelY + 44, 28, 6.5, 1, 1, 'F');
  doc.text('⏳ TAHAN (PENDING)', detailX + 48, panelY + 48.5, { align: 'center' });

  doc.setFillColor(239, 68, 68);
  doc.roundedRect(detailX + 65, panelY + 44, 28, 6.5, 1, 1, 'F');
  doc.text('✖ TOLAK (REJECTED)', detailX + 79, panelY + 48.5, { align: 'center' });

  addHeaderFooter(4, 'Bagian 4: Panduan Tim Quality Control (QC / Validator)');

  // ==========================================
  // PAGE 5: DOKUMEN FISIK & TROUBLESHOOTING
  // ==========================================
  doc.addPage();
  curY = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PENGELOLAAN BERKAS, KWITANSI & PANDUAN PEMECAHAN MASALAH', margin, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text(
    'Prosedur teknis pengarsipan berkas fisik ke Google Drive, pencetakan dokumen resmi, serta langkah-langkah ' +
    'penanganan kendala operasional (troubleshooting) di lapangan maupun kantor.',
    margin, curY
  );

  curY += 8;

  // Subsection: Cetak Berkas & Kwitansi
  doc.setFillColor(blue[0], blue[1], blue[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('1. CETAK FORMULIR INVENTARISASI & KWITANSI RESMI', margin + 4, curY + 4.8);

  curY += 10;
  const printGuide = [
    '• Cetak Formulir Inventarisasi: Masuk ke menu "Input Data" -> cari nomor bidang tanah -> klik tab ke-5 ' +
    '("Cetak & Unggah Berkas"). Klik tombol "Cetak Formulir Inventarisasi Lahan (PDF)". Formulir berstandar resmi ' +
    'akan otomatis di-generate dengan rincian tanah, tanaman, dan kolom tanda tangan saksi & pemilik.',
    '• Cetak Kwitansi Pembayaran: Masuk ke menu "Berkas Fisik" atau "QC Validasi" pada bidang berstatus APPROVED. ' +
    'Klik tombol "Cetak Kwitansi", masukkan nomor kwitansi serta tanggal bayar, lalu cetak sebagai bukti bayar kompensasi sah.'
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  printGuide.forEach(pg => {
    const splitPg = doc.splitTextToSize(pg, contentWidth - 4);
    doc.text(splitPg, margin + 2, curY);
    curY += splitPg.length * 3.8 + 2.5;
  });

  curY += 2;

  // Subsection: Pengunggahan Dokumen Google Drive
  doc.setFillColor(emerald[0], emerald[1], emerald[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('2. PENGUNGGAHAN & INTEGRASI GOOGLE DRIVE REPOSITORY', margin + 4, curY + 4.8);

  curY += 10;
  const driveGuide = [
    '• Sistem secara otomatis mengelompokkan arsip berkas ke dalam folder Google Drive proyek berdasarkan ' +
    'Nama Desa dan Nomor Bidang (contoh: SUKAMAJU/BIDANG_042_ACHMAD_SYAFEI).',
    '• Anda dapat mengunggah file dalam format PDF dokumen atau foto JPG/PNG (foto patok batas, foto KTP, foto tegakan).',
    '• File yang terunggah dapat langsung dipratinjau (preview) di dalam aplikasi tanpa harus membuka Google Drive secara manual.'
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  driveGuide.forEach(dg => {
    const splitDg = doc.splitTextToSize(dg, contentWidth - 4);
    doc.text(splitDg, margin + 2, curY);
    curY += splitDg.length * 3.8 + 2.5;
  });

  curY += 3;

  // Subsection: Troubleshooting
  doc.setFillColor(slate[0], slate[1], slate[2]);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('3. PANDUAN PEMECAHAN MASALAH (TROUBLESHOOTING)', margin + 4, curY + 4.8);

  curY += 10;
  const troubles = [
    {
      q: 'Koneksi Google Sheets / Google Drive Terputus (Token Expired)',
      sol: 'Klik tombol status "Live Sheets" di bilah atas aplikasi, lalu klik "Otorisasi Ulang / Refresh Token Google". Pastikan akun Google yang digunakan memiliki izin akses ke spreadsheet dan folder proyek.'
    },
    {
      q: 'Data Bidang Baru Tidak Muncul di Peta GIS Spasial',
      sol: 'Pastikan penulisan Desa, Span Tower (format: "01-02"), dan Nomor Bidang pada Form Input cocok dengan data poligon GeoJSON. Jika ada perbedaan spasi atau ejaan, peta tidak dapat mengaitkan poligon.'
    },
    {
      q: 'Tombol Simpan Cepat (Ctrl+S) Tidak Merespons',
      sol: 'Pastikan kursor tidak sedang berada di dalam prompt browser eksternal. Periksa kolom wajib (*) seperti DESA, NO BIDANG, NIK, dan SPAN apakah sudah terisi dengan benar. Tanda merah akan menandai isian yang belum lengkap.'
    },
    {
      q: 'Sinyal Lapangan Terbatas / Offline Sementara',
      sol: 'Sistem dilengkapi penyimpan lokal pintar (browser local cache & Firestore sync). Anda dapat terus mengisi data. Saat perangkat kembali terhubung internet, klik tombol "Sync" di bilah atas untuk menyinkronkan seluruh perubahan ke Google Sheets.'
    }
  ];

  troubles.forEach(tb => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(`KENDALA: ${tb.q}`, margin + 2, curY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const splitSol = doc.splitTextToSize(`SOLUSI: ${tb.sol}`, contentWidth - 4);
    doc.text(splitSol, margin + 2, curY + 3.8);

    curY += splitSol.length * 3.8 + 3.5;
  });

  // Support Footer Card
  curY += 3;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, curY, contentWidth, 18, 2, 2, 'F');
  doc.setDrawColor(amber[0], amber[1], amber[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, curY, contentWidth, 18, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text('PUSAT BANTUAN & LAYANAN DUKUNGAN TEKNIS', margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text('Apabila Anda membutuhkan bantuan pengaturan hak akses, penambahan jalur baru, atau kendala server:', margin + 4, curY + 9.5);
  doc.text('• WhatsApp Admin: +62 812-2508-5742   |   • Email Dukungan: agungpambudi763@gmail.com', margin + 4, curY + 14);

  addHeaderFooter(5, 'Bagian 5: Dokumen Fisik, Kwitansi & Pemecahan Masalah');

  // Trigger Download
  const filename = `Buku_Panduan_Pengguna_SIP_VSS_${options.projectName ? options.projectName.replace(/\s+/g, '_') : 'Jalur_Transmisi'}.pdf`;
  doc.save(filename);
}
