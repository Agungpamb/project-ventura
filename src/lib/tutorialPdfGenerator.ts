import { jsPDF } from 'jspdf';

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
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  const totalPages = 6;

  // Modern Executive Color Palette
  const navyDark = [15, 23, 42];        // #0f172a - Deep Slate Navy
  const navyBlue = [30, 41, 59];        // #1e293b - Slate Accent
  const brandPrimary = [14, 116, 144];   // #0e7490 - Deep Cyan / Teal Executive
  const brandAccent = [217, 119, 6];     // #d97706 - Warm Amber Accent
  const textDark = [15, 23, 42];        // #0f172a - Primary Headings
  const textBody = [51, 65, 85];        // #334155 - High-contrast readable body
  const textMuted = [100, 116, 139];    // #64748b - Meta / Subtitles
  const lightBg = [248, 250, 252];      // #f8fafc - Card Background
  const cardBorder = [226, 232, 240];   // #e2e8f0 - Clean border
  const emerald = [16, 149, 106];       // #10956a - Verified Green
  const darkGreen = [21, 128, 61];      // #15803d
  const darkAmber = [180, 83, 9];       // #b45309
  const blue = [37, 99, 235];           // #2563eb - Informational Blue
  const rose = [225, 29, 72];           // #e11d48 - Rejected Rose
  const darkRose = [190, 18, 60];       // #be123c

  // Professional Header & Footer on each page
  const addHeaderFooter = (pageNumber: number, sectionTitle: string) => {
    // Top banner
    doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.rect(0, 0, pageWidth, 11, 'F');
    
    // Thin accent stripe
    doc.setFillColor(brandAccent[0], brandAccent[1], brandAccent[2]);
    doc.rect(0, 11, pageWidth, 1, 'F');

    // Header Titles
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('SISTEM INFORMASI PERTANAHAN & INVENTARISASI TRANSMISI (SIP-VSS)', margin, 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(sectionTitle, pageWidth - margin, 7.5, { align: 'right' });

    // Footer divider
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    // Footer details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Buku Panduan Operasional Resmi (Standard Operating Procedure) • Versi 2.4 Terintegrasi', margin, pageHeight - 7.5);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(navyBlue[0], navyBlue[1], navyBlue[2]);
    doc.text(`Halaman ${pageNumber} dari ${totalPages}`, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  };

  // Helper: Section Title Bar
  const drawSectionHeader = (y: number, num: string, title: string, subtitle?: string) => {
    // Number badge
    doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
    doc.roundedRect(margin, y, 9, 6.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(num, margin + 4.5, y + 4.6, { align: 'center' });

    // Title Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(title, margin + 12, y + 5);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(subtitle, margin + 12, y + 9);
      return y + 11.5;
    }
    return y + 8.5;
  };

  // ==========================================
  // PAGE 1: COVER & MATRIKS HAK AKSES PERAN
  // ==========================================
  
  // Executive Header Hero Card (No external logos, pure clean typography & geometric framing)
  const heroY = 17;
  const heroH = 46;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, heroY, contentWidth, heroH, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, heroY, contentWidth, heroH, 3, 3, 'S');

  // Left accent line
  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.rect(margin, heroY, 2.5, heroH, 'F');

  // Category Tag
  doc.setFillColor(224, 242, 254);
  doc.roundedRect(margin + 6, heroY + 5.5, 48, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(3, 105, 161);
  doc.text('BUKU PANDUAN PENGGUNA RESMI (USER MANUAL)', margin + 8, heroY + 9);

  // Main Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('SISTEM INFORMASI PERTANAHAN & INVENTARISASI (SIP-VSS)', margin + 6, heroY + 19);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  doc.text('Modul Manajemen Pendataan Pengadaan Tanah, Right of Way (ROW) & Kompensasi Transmisi Listrik', margin + 6, heroY + 25);

  // Metadata pills row
  const metaY = heroY + 31;
  const projectName = options.projectName || 'KOMPENSASI ROW 150 kV';
  
  // Project Pill
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 6, metaY, 95, 9, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 6, metaY, 95, 9, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('JALUR AKTIF:', margin + 9, metaY + 4);
  doc.setFontSize(7.5);
  doc.setTextColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  const splitProj = doc.splitTextToSize(projectName, 90);
  doc.text(splitProj[0], margin + 9, metaY + 7.5);

  // Version Pill
  doc.roundedRect(margin + 104, metaY, 36, 9, 1.5, 1.5, 'F');
  doc.roundedRect(margin + 104, metaY, 36, 9, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('VERSI SISTEM:', margin + 107, metaY + 4);
  doc.setFontSize(7.5);
  doc.setTextColor(brandAccent[0], brandAccent[1], brandAccent[2]);
  doc.text('v2.4 (Terintegrasi)', margin + 107, metaY + 7.5);

  // Date Pill
  doc.roundedRect(margin + 143, metaY, contentWidth - 143, 9, 1.5, 1.5, 'F');
  doc.roundedRect(margin + 143, metaY, contentWidth - 143, 9, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('STATUS DOKUMEN:', margin + 146, metaY + 4);
  doc.setFontSize(7.5);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text('Edisi Mutakhir', margin + 146, metaY + 7.5);

  // Section 1: Ringkasan Arsitektur
  let curY = heroY + heroH + 6;
  curY = drawSectionHeader(curY, '01', 'PENDAHULUAN & ARSITEKTUR SISTEM', 'Prinsip kerja aplikasi terintegrasi cloud, sinkronisasi spreadsheet, dan keamanan data');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const introText = 
    'Sistem Informasi Pertanahan (SIP-VSS) adalah platform digital terpadu yang dirancang khusus untuk memfasilitasi percepatan ' +
    'inventarisasi fisik, pengujian yuridis, verifikasi dokumen alas hak, pemetaan spasial (GIS), dan penerbitan berkas kompensasi ' +
    'lahan Right of Way (ROW) serta Tapak Tower transmisi. Sistem mengadopsi arsitektur hibrida berkecepatan tinggi yang ' +
    'mengintegrasikan Google Spreadsheet sebagai basis data tabel live dan Google Drive Cloud Storage sebagai repositori arsip digital.';
  const splitIntro = doc.splitTextToSize(introText, contentWidth);
  doc.text(splitIntro, margin, curY);

  curY += splitIntro.length * 3.8 + 4.5;

  // Section 2: Matriks Peran Pengguna (Role-Based Access Control)
  curY = drawSectionHeader(curY, '02', 'MATRIKS HAK AKSES PERAN PENGGUNA (ROLE MATRIX)', 'Pembagian wewenang, batasan aksi, dan menu yang dapat diakses oleh setiap kelompok pengguna');

  // Table Header
  const colX = {
    role: margin,
    target: margin + 35,
    rights: margin + 78,
    modules: margin + 128
  };
  const tableW = contentWidth;

  doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
  doc.rect(margin, curY, tableW, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('PERAN (ROLE)', colX.role + 3, curY + 4.5);
  doc.text('TARGET PENGGUNA', colX.target, curY + 4.5);
  doc.text('WEWENANG UTAMA', colX.rights, curY + 4.5);
  doc.text('MODUL YANG DAPAT DIAKSES', colX.modules, curY + 4.5);

  curY += 6.5;

  const roles = [
    {
      name: 'TAMU (GUEST)',
      badgeBg: [226, 232, 240],
      badgeText: [51, 65, 85],
      target: 'Stakeholder, Direksi, Instansi Pengawas, Publik',
      rights: 'Read-Only (Hanya Lihat), Monitoring Progres, Eksplorasi Peta GIS & Nominatif, Cetak Dokumen Publik. Tidak dapat merubah data.',
      modules: 'Dashboard Progres, Peta GIS Spasial, Tabel Nominatif, Resume Jalur Proyek'
    },
    {
      name: 'LAPANGAN (FIELD)',
      badgeBg: [209, 250, 229],
      badgeText: [6, 95, 70],
      target: 'Surveyor Lapangan, Tim Identifikasi Fisik & Inventarisasi',
      rights: 'Input Data Baru, Edit/Koreksi Bidang, Upload Foto/Scan Dokumen, Tanda Tangan Digital, Simpan Cepat (Ctrl+S).',
      modules: 'Formulir Input (5 Tab + Ctrl+S), Daftar Nominatif, Berkas Fisik, Peta GIS'
    },
    {
      name: 'QC (VALIDATOR)',
      badgeBg: [254, 243, 199],
      badgeText: [146, 64, 14],
      target: 'Quality Control, Tim Legal Yuridis, Auditor Berkas',
      rights: 'Pemeriksaan 7 Berkas Fisik, Penetapan Status APPROVED / PENDING / REJECTED, Catatan Koreksi, Sandingan ESDM.',
      modules: 'Modul QC Validasi, Sandingan ESDM, Berkas Fisik, Cetak Kwitansi Resmi'
    },
    {
      name: 'ADMINISTRATOR',
      badgeBg: [254, 226, 226],
      badgeText: [153, 27, 27],
      target: 'Project Manager, Lead Engineer, IT Database Admin',
      rights: 'Manajemen Multi-Jalur Proyek, Ganti ID Spreadsheet/Drive, Hapus Bidang Tanah (PIN Protected), Atur Pengguna.',
      modules: 'Seluruh Fitur Sistem + Konfigurasi Jalur + Audit Log + Manajemen PIN'
    }
  ];

  roles.forEach((r, idx) => {
    const rowH = 15;
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, curY, tableW, rowH, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, curY + rowH, margin + tableW, curY + rowH);

    // Role badge
    doc.setFillColor(r.badgeBg[0], r.badgeBg[1], r.badgeBg[2]);
    doc.roundedRect(colX.role + 2, curY + 3.5, 30, 6.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(r.badgeText[0], r.badgeText[1], r.badgeText[2]);
    doc.text(r.name, colX.role + 17, curY + 7.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);

    // Target text
    const splitTarget = doc.splitTextToSize(r.target, 41);
    doc.text(splitTarget, colX.target, curY + 4.5);

    // Rights text
    const splitRights = doc.splitTextToSize(r.rights, 48);
    doc.text(splitRights, colX.rights, curY + 4.5);

    // Modules text
    const splitModules = doc.splitTextToSize(r.modules, 52);
    doc.text(splitModules, colX.modules, curY + 4.5);

    curY += rowH;
  });

  curY += 6;

  // Section 3: Alur Siklus Pengadaan Tanah (Workflow Visual)
  curY = drawSectionHeader(curY, '03', 'ALUR SIKLUS PENGADAAN & PENDATAAN LAHAN', 'Tahapan operasional berurutan dari pengukuran lapangan hingga penerbitan Berita Acara');

  const stepBoxW = (contentWidth - 18) / 4;
  const stepBoxH = 21;
  const steps = [
    { num: 'TAHAP 1', title: 'Inventarisasi Lapangan', desc: 'Surveyor mendata batas lahan, subjek hak, jenis tegakan, dan bangunan via Form Input.' },
    { num: 'TAHAP 2', title: 'Unggah Arsip Digital', desc: 'Dokumen KTP, KK, Sertifikat, SPPT, dan foto patok diunggah langsung ke Cloud Google Drive.' },
    { num: 'TAHAP 3', title: 'Verifikasi Tim QC', desc: 'Tim QC memeriksa kelengkapan yuridis & menetapkan status APPROVED / PENDING / REJECTED.' },
    { num: 'TAHAP 4', title: 'Kwitansi & Pembayaran', desc: 'Penerbitan Berita Acara Kesepakatan, cetak kwitansi resmi, dan transfer kompensasi lahan.' }
  ];

  steps.forEach((s, idx) => {
    const bx = margin + (idx * (stepBoxW + 6));
    
    // Step container
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(bx, curY, stepBoxW, stepBoxH, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, curY, stepBoxW, stepBoxH, 2, 2, 'S');

    // Step Header Pill
    doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
    doc.roundedRect(bx + 2, curY + 2.5, 14, 4.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(255, 255, 255);
    doc.text(s.num, bx + 9, curY + 5.6, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(s.title, bx + 18, curY + 5.8);

    // Step Description
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);
    const splitDesc = doc.splitTextToSize(s.desc, stepBoxW - 4);
    doc.text(splitDesc, bx + 2.5, curY + 10.5);

    // Connector Arrow
    if (idx < 3) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(brandAccent[0], brandAccent[1], brandAccent[2]);
      doc.text('->', bx + stepBoxW + 1.2, curY + 11.5);
    }
  });

  addHeaderFooter(1, 'Bagian 1: Pengenalan & Matriks Hak Akses');

  // =========================================================================
  // PAGE 2: PANDUAN LENGKAP MENAMBAH DATA BARU (ADD DATA) & PINTASAN ERGONOMIS
  // =========================================================================
  doc.addPage();
  curY = 17;

  curY = drawSectionHeader(curY, '04', 'PANDUAN OPERASIONAL: CARA MENAMBAH DATA BIDANG BARU (ADD DATA)', 'Panduan teknis langkah demi langkah input data inventarisasi baru dari lapangan ke sistem');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const addIntro = 
    'Penambahan data bidang tanah baru dilakukan oleh Petugas Lapangan setelah melakukan identifikasi fisik, ' +
    'pengukuran koordinat batas lahan, pencatatan alas hak kepemilikan, dan inventarisasi tegakan tanaman / bangunan terdampak.';
  const splitAddIntro = doc.splitTextToSize(addIntro, contentWidth);
  doc.text(splitAddIntro, margin, curY);

  curY += splitAddIntro.length * 3.8 + 4;

  // 6 Step Breakdown for Adding Data
  const addSteps = [
    {
      step: 'LANGKAH 1: BUKA MENU INPUT DATA',
      desc: 'Klik menu "Input Data" di sidebar navigasi utama, atau klik tombol "+ Tambah Bidang Baru" di bagian atas halaman Tabel Nominatif. Formulir akan terbuka dalam mode isian kosong.'
    },
    {
      step: 'LANGKAH 2: ISI TAB 1 (LAHAN & PEMILIK) - KOLOM WAJIB (*)',
      desc: 'Pilih Desa, masukkan Span Tower (format standar dua angka: "01-02"), ketik Nomor Bidang unik, Luas Tanah ROW/Tapak (m2), Nama Lengkap Pemilik sesuai KTP, NIK e-KTP (16 Digit Wajib), Alamat Lengkap 4 Baris, serta Nama Pemilik Batas Lahan (Utara, Selatan, Timur, Barat).'
    },
    {
      step: 'LANGKAH 3: ISI TAB 2 (STATUS ALAS HAK & BANGUNAN)',
      desc: 'Pilih Jenis Bukti Hak (SHM, Letter C, Girik, Petok D, SPPFT), masukkan Nomor Dokumen & Tahun Terbit. Jika terdapat bangunan terdampak, isi Luas Bangunan, Jenis Konstruksi (Permanen/Semi/Panggung), dan rincian komponen terdampak (atap, dinding, lantai).'
    },
    {
      step: 'LANGKAH 4: ISI TAB 3 (INVENTARISASI TANAMAN & TEGAKAN)',
      desc: 'Tambahkan data tanaman terdampak (tersedia hingga 30 baris slot): Pilih Nama Jenis Tanaman, Kategori Usia (Sudah Menghasilkan / Belum Menghasilkan), Ukuran Batang (Kecil/Sedang/Besar), dan Jumlah Pohon untuk perhitungan nilai kompensasi ESDM.'
    },
    {
      step: 'LANGKAH 5: ISI TAB 4 (ADMINISTRASI & SAKSI LAPANGAN)',
      desc: 'Lengkapi Nama Kepala Desa/Lurah, Identitas Saksi Batas 1 & 2, Nama Tim Pelaksana Pengukuran, Status Pengunggahan ke Sistem TRABAS (SUDAH/BELUM), serta Catatan Khusus Lapangan bila ada sengketa atau kesepakatan khusus.'
    },
    {
      step: 'LANGKAH 6: SIMPAN DATA DENGAN PINTASAN "Ctrl + S"',
      desc: 'Anda TIDAK PERLU klik ke Tab 5 untuk menyimpan! Cukup tekan kombinasi keyboard "Ctrl + S" (Windows) atau "Cmd + S" (Mac) dari tab manapun, atau klik tombol "Simpan Cepat" di pojok kanan atas. Sistem otomatis memvalidasi kolom wajib dan menyimpan ke cloud.'
    }
  ];

  addSteps.forEach(as => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, 'S');

    // Left accent badge
    doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
    doc.rect(margin, curY, 1.5, 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
    doc.text(as.step, margin + 4, curY + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);
    const splitDesc = doc.splitTextToSize(as.desc, contentWidth - 8);
    doc.text(splitDesc, margin + 4, curY + 7.8);

    curY += 14.5;
  });

  curY += 1;

  // Highlight Box: Shortcut Ctrl+S
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin, curY, contentWidth, 16, 2, 2, 'F');
  doc.setDrawColor(brandAccent[0], brandAccent[1], brandAccent[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, curY, contentWidth, 16, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkAmber[0], darkAmber[1], darkAmber[2]);
  doc.text('FITUR PINTASAN KEYBOARD "Ctrl + S" (SIMPAN CEPAT KAPAN SAJA TANPA PINDAH TAB)', margin + 4, curY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const sDesc = 
    'Mempercepat input lapangan hingga 3x lipat. Begitu Anda selesai mengetik data pemilik atau alas hak di Tab 1 atau Tab 2, ' +
    'cukup tekan Ctrl+S. Sistem langsung memverifikasi kolom wajib bertanda (*) dan memberikan konfirmasi visual "Data Berhasil Disimpan".';
  const splitSDesc = doc.splitTextToSize(sDesc, contentWidth - 8);
  doc.text(splitSDesc, margin + 4, curY + 9.5);

  curY += 20;

  // Clean Form Input Mockup
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, curY, contentWidth, 68, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, curY, contentWidth, 68, 3, 3, 'S');

  // Title Bar of the Form
  doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
  doc.roundedRect(margin, curY, contentWidth, 8, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('SIMULASI ANTARMUKA: FORMULIR INPUT DATA DENGAN PINTASAN SIMPAN CEPAT [Ctrl+S]', margin + 4, curY + 5.5);

  // Tab Navigation Strip
  const formTabY = curY + 11;
  const fTabs = [
    { name: '1. Lahan & Pemilik', active: true },
    { name: '2. Alas Hak & Bgn', active: false },
    { name: '3. Tanaman', active: false },
    { name: '4. Administrasi', active: false },
    { name: '5. Cetak & Unggah', active: false }
  ];

  let ftX = margin + 3;
  fTabs.forEach(ft => {
    const tw = 25;
    if (ft.active) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(ftX, formTabY, tw, 6, 1, 1, 'F');
      doc.setDrawColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(ftX, formTabY, tw, 6, 1, 1, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(ftX, formTabY, tw, 6, 1, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    }
    doc.text(ft.name, ftX + (tw / 2), formTabY + 4, { align: 'center' });
    ftX += tw + 1.5;
  });

  // Top Save Button Indicator
  doc.setFillColor(emerald[0], emerald[1], emerald[2]);
  doc.roundedRect(margin + contentWidth - 42, formTabY, 39, 6, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('SIMPAN CEPAT [Ctrl+S]', margin + contentWidth - 22.5, formTabY + 4.2, { align: 'center' });

  // Fields Area
  const fieldsY = formTabY + 9;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin + 3, fieldsY, contentWidth - 6, 42, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin + 3, fieldsY, contentWidth - 6, 42, 1.5, 1.5, 'S');

  // Input row 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('DESA *', margin + 6, fieldsY + 5);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 6, fieldsY + 6.5, 52, 5.5, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('SUKAMAJU', margin + 8, fieldsY + 10.2);

  doc.setFont('helvetica', 'bold');
  doc.text('SPAN TOWER *', margin + 62, fieldsY + 5);
  doc.roundedRect(margin + 62, fieldsY + 6.5, 52, 5.5, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('01-02', margin + 64, fieldsY + 10.2);

  doc.setFont('helvetica', 'bold');
  doc.text('NO BIDANG *', margin + 118, fieldsY + 5);
  doc.roundedRect(margin + 118, fieldsY + 6.5, 56, 5.5, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('042', margin + 120, fieldsY + 10.2);

  // Input row 2
  doc.setFont('helvetica', 'bold');
  doc.text('NAMA LENGKAP PEMILIK (SESUAI KTP) *', margin + 6, fieldsY + 16);
  doc.roundedRect(margin + 6, fieldsY + 17.5, 80, 5.5, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('H. ACHMAD SYAFEI', margin + 8, fieldsY + 21.2);

  doc.setFont('helvetica', 'bold');
  doc.text('NIK e-KTP (16 DIGIT) *', margin + 90, fieldsY + 16);
  doc.roundedRect(margin + 90, fieldsY + 17.5, 84, 5.5, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('3302142005820003', margin + 92, fieldsY + 21.2);

  // Bottom action buttons inside mockup
  doc.setFillColor(emerald[0], emerald[1], emerald[2]);
  doc.roundedRect(margin + contentWidth - 78, fieldsY + 31.5, 36, 6.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('SIMPAN (Ctrl+S)', margin + contentWidth - 60, fieldsY + 35.8, { align: 'center' });

  doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.roundedRect(margin + contentWidth - 39, fieldsY + 31.5, 35, 6.5, 1, 1, 'F');
  doc.text('TAB BERIKUTNYA ->', margin + contentWidth - 21.5, fieldsY + 35.8, { align: 'center' });

  addHeaderFooter(2, 'Bagian 2: Panduan Tambah Data Baru (Add Data) & Pintasan Ctrl+S');

  // =========================================================================
  // PAGE 3: PANDUAN CARA EDIT DATA, HAPUS BIDANG & PENGELOLAAN BERKAS CLOUD
  // =========================================================================
  doc.addPage();
  curY = 17;

  curY = drawSectionHeader(curY, '05', 'PANDUAN OPERASIONAL: CARA MENGUBAH DATA (EDIT DATA)', 'Prosedur pembaruan data bidang yang telah tersimpan di sistem');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const editIntro = 
    'Data bidang tanah yang telah disimpan sewaktu-waktu perlu diperbarui (misalnya: penambahan data ahli waris, koreksi nomor sertifikat, ' +
    'revisi luas ukur ulang BPN, atau penambahan jumlah tanaman tegakan). Pengeditan dapat dilakukan melalui 2 jalur yang sangat fleksibel:';
  const splitEditIntro = doc.splitTextToSize(editIntro, contentWidth);
  doc.text(splitEditIntro, margin, curY);

  curY += splitEditIntro.length * 3.8 + 4;

  // 2 Ways to Edit Data
  const editColsW = (contentWidth - 6) / 2;

  // Method 1 Card
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, editColsW, 36, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, curY, editColsW, 36, 2, 2, 'S');

  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.roundedRect(margin + 2.5, curY + 2.5, 46, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('METODE 1: EDIT DARI TABEL NOMINATIF', margin + 25.5, curY + 6, { align: 'center' });

  const m1Steps = [
    '1. Masuk ke menu "Daftar Nominatif".',
    '2. Gunakan kolom pencarian untuk mencari Nama Pemilik atau No. Bidang.',
    '3. Klik tombol "Edit" (ikon pensil kuning) pada baris bidang terkait.',
    '4. Formulir Input akan terbuka & seluruh data bidang langsung termuat penuh.',
    '5. Lakukan perubahan data, lalu tekan "Ctrl + S" untuk menyimpan.'
  ];
  let mY = curY + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  m1Steps.forEach(st => {
    doc.text(st, margin + 4, mY);
    mY += 4.8;
  });

  // Method 2 Card
  const m2X = margin + editColsW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(m2X, curY, editColsW, 36, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(m2X, curY, editColsW, 36, 2, 2, 'S');

  doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.roundedRect(m2X + 2.5, curY + 2.5, 46, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('METODE 2: EDIT DARI PETA SPASIAL GIS', m2X + 25.5, curY + 6, { align: 'center' });

  const m2Steps = [
    '1. Masuk ke menu "Peta Spasial GIS".',
    '2. Klik poligon lahan yang ingin diubah di peta spasial.',
    '3. Kartu Detail Koordinat Presisi akan muncul di sudut layar.',
    '4. Klik tombol "Buka / Edit Bidang" pada kartu info tersebut.',
    '5. Anda diarahkan langsung ke Formulir Input dengan data siap diedit.'
  ];
  mY = curY + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  m2Steps.forEach(st => {
    doc.text(st, m2X + 4, mY);
    mY += 4.8;
  });

  curY += 41;

  // Section: Cara Hapus Bidang Tanah (Delete Data) - Admin Protected
  curY = drawSectionHeader(curY, '06', 'PANDUAN PENGHAPUSAN BIDANG TANAH (DELETE DATA)', 'Keamanan integritas data dan pembatasan hak akses penghapusan');

  doc.setFillColor(254, 242, 242);
  doc.roundedRect(margin, curY, contentWidth, 23, 2, 2, 'F');
  doc.setDrawColor(rose[0], rose[1], rose[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, curY, contentWidth, 23, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(darkRose[0], darkRose[1], darkRose[2]);
  doc.text('PERINGATAN: PENGHAPUSAN DATA HANYA DAPAT DILAKUKAN OLEH ADMINISTRATOR DENGAN PIN RESMI', margin + 4, curY + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const delDesc = 
    'Untuk melindungi data proyek dari kesalahan penghapusan yang disengaja maupun tidak disengaja, tombol hapus (ikon tempat sampah merah) ' +
    'hanya aktif bagi peran Administrator. Saat tombol hapus ditekan, sistem akan memicu dialog verifikasi keamanan: ' +
    'Admin wajib mengonfirmasi nama pemilik dan memasukkan PIN Keamanan 6-digit. Seluruh aksi penghapusan akan tercatat otomatis ' +
    'di dalam Log Audit Sistem (menyimpan waktu, ID bidang, nama pengguna yang menghapus, dan nomor IP).';
  const splitDelDesc = doc.splitTextToSize(delDesc, contentWidth - 8);
  doc.text(splitDelDesc, margin + 4, curY + 9.5);

  curY += 28;

  // Section: Panduan Unggah Berkas & Tanda Tangan Digital (Tab 5)
  curY = drawSectionHeader(curY, '07', 'PENGUNGGAHAN BERKAS FISIK CLOUD & TANDA TANGAN DIGITAL (TAB 5)', 'Pengarsipan dokumen elektronik langsung ke Google Drive repository proyek');

  const uploadColsW = (contentWidth - 6) / 2;

  // Subcard 1: Upload Berkas
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, uploadColsW, 50, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, curY, uploadColsW, 50, 2, 2, 'S');

  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.roundedRect(margin + 2.5, curY + 2.5, 42, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('UNGGAH DOKUMEN KE DRIVE', margin + 23.5, curY + 6, { align: 'center' });

  const upDesc = [
    '• Struktur Folder Otomatis: Sistem mengelompokkan dokumen ke folder Desa dan Nomor Bidang (contoh: SUKAMAJU/BIDANG_042_ACHMAD_SYAFEI).',
    '• Dokumen Wajib Diunggah: Scan KTP & KK, Bukti Kepemilikan (SHM/Letter C), SPPT PBB tahun berjalan, dan Surat Kades.',
    '• Format File: Mendukung PDF dokumen resmi dan foto JPG/PNG (foto patok batas, kondisi tegakan, dan bangunan).',
    '• Pratinjau Cepat: Berkas dapat dipratinjau langsung di aplikasi.'
  ];
  let upY = curY + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  upDesc.forEach(ud => {
    const splitUd = doc.splitTextToSize(ud, uploadColsW - 6);
    doc.text(splitUd, margin + 3.5, upY);
    upY += splitUd.length * 3.3 + 1.8;
  });

  // Subcard 2: Tanda Tangan Digital
  const signX = margin + uploadColsW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(signX, curY, uploadColsW, 50, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(signX, curY, uploadColsW, 50, 2, 2, 'S');

  doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.roundedRect(signX + 2.5, curY + 2.5, 42, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TANDA TANGAN DIGITAL RESMI', signX + 23.5, curY + 6, { align: 'center' });

  const signDesc = [
    '• Kanvas Tanda Tangan Touchscreen: Tersedia kanvas digital interaktif di Tab 5 yang dapat ditandatangani langsung menggunakan stylus atau jari.',
    '• Tanda Tangan Tersemat: Tanda tangan pemilik lahan dan surveyor lapangan akan otomatis tertanam pada lembar Formulir Inventarisasi resmi.',
    '• Bukti Yuridis Lapangan: Tanda tangan digital ini memperkuat keabsahan persetujuan inventarisasi sebelum berkas diajukan ke tahap verifikasi QC.'
  ];
  let sY = curY + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  signDesc.forEach(sd => {
    const splitSd = doc.splitTextToSize(sd, uploadColsW - 6);
    doc.text(splitSd, signX + 3.5, sY);
    sY += splitSd.length * 3.3 + 2;
  });

  addHeaderFooter(3, 'Bagian 3: Panduan Edit Data, Hapus Bidang & Dokumen Cloud');

  // =========================================================================
  // PAGE 4: PANDUAN PENGGUNA TAMU, PETA GIS SPASIAL & EKSPOR LAPORAN
  // =========================================================================
  doc.addPage();
  curY = 17;

  curY = drawSectionHeader(curY, '08', 'PANDUAN OPERASIONAL: PENGGUNA TAMU (GUEST MODE)', 'Akses monitoring dan tinjauan progres lahan tanpa otentikasi Google Drive');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const guestIntro = 
    'Akses Mode Tamu disediakan khusus bagi manajemen puncak, tim pengawas proyek, auditor independen, dan instansi eksternal ' +
    'yang membutuhkan transparansi progres inventarisasi tanah secara aktual tanpa hak mengubah (read-only), guna menjamin ' +
    'keamanan dan integritas data lapangan.';
  const splitGuestIntro = doc.splitTextToSize(guestIntro, contentWidth);
  doc.text(splitGuestIntro, margin, curY);

  curY += splitGuestIntro.length * 3.8 + 4;

  // Step-by-Step Guest Access
  const leftColW = (contentWidth - 6) / 2;
  const rightColW = leftColW;

  // Card: Cara Masuk Mode Tamu
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, leftColW, 35, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, curY, leftColW, 35, 2, 2, 'S');

  doc.setFillColor(blue[0], blue[1], blue[2]);
  doc.roundedRect(margin + 2.5, curY + 2.5, 30, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('LANGKAH AKSES TAMU', margin + 17.5, curY + 6, { align: 'center' });

  const guestSteps = [
    '1. Buka tautan resmi portal aplikasi di peramban web.',
    '2. Pada jendela masuk, pilih Jalur Transmisi yang ingin ditinjau.',
    '3. Klik tombol "Masuk Sebagai Tamu (Mode Pantau)".',
    '4. Anda langsung diarahkan ke Dashboard tanpa login Google.'
  ];
  let stepY = curY + 11.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  guestSteps.forEach(gs => {
    doc.text(gs, margin + 4, stepY);
    stepY += 5;
  });

  // Card: Fitur yang Tersedia
  const rightX = margin + leftColW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(rightX, curY, rightColW, 35, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(rightX, curY, rightColW, 35, 2, 2, 'S');

  doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.roundedRect(rightX + 2.5, curY + 2.5, 34, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('FITUR UTAMA YANG DIAKSES', rightX + 19.5, curY + 6, { align: 'center' });

  const guestRights = [
    '• Dashboard Eksekutif: Metrik real-time progres bidang & berkas.',
    '• Peta Spasial GIS: Klik bidang poligon & navigasi Google Maps.',
    '• Daftar Nominatif: Tabel filter desa, pemilik, & span tower.',
    '• Ekspor Laporan: Unduh data ringkas ke format Excel / CSV.'
  ];
  stepY = curY + 11.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  guestRights.forEach(gr => {
    doc.text(gr, rightX + 4, stepY);
    stepY += 5;
  });

  curY += 40;

  // Visual Clean Mockup: Dashboard & Peta Spasial GIS
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, curY, contentWidth, 88, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, curY, contentWidth, 88, 3, 3, 'S');

  // Title Bar of the Mockup Window
  doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
  doc.roundedRect(margin, curY, contentWidth, 8.5, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SIMULASI ANTARMUKA PENGGUNA: DASHBOARD EKSEKUTIF & PETA SPASIAL GIS (MODE TAMU)', margin + 5, curY + 5.8);

  // 4 Top Metric Cards
  const metricY = curY + 12;
  const metricW = (contentWidth - 15) / 4;
  const metrics = [
    { label: 'TOTAL BIDANG TANAH', val: '142 Bidang', sub: 'Terdaftar di jalur aktif', c: brandPrimary },
    { label: 'KELENGKAPAN BERKAS', val: '88.5 %', sub: '126 berkas memenuhi syarat', c: emerald },
    { label: 'STATUS APPROVED (QC)', val: '115 Bidang', sub: 'Siap bayar kompensasi', c: emerald },
    { label: 'MENUNGGU VERIFIKASI', val: '27 Bidang', sub: 'Dalam antrean validasi QC', c: brandAccent }
  ];

  metrics.forEach((m, idx) => {
    const mx = margin + 3 + (idx * (metricW + 3));
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(mx, metricY, metricW, 16, 1.5, 1.5, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(mx, metricY, metricW, 16, 1.5, 1.5, 'S');

    // Left accent badge
    doc.setFillColor(m.c[0], m.c[1], m.c[2]);
    doc.rect(mx, metricY, 1.5, 16, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(m.label, mx + 3.5, metricY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(m.val, mx + 3.5, metricY + 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);
    doc.text(m.sub, mx + 3.5, metricY + 14.2);
  });

  // GIS Map Canvas Mockup
  const mapCanvasY = metricY + 20;
  doc.setFillColor(241, 245, 249); // Soft map background
  doc.roundedRect(margin + 3, mapCanvasY, contentWidth - 6, 52, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 3, mapCanvasY, contentWidth - 6, 52, 2, 2, 'S');

  // Simulated Road / River Grid
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  for (let gx = margin + 15; gx < margin + contentWidth - 10; gx += 25) {
    doc.line(gx, mapCanvasY, gx, mapCanvasY + 52);
  }
  for (let gy = mapCanvasY + 10; gy < mapCanvasY + 50; gy += 15) {
    doc.line(margin + 3, gy, margin + contentWidth - 3, gy);
  }

  // Simulated Transmission Line ROW (Double Gold Line)
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(1.2);
  doc.line(margin + 20, mapCanvasY + 35, margin + 75, mapCanvasY + 22);
  doc.line(margin + 75, mapCanvasY + 22, margin + 135, mapCanvasY + 30);

  // Tower Circles & Labels
  const mockTowers = [
    { x: margin + 20, y: mapCanvasY + 35, label: 'T.01' },
    { x: margin + 75, y: mapCanvasY + 22, label: 'T.02' },
    { x: margin + 135, y: mapCanvasY + 30, label: 'T.03' }
  ];
  mockTowers.forEach(t => {
    doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.circle(t.x, t.y, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(navyBlue[0], navyBlue[1], navyBlue[2]);
    doc.text(t.label, t.x - 3.5, t.y - 4);
  });

  // Simulated Land Polygons along ROW
  doc.setFillColor(187, 247, 208); // Light green polygon
  doc.roundedRect(margin + 32, mapCanvasY + 24, 28, 16, 1, 1, 'F');
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin + 32, mapCanvasY + 24, 28, 16, 1, 1, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(22, 101, 52);
  doc.text('Bidang #041', margin + 34, mapCanvasY + 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.text('320 m2', margin + 34, mapCanvasY + 32);

  // Active Clicked Polygon (Highlighted Amber)
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin + 62, mapCanvasY + 16, 32, 20, 1, 1, 'F');
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin + 62, mapCanvasY + 16, 32, 20, 1, 1, 'S');

  // Floating Popup Card on Map for Bidang #042
  const popX = margin + 98;
  const popY = mapCanvasY + 8;
  const popW = contentWidth - 105;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(popX, popY, popW, 36, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(popX, popY, popW, 36, 2, 2, 'S');

  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.roundedRect(popX, popY, popW, 6, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DETAIL BIDANG SPASIAL (KLIK POLIGON)', popX + 3.5, popY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Bidang #042 - H. Achmad Syafei', popX + 3.5, popY + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  doc.text('Desa: Sukamaju   |   Span: Tower 01 - 02', popX + 3.5, popY + 14.5);
  doc.text('Luas Terdampak: 480 m2   |   Alas Hak: SHM No. 1024', popX + 3.5, popY + 18.5);
  doc.text('Koordinat UTM 49S: X=324150, Y=9182340', popX + 3.5, popY + 22.5);

  // Google Maps button in popup
  doc.setFillColor(14, 116, 144);
  doc.roundedRect(popX + 3.5, popY + 25.5, 42, 6.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  doc.text('NAVIGASI GOOGLE MAPS', popX + 24.5, popY + 29.8, { align: 'center' });

  addHeaderFooter(4, 'Bagian 4: Panduan Pengguna Tamu, Peta Spasial & Nominatif');

  // =========================================================================
  // PAGE 5: PANDUAN TIM QUALITY CONTROL (QC) & SANDINGAN REGULASI ESDM
  // =========================================================================
  doc.addPage();
  curY = 17;

  curY = drawSectionHeader(curY, '09', 'PANDUAN OPERASIONAL: TIM QUALITY CONTROL (QC / VALIDATOR)', 'Verifikasi fisik & yuridis berkas, checklist 7 dokumen wajib, dan penetapan status');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  const qcIntro = 
    'Tim Quality Control (QC) berfungsi sebagai gerbang utama validasi yuridis dan kepatuhan administratif. ' +
    'QC bertugas menguji kesesuaian antara identitas pemilik, bukti hak kepemilikan tanah, kesesuaian batas lokasi, ' +
    'serta memberikan penetapan status resmi sebelum berkas dinyatakan layak bayar kompensasi.';
  const splitQcIntro = doc.splitTextToSize(qcIntro, contentWidth);
  doc.text(splitQcIntro, margin, curY);

  curY += splitQcIntro.length * 3.8 + 4;

  // 3 Status Decision Cards
  const statusCards = [
    {
      status: 'APPROVED (DISETUJUI)',
      badgeBg: [209, 250, 229],
      badgeText: [6, 95, 70],
      border: emerald,
      crit: 'Seluruh 7 dokumen yuridis lengkap, data identitas KTP sinkron dengan Sertifikat/Letter C atau didukung Surat Beda Nama resmi Kades. Berkas dinyatakan SAH untuk diterbitkan Kwitansi & Berita Acara.'
    },
    {
      status: 'PENDING (DITAHAN / PROSES)',
      badgeBg: [254, 243, 199],
      badgeText: [146, 64, 14],
      border: brandAccent,
      crit: 'Berkas belum lengkap (misal: Bukti Lunas PBB tahun berjalan belum dilampirkan atau menunggu surat keterangan waris). Bidang diberi tenggat waktu untuk dilengkapi oleh tim lapangan.'
    },
    {
      status: 'REJECTED (DITOLAK / KOREKSI)',
      badgeBg: [254, 226, 226],
      badgeText: [153, 27, 27],
      border: rose,
      crit: 'Ditemukan sengketa batas tanah, tumpang tindih kepemilikan, perbedaan luas melebihi toleransi Penlok, atau sertifikat palsu/batal. Wajib disertai Catatan Koreksi detail agar diinvestigasi ulang.'
    }
  ];

  statusCards.forEach(sc => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, curY, contentWidth, 13, 1.5, 1.5, 'F');
    doc.setDrawColor(sc.border[0], sc.border[1], sc.border[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, curY, contentWidth, 13, 1.5, 1.5, 'S');

    // Status badge
    doc.setFillColor(sc.badgeBg[0], sc.badgeBg[1], sc.badgeBg[2]);
    doc.roundedRect(margin + 3, curY + 3.2, 42, 6.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(sc.badgeText[0], sc.badgeText[1], sc.badgeText[2]);
    doc.text(sc.status, margin + 24, curY + 7.5, { align: 'center' });

    // Criteria
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);
    const splitCrit = doc.splitTextToSize(sc.crit, contentWidth - 52);
    doc.text(splitCrit, margin + 49, curY + 4.5);

    curY += 15.5;
  });

  curY += 2;

  // Section: Checklist 7 Dokumen Yuridis Wajib
  curY = drawSectionHeader(curY, '10', 'CHECKLIST 7 DOKUMEN YURIDIS UTAMA WAJIB VERIFIKASI', 'Standar pemeriksaan dokumen kepemilikan sebelum pengajuan pembayaran');

  const docCols = [
    [
      '1. Identitas Pribadi: Fotokopi e-KTP & Kartu Keluarga (KK) sah.',
      '2. Bukti Kepemilikan: Sertifikat Hak Milik (SHM) / Letter C / Girik.',
      '3. Pajak Daerah: Bukti Lunas SPPT PBB tahun berjalan.',
      '4. SPPFT: Surat Pernyataan Penguasaan Fisik Tanah bermeterai.'
    ],
    [
      '5. Surat Kades: Keterangan tidak sengketa & beda nama (jika ada).',
      '6. Surat Kuasa / Keterangan Waris (khusus bidang warisan).',
      '7. Berita Acara Inventarisasi: Ditandatangani pemilik & saksi.'
    ]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);

  let checkY = curY;
  docCols[0].forEach(d => {
    doc.text(d, margin + 2, checkY);
    checkY += 4.5;
  });

  checkY = curY;
  docCols[1].forEach(d => {
    doc.text(d, margin + (contentWidth / 2) + 2, checkY);
    checkY += 4.5;
  });

  curY += 23;

  // Visual Mockup of QC Module & Decision Panel
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, curY, contentWidth, 75, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, curY, contentWidth, 75, 3, 3, 'S');

  // Title Bar of QC window
  doc.setFillColor(navyDark[0], navyDark[1], navyDark[2]);
  doc.roundedRect(margin, curY, contentWidth, 8, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('SIMULASI ANTARMUKA: MODUL QUALITY CONTROL & VERIFIKASI BERKAS YURIDIS', margin + 4, curY + 5.5);

  const qcPanelY = curY + 11;
  const qcListW = 66;
  const qcDetailW = contentWidth - qcListW - 9;

  // Left List Mockup
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin + 3, qcPanelY, qcListW, 58, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(margin + 3, qcPanelY, qcListW, 58, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('ANTREAN VALIDASI BIDANG', margin + 6, qcPanelY + 5);

  const mockQcList = [
    { no: '042', name: 'H. Achmad Syafei', st: 'APPROVED', c: emerald },
    { no: '043', name: 'Siti Aminah', st: 'PENDING', c: brandAccent },
    { no: '044', name: 'Kuswanto (Sengketa)', st: 'REJECTED', c: rose }
  ];

  let qRowY = qcPanelY + 8;
  mockQcList.forEach(item => {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, qRowY, qcListW - 4, 14, 1, 1, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.roundedRect(margin + 5, qRowY, qcListW - 4, 14, 1, 1, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`Bidang #${item.no} - ${item.name}`, margin + 7, qRowY + 5);

    // Pill
    doc.setFillColor(item.c[0], item.c[1], item.c[2]);
    doc.roundedRect(margin + 7, qRowY + 7.5, 24, 4, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(255, 255, 255);
    doc.text(item.st, margin + 19, qRowY + 10.3, { align: 'center' });

    qRowY += 16;
  });

  // Right Detail Panel Mockup
  const qDetailX = margin + qcListW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(qDetailX, qcPanelY, qcDetailW, 58, 1.5, 1.5, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.roundedRect(qDetailX, qcPanelY, qcDetailW, 58, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('PANEL VALIDASI DOKUMEN: BIDANG #042', qDetailX + 4, qcPanelY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  doc.text('v Scan Dokumen e-KTP & KK: LENGKAP & TERVERIFIKASI', qDetailX + 4, qcPanelY + 10.5);
  doc.text('v Sertifikat Hak Milik (SHM No. 1024): TERVALIDASI BPN', qDetailX + 4, qcPanelY + 15);
  doc.text('v Bukti Setor Lunas SPPT PBB 2026: TERLAMPIR LUNAS', qDetailX + 4, qcPanelY + 19.5);

  // Correction Notes Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.text('CATATAN PEMERIKSAAN QC:', qDetailX + 4, qcPanelY + 25);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qDetailX + 4, qcPanelY + 27, qcDetailW - 8, 14, 1, 1, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.text('Data fisik dan yuridis klop. Lanjut ke proses penerbitan Berita Acara & Kwitansi.', qDetailX + 6, qcPanelY + 34);

  // Action Buttons
  doc.setFillColor(emerald[0], emerald[1], emerald[2]);
  doc.roundedRect(qDetailX + 4, qcPanelY + 46, 30, 7, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  doc.text('SETUJUI (APPROVED)', qDetailX + 19, qcPanelY + 50.5, { align: 'center' });

  doc.setFillColor(brandAccent[0], brandAccent[1], brandAccent[2]);
  doc.roundedRect(qDetailX + 37, qcPanelY + 46, 30, 7, 1, 1, 'F');
  doc.text('TAHAN (PENDING)', qDetailX + 52, qcPanelY + 50.5, { align: 'center' });

  doc.setFillColor(rose[0], rose[1], rose[2]);
  doc.roundedRect(qDetailX + 70, qcPanelY + 46, 30, 7, 1, 1, 'F');
  doc.text('TOLAK (REJECTED)', qDetailX + 85, qcPanelY + 50.5, { align: 'center' });

  addHeaderFooter(5, 'Bagian 5: Panduan Tim Quality Control (QC / Validator)');

  // =========================================================================
  // PAGE 6: DOKUMEN FISIK, KWITANSI & PANDUAN PEMECAHAN MASALAH
  // =========================================================================
  doc.addPage();
  curY = 17;

  curY = drawSectionHeader(curY, '11', 'PENGELOLAAN BERKAS, KWITANSI & PANDUAN PEMECAHAN MASALAH', 'Penerbitan dokumen resmi, integrasi Google Drive, serta solusi praktis kendala operasional');

  // Section: Cetak Berkas & Kwitansi
  const pColW = (contentWidth - 6) / 2;

  // Box 1: Cetak Berkas
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, pColW, 36, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, curY, pColW, 36, 2, 2, 'S');

  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.roundedRect(margin + 2.5, curY + 2.5, 38, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PENCETAKAN FORMULIR & KWITANSI', margin + 21.5, curY + 6, { align: 'center' });

  const printPoints = [
    '• Formulir Inventarisasi PDF: Akses Tab 5 Form Input, klik "Cetak Formulir Inventarisasi". Dokumen otomatis terisi data bidang, tanaman & tanda tangan.',
    '• Kwitansi Kompensasi Sah: Masuk ke Berkas Fisik / QC pada bidang APPROVED. Masukkan nomor kwitansi & cetak tanda bukti penerimaan.'
  ];
  let ptY = curY + 11.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  printPoints.forEach(pt => {
    const splitPt = doc.splitTextToSize(pt, pColW - 6);
    doc.text(splitPt, margin + 3.5, ptY);
    ptY += splitPt.length * 3.4 + 2;
  });

  // Box 2: Google Drive Repository
  const pRightX = margin + pColW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pRightX, curY, pColW, 36, 2, 2, 'F');
  doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(pRightX, curY, pColW, 36, 2, 2, 'S');

  doc.setFillColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.roundedRect(pRightX + 2.5, curY + 2.5, 38, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('STRUKTUR CLOUD GOOGLE DRIVE', pRightX + 21.5, curY + 6, { align: 'center' });

  const drivePoints = [
    '• Otomatisasi Folder: Sistem mengelompokkan dokumen ke folder Desa dan Nomor Bidang (contoh: SUKAMAJU/BIDANG_042_ACHMAD_SYAFEI).',
    '• Format File Didukung: Scan PDF dokumen resmi, foto JPG/PNG (foto patok batas, kondisi tegakan, dan KTP).',
    '• Pratinjau Cepat: Arsip dapat ditinjau langsung di aplikasi.'
  ];
  ptY = curY + 11.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  drivePoints.forEach(dp => {
    const splitDp = doc.splitTextToSize(dp, pColW - 6);
    doc.text(splitDp, pRightX + 3.5, ptY);
    ptY += splitDp.length * 3.4 + 2;
  });

  curY += 41;

  // Troubleshooting Section
  curY = drawSectionHeader(curY, '12', 'PANDUAN PEMECAHAN MASALAH (TROUBLESHOOTING & FAQ)', 'Solusi cepat terhadap kendala jaringan, sinkronisasi token, dan validasi data');

  const faqs = [
    {
      q: 'Koneksi Google Sheets / Google Drive Terputus (Token Otorisasi Expired)',
      sol: 'Klik tombol status "Live Sheets" di bilah atas aplikasi, lalu pilih "Otorisasi Ulang Google". Pastikan akun Google yang digunakan memiliki izin editor pada spreadsheet dan folder induk Google Drive proyek.'
    },
    {
      q: 'Data Bidang Baru Tidak Muncul / Poligon Tidak Berwarna di Peta GIS Spasial',
      sol: 'Pastikan penulisan Desa, Span Tower (contoh: "01-02"), dan Nomor Bidang pada Form Input persis sama dengan atribut file GeoJSON. Spasi ganda atau perbedaan huruf kapital dapat menyebabkan peta tidak mengaitkan data.'
    },
    {
      q: 'Pintasan Simpan Cepat (Ctrl+S) Tidak Menyimpan Formulir',
      sol: 'Pastikan kursor tidak aktif di dalam bilah alamat URL peramban. Periksa kolom bertanda bintang merah (*) seperti DESA, NO BIDANG, NIK, dan SPAN apakah sudah terisi dengan format benar.'
    },
    {
      q: 'Kondisi Jaringan Lapangan Lemah atau Terputus Sementara (Offline Mode)',
      sol: 'Aplikasi dilengkapi fitur offline cache lokal. Petugas dapat terus melanjutkan pengetikan data di lapangan. Begitu perangkat kembali mendapatkan sinyal internet, klik tombol "Sync" di bilah atas untuk menyinkronkan data ke cloud.'
    }
  ];

  faqs.forEach(f => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, curY, contentWidth, 16.5, 1.5, 1.5, 'F');
    doc.setDrawColor(cardBorder[0], cardBorder[1], cardBorder[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, curY, contentWidth, 16.5, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`KENDALA: ${f.q}`, margin + 3.5, curY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(textBody[0], textBody[1], textBody[2]);
    const splitSol = doc.splitTextToSize(`SOLUSI: ${f.sol}`, contentWidth - 7);
    doc.text(splitSol, margin + 3.5, curY + 8.5);

    curY += 19;
  });

  curY += 2;

  // Help Desk / Support Footer Card
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, curY, contentWidth, 21, 2, 2, 'F');
  doc.setDrawColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, curY, contentWidth, 21, 2, 2, 'S');

  // Left accent
  doc.setFillColor(brandPrimary[0], brandPrimary[1], brandPrimary[2]);
  doc.rect(margin, curY, 2, 21, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('PUSAT BANTUAN OPERASIONAL & LAYANAN DUKUNGAN TEKNIS', margin + 6, curY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(textBody[0], textBody[1], textBody[2]);
  doc.text('Apabila tim lapangan atau verifikator menemui kendala hak akses, penambahan span jalur baru, atau audit data:', margin + 6, curY + 11);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(navyBlue[0], navyBlue[1], navyBlue[2]);
  doc.text('WhatsApp Admin Pengembang: +62 812-2508-5742     |     Email Dukungan: agungpambudi763@gmail.com', margin + 6, curY + 16);

  addHeaderFooter(6, 'Bagian 6: Dokumen Fisik, Kwitansi & Pemecahan Masalah');

  // Generate & Download PDF
  const filename = `Buku_Panduan_Pengguna_SIP_VSS_${options.projectName ? options.projectName.replace(/\s+/g, '_') : 'Jalur_Transmisi'}.pdf`;
  doc.save(filename);
}
