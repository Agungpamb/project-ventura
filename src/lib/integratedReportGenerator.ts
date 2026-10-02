import { jsPDF } from 'jspdf';
import { getOfficialLogos } from './logoLoader';
import type { LandRecord, VillageResume, AgencyLetter } from '../types';

export interface ExportReportOptions {
  includeLahan?: boolean;
  includeResume?: boolean;
  includeSurat?: boolean;
  reportStyle?: 'BUMN_OFFICIAL' | 'MODERN_EXECUTIVE';
  orientation?: 'portrait' | 'landscape';
}

export async function generateIntegratedReportPDF(params: {
  activeProjectName?: string;
  records: LandRecord[];
  stats: {
    total: number;
    totalLuas: number;
    totalBuildings: number;
    totalPlantsCount: number;
    pemberkasanSelesai: number;
    pemberkasanKonsinyasi: number;
    pemberkasanBelumSelesai: number;
    trabasSudah: number;
    trabasBelum: number;
  };
  combinedVillageResumes: VillageResume[];
  resumeSummary: {
    totalDesa: number;
    tuntasDesa: number;
    prosesDesa: number;
    avgProgress: number;
  };
  agencyLetters: AgencyLetter[];
  suratSummary: {
    total: number;
    selesai: number;
    onProgress: number;
    tindakLanjut: number;
  };
  alasHakAnalysis: {
    totalAnalyzed: number;
    items: Array<{
      code: string;
      label: string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  desaProgressData: Array<{
    name: string;
    total: number;
    selesai: number;
    konsinyasi: number;
    belum: number;
    trabasSudah: number;
    trabasBelum: number;
  }>;
  options: ExportReportOptions;
}): Promise<jsPDF> {
  const {
    activeProjectName,
    records,
    stats,
    combinedVillageResumes,
    resumeSummary,
    agencyLetters,
    suratSummary,
    alasHakAnalysis,
    desaProgressData,
    options
  } = params;

  const includeLahan = options?.includeLahan !== false;
  const includeResume = options?.includeResume !== false;
  const includeSurat = options?.includeSurat !== false;

  const hasAny = includeLahan || includeResume || includeSurat;
  const effLahan = hasAny ? includeLahan : true;
  const effResume = hasAny ? includeResume : true;
  const effSurat = hasAny ? includeSurat : true;

  const isLandscape = options.orientation === 'landscape';
  const reportStyle = options.reportStyle || 'BUMN_OFFICIAL';

  const doc = new jsPDF({
    orientation: isLandscape ? 'l' : 'p',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  const leftMargin = 15;
  const rightMargin = pageWidth - 15;
  const contentWidth = rightMargin - leftMargin;
  const bottomLimit = pageHeight - 25;
  const footerY = pageHeight - 11.5;
  const footerLineY = pageHeight - 16;

  const reportTitle = (effLahan && effResume && effSurat)
    ? `Laporan Terpadu - ${activeProjectName || 'Project Ventura'}`
    : `Laporan Progres - ${activeProjectName || 'Project Ventura'}`;

  doc.setProperties({
    title: reportTitle,
    subject: 'Laporan Eksekutif Pertanahan, Resume Proyek & Surat Instansi',
    author: 'Project Ventura GIS System',
  });

  const darkSlate: [number, number, number] = [15, 23, 42];
  const textGray: [number, number, number] = [71, 85, 105];
  const borderGray: [number, number, number] = [226, 232, 240];

  const today = new Date();
  const formattedDate = today.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WIB';

  let pageNum = 1;

  const drawFooter = (docInstance: jsPDF, pNum: number) => {
    docInstance.setFont('helvetica', 'italic');
    docInstance.setFontSize(7.2);
    docInstance.setTextColor(148, 163, 184);
    docInstance.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    docInstance.setLineWidth(0.15);
    docInstance.line(leftMargin, footerLineY, rightMargin, footerLineY);
    docInstance.text('Dokumen Resmi Terpadu Pertanahan  •  Project Ventura GIS ROW 150 kV', leftMargin, footerY);
    docInstance.text(`Dicetak: ${formattedDate}   |   Halaman ${pNum}`, rightMargin, footerY, { align: 'right' });
  };

  const drawRunningHeader = (docInstance: jsPDF, pNum: number) => {
    if (pNum === 1) return;
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(7.2);
    docInstance.setTextColor(100, 116, 139);
    docInstance.text('PROJECT VENTURA GIS  •  LAPORAN EKSEKUTIF PROGRES ROW 150 KV', leftMargin, 11);
    
    docInstance.setFont('helvetica', 'bold');
    docInstance.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    const shortP = (activeProjectName || 'PROYEK').toUpperCase();
    const truncP = shortP.length > 50 ? shortP.substring(0, 48) + '..' : shortP;
    docInstance.text(truncP, rightMargin, 11, { align: 'right' });

    docInstance.setDrawColor(226, 232, 240);
    docInstance.setLineWidth(0.15);
    docInstance.line(leftMargin, 14, rightMargin, 14);

    docInstance.setDrawColor(217, 119, 6);
    docInstance.setLineWidth(0.8);
    docInstance.line(leftMargin, 14, leftMargin + 32, 14);
  };

  const addNewPage = () => {
    doc.addPage();
    pageNum++;
    drawFooter(doc, pageNum);
    drawRunningHeader(doc, pageNum);
    return 21;
  };

  drawFooter(doc, pageNum);

  // Scope summary calculation
  const scopeSummary = `Cakupan Data: ${effLahan ? `${stats.total} Bidang (${stats.totalLuas.toLocaleString('id-ID')} m²)` : ''}${effLahan && effResume ? '  •  ' : ''}${effResume ? `${resumeSummary.totalDesa} Desa Resume` : ''}${(effLahan || effResume) && effSurat ? '  •  ' : ''}${effSurat ? `${suratSummary.total} Surat Instansi` : ''}`;
  const bannerTitle = (effLahan && effResume && effSurat)
    ? 'LAPORAN TERPADU PERTANAHAN, RESUME & SURAT'
    : (effResume && !effLahan
        ? 'LAPORAN RESUME TAHAPAN PROYEK & ADMINISTRASI'
        : 'LAPORAN PROGRES PERTANAHAN & PEMBEBASAN');

  let y = 14;
  const logos = await getOfficialLogos();

  // Render Header Page 1
  if (reportStyle === 'BUMN_OFFICIAL') {
    let danantaraRendered = false;
    if (logos.danantara) {
      try {
        doc.addImage(logos.danantara, 'PNG', leftMargin, 8.5, 36.1, 9.5, 'danantara_logo', 'FAST');
        danantaraRendered = true;
      } catch (e) {
        console.warn('Logo Danantara failed', e);
      }
    }
    if (!danantaraRendered) {
      doc.setFillColor(178, 34, 34);
      doc.rect(leftMargin, 9, 3, 7, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(leftMargin + 3.5, 9, 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('DANANTARA', leftMargin + 7, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('REPUBLIK INDONESIA', leftMargin + 7, 16.5);
    }

    let idsurveyRendered = false;
    const idsurveyX = leftMargin + (contentWidth / 2) - 15;
    if (logos.idsurvey) {
      try {
        doc.addImage(logos.idsurvey, 'PNG', idsurveyX, 8.5, 30.0, 9.2, 'idsurvey_logo', 'FAST');
        idsurveyRendered = true;
      } catch (e) {
        console.warn('Logo IDSurvey failed', e);
      }
    }
    if (!idsurveyRendered) {
      doc.setFillColor(2, 132, 199);
      doc.circle(idsurveyX + 4, 12, 2.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('id survey', idsurveyX + 9, 13.5);
    }

    let surveyorRendered = false;
    const surveyorX = rightMargin - 15.5;
    if (logos.surveyor) {
      try {
        doc.addImage(logos.surveyor, 'PNG', surveyorX, 8.0, 15.5, 11.0, 'surveyor_logo', 'FAST');
        surveyorRendered = true;
      } catch (e) {
        console.warn('Logo Surveyor failed', e);
      }
    }
    if (!surveyorRendered) {
      doc.setFillColor(15, 23, 42);
      doc.rect(surveyorX, 9, 3, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('SURVEYOR', surveyorX + 4.5, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('INDONESIA', surveyorX + 4.5, 16.5);
    }

    // Official double line
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, 20, rightMargin, 20);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.18);
    doc.line(leftMargin, 21.2, rightMargin, 21.2);

    // Title banner container (28.5mm height to fit 5 lines comfortably without overflow)
    const bannerY = 23.8;
    const bannerH = 28.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(leftMargin, bannerY, contentWidth, bannerH, 2, 2, 'FD');

    // Left Navy + Gold accent bar
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(leftMargin, bannerY, 2.5, bannerH, 1, 1, 'F');
    doc.setFillColor(217, 119, 6);
    doc.rect(leftMargin + 2.5, bannerY, 1.2, bannerH, 'F');

    // QC Status Badge
    const badgeW = 42;
    const badgeH = 5.2;
    const badgeX = rightMargin - badgeW - 3;
    const badgeY = bannerY + 3.2;
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(5, 150, 105);
    doc.text('STATUS: TERVERIFIKASI QC', badgeX + badgeW / 2, badgeY + 3.6, { align: 'center' });

    // Available text width on the left before reaching badge
    const maxLeftTextW = badgeX - (leftMargin + 6) - 3;

    // Line 1: Organization & Doc category
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('PROJECT VENTURA GIS & LAND MANAGEMENT SYSTEM  •  LAPORAN EKSEKUTIF RESMI', leftMargin + 6, bannerY + 5.2);

    // Line 2: Main Banner Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(15, 23, 42);
    const safeBannerTitle = doc.getTextWidth(bannerTitle) > maxLeftTextW
      ? bannerTitle.substring(0, 36) + '...'
      : bannerTitle;
    doc.text(safeBannerTitle, leftMargin + 6, bannerY + 10.8);

    // Line 3: Project Path
    doc.setFontSize(7.8);
    doc.setTextColor(180, 83, 9);
    const rawProjName = (activeProjectName || 'SEMUA JALUR TRANSMISI').toUpperCase();
    const projLine = `JALUR TRANSMISI: ${rawProjName} 150 KV`;
    const safeProjLine = doc.getTextWidth(projLine) > maxLeftTextW
      ? `JALUR TRANSMISI: ${rawProjName.substring(0, 30)}.. 150 KV`
      : projLine;
    doc.text(safeProjLine, leftMargin + 6, bannerY + 16.0);

    // Line 4: Registration Document Number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    const safeSlug = (activeProjectName || 'VENTURA').toUpperCase().replace(/[^A-Z0-9]+/g, '-').substring(0, 30);
    const docRefNo = `No. Registrasi: DOC/ROW-150KV/${today.getFullYear()}/${safeSlug}`;
    doc.text(docRefNo, leftMargin + 6, bannerY + 21.0);

    // Line 5: Scope Summary (Clean, 100% inside container)
    const maxScopeW = contentWidth - 12;
    let safeScopeText = scopeSummary;
    if (doc.getTextWidth(safeScopeText) > maxScopeW) {
      safeScopeText = `Cakupan Data: ${effLahan ? `${stats.total} Bidang` : ''}${effResume ? `  •  ${resumeSummary.totalDesa} Desa` : ''}${effSurat ? `  •  ${suratSummary.total} Surat` : ''}`;
    }
    doc.text(safeScopeText, leftMargin + 6, bannerY + 25.5);

    y = bannerY + bannerH + 5.5;
  } else {
    // MODERN_EXECUTIVE style
    doc.setFillColor(15, 23, 42);
    doc.rect(leftMargin, 11, contentWidth * 0.6, 2.2, 'F');
    doc.setFillColor(217, 119, 6);
    doc.rect(leftMargin + contentWidth * 0.6, 11, contentWidth * 0.4, 2.2, 'F');

    const bannerY = 15;
    const bannerH = 28;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(leftMargin, bannerY, contentWidth, bannerH, 2, 2, 'FD');

    doc.setFillColor(79, 70, 229);
    doc.roundedRect(leftMargin, bannerY, 2.5, bannerH, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text('PROJECT VENTURA GIS ROW 150 KV  •  DASHBOARD EXECUTIVE SUMMARY', leftMargin + 6, bannerY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const safeModTitle = doc.getTextWidth(bannerTitle) > contentWidth - 14
      ? bannerTitle.substring(0, 42) + '...'
      : bannerTitle;
    doc.text(safeModTitle, leftMargin + 6, bannerY + 11.2);

    doc.setFontSize(8.0);
    doc.setTextColor(79, 70, 229);
    const rawModProj = (activeProjectName || 'SEMUA JALUR').toUpperCase();
    const modProjLine = `JALUR PROYEK: ${rawModProj}`;
    const safeModProjLine = doc.getTextWidth(modProjLine) > contentWidth - 14
      ? `JALUR PROYEK: ${rawModProj.substring(0, 36)}...`
      : modProjLine;
    doc.text(safeModProjLine, leftMargin + 6, bannerY + 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    const safeSlug2 = (activeProjectName || 'VENTURA').toUpperCase().replace(/[^A-Z0-9]+/g, '-').substring(0, 30);
    doc.text(`No. Dokumen: DOC/ROW-150KV/${today.getFullYear()}/${safeSlug2}`, leftMargin + 6, bannerY + 21.2);

    const maxScopeW = contentWidth - 14;
    let safeScopeText = scopeSummary;
    if (doc.getTextWidth(safeScopeText) > maxScopeW) {
      safeScopeText = `Cakupan Data: ${effLahan ? `${stats.total} Bidang` : ''}${effResume ? `  •  ${resumeSummary.totalDesa} Desa` : ''}${effSurat ? `  •  ${suratSummary.total} Surat` : ''}`;
    }
    doc.text(safeScopeText, leftMargin + 6, bannerY + 25.5);

    y = bannerY + bannerH + 6;
  }

  let secCounter = 1;

  const drawSectionHeader = (title: string, submeta?: string) => {
    if (y + 16 > bottomLimit) {
      y = addNewPage();
    }
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(leftMargin, y, 6.5, 6.5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(secCounter), leftMargin + 3.25, y + 4.6, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(title, leftMargin + 9, y + 4.8);

    if (submeta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(submeta, rightMargin, y + 4.8, { align: 'right' });
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(leftMargin, y + 8, rightMargin, y + 8);
    
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.6);
    doc.line(leftMargin, y + 8, leftMargin + 24, y + 8);

    secCounter++;
    y += 12;
  };

  // ==========================================
  // SECTION 1: RINGKASAN CAPAIAN PERTANAHAN
  // ==========================================
  if (effLahan) {
    drawSectionHeader('RINGKASAN CAPAIAN PROYEK PERTANAHAN', `${stats.total} Bidang Terdata`);

    const kpiGap = 3;
    const kpiCardW = (contentWidth - (kpiGap * 3)) / 4;
    const kpiCardH = 17;

    const drawKpiCard = (x: number, title: string, value: string, accentRgb: [number, number, number]) => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, kpiCardW, kpiCardH, 1.8, 1.8, 'FD');
      
      doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.roundedRect(x, y, 1.5, kpiCardH, 0.8, 0.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.8);
      doc.setTextColor(15, 23, 42);
      doc.text(value, x + kpiCardW / 2, y + 7.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(title, x + kpiCardW / 2, y + 13.2, { align: 'center' });
    };

    drawKpiCard(leftMargin, 'TOTAL BIDANG LAHAN', String(stats.total), [79, 70, 229]);
    drawKpiCard(leftMargin + (kpiCardW + kpiGap), 'TOTAL LUAS LAHAN', `${stats.totalLuas.toLocaleString('id-ID')} m²`, [2, 132, 199]);
    drawKpiCard(leftMargin + (kpiCardW + kpiGap) * 2, 'BANGUNAN TERDATA', `${stats.totalBuildings} Unit`, [245, 158, 11]);
    drawKpiCard(leftMargin + (kpiCardW + kpiGap) * 3, 'POHON & TANAMAN', `${stats.totalPlantsCount} Pohon`, [16, 185, 129]);

    y += kpiCardH + 4.5;

    // Grand Progress Bar
    const grandSelesaiPct = stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0;
    const grandKonsinyasiPct = stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0;
    const grandBelumPct = stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0;

    const barCardH = 18;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(leftMargin, y, contentWidth, barCardH, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text('AKUMULASI PROGRES PEMBERKASAN JALUR AKTIF:', leftMargin + 5, y + 4.8);

    const grandBarX = leftMargin + 5;
    const grandBarY = y + 6.8;
    const grandBarW = contentWidth - 10;
    const grandBarH = 4;

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(grandBarX, grandBarY, grandBarW, grandBarH, 1, 1, 'F');

    const grandSWidth = (grandSelesaiPct / 100) * grandBarW;
    const grandKWidth = (grandKonsinyasiPct / 100) * grandBarW;
    const grandBWidth = (grandBelumPct / 100) * grandBarW;

    let currentGrandX = grandBarX;
    if (grandSWidth > 0) {
      doc.setFillColor(16, 185, 129);
      doc.rect(currentGrandX, grandBarY, grandSWidth, grandBarH, 'F');
      currentGrandX += grandSWidth;
    }
    if (grandKWidth > 0) {
      doc.setFillColor(245, 158, 11);
      doc.rect(currentGrandX, grandBarY, grandKWidth, grandBarH, 'F');
      currentGrandX += grandKWidth;
    }
    if (grandBWidth > 0) {
      doc.setFillColor(244, 63, 94);
      doc.rect(currentGrandX, grandBarY, grandBWidth, grandBarH, 'F');
    }

    const legGap = grandBarW / 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    doc.setFillColor(16, 185, 129);
    doc.circle(grandBarX + 2, y + 14.5, 1.2, 'F');
    doc.setTextColor(16, 185, 129);
    doc.text(`Selesai: ${stats.pemberkasanSelesai} (${grandSelesaiPct}%)`, grandBarX + 5, y + 15.2);

    doc.setFillColor(245, 158, 11);
    doc.circle(grandBarX + legGap + 2, y + 14.5, 1.2, 'F');
    doc.setTextColor(245, 158, 11);
    doc.text(`Konsinyasi: ${stats.pemberkasanKonsinyasi} (${grandKonsinyasiPct}%)`, grandBarX + legGap + 5, y + 15.2);

    doc.setFillColor(244, 63, 94);
    doc.circle(grandBarX + (legGap * 2) + 2, y + 14.5, 1.2, 'F');
    doc.setTextColor(244, 63, 94);
    doc.text(`Belum Selesai: ${stats.pemberkasanBelumSelesai} (${grandBelumPct}%)`, grandBarX + (legGap * 2) + 5, y + 15.2);

    y += barCardH + 5.5;

    // SECTION 2: PROGRES PEMBERKASAN & INTEGRASI TRABAS
    drawSectionHeader('PROGRES PEMBERKASAN & INTEGRASI TRABAS');

    const cardW = (contentWidth - 5) / 2;
    const cardH = 21.5;

    // Card A
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(leftMargin, y, cardW, cardH, 1.8, 1.8, 'FD');
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(leftMargin, y, 1.5, cardH, 0.8, 0.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(15, 23, 42);
    doc.text('A. PEMBERKASAN LAPANGAN', leftMargin + 5, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text('• Berkas Selesai Validasi:', leftMargin + 5, y + 9.6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(`${stats.pemberkasanSelesai} Bidang (${grandSelesaiPct}%)`, leftMargin + cardW - 4, y + 9.6, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('• Berkas Konsinyasi:', leftMargin + 5, y + 14.0);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 158, 11);
    doc.text(`${stats.pemberkasanKonsinyasi} Bidang (${grandKonsinyasiPct}%)`, leftMargin + cardW - 4, y + 14.0, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('• Belum Diproses:', leftMargin + 5, y + 18.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(244, 63, 94);
    doc.text(`${stats.pemberkasanBelumSelesai} Bidang (${grandBelumPct}%)`, leftMargin + cardW - 4, y + 18.2, { align: 'right' });

    // Card B
    const cardBX = leftMargin + cardW + 5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(cardBX, y, cardW, cardH, 1.8, 1.8, 'FD');
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(cardBX, y, 1.5, cardH, 0.8, 0.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(15, 23, 42);
    doc.text('B. INTEGRASI PORTAL TRABAS PLN', cardBX + 5, y + 5);

    const trabasPct = stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text('• Sudah Terunggah (Upload):', cardBX + 5, y + 9.6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text(`${stats.trabasSudah} Bidang (${trabasPct}%)`, cardBX + cardW - 4, y + 9.6, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('• Belum Terunggah:', cardBX + 5, y + 14.0);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text(`${stats.trabasBelum} Bidang (${100 - trabasPct}%)`, cardBX + cardW - 4, y + 14.0, { align: 'right' });

    const miniBarW = cardW - 10;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(cardBX + 5, y + 16.5, miniBarW, 2.5, 0.5, 0.5, 'F');
    if (trabasPct > 0) {
      doc.setFillColor(59, 130, 246);
      doc.rect(cardBX + 5, y + 16.5, (trabasPct / 100) * miniBarW, 2.5, 'F');
    }

    y += cardH + 6;

    // SECTION 3: CAPAIAN PROGRES PER WILAYAH DESA (2-KOLOM KOMPAK UNTUK MENGHEMAT LEMBAR)
    drawSectionHeader('CAPAIAN PROGRES PER WILAYAH DESA (FORMAT 2-KOLOM KOMPAK)', `${desaProgressData.length} Desa Terdata`);

    const gridColGap = 4;
    const gridCardW = (contentWidth - gridColGap) / 2;
    const gridCardH = 13.0;

    for (let i = 0; i < desaProgressData.length; i += 2) {
      if (y + gridCardH > bottomLimit) {
        y = addNewPage();
      }

      const pair = [desaProgressData[i], desaProgressData[i + 1]].filter(Boolean);

      pair.forEach((desa, pairIdx) => {
        const colX = pairIdx === 0 ? leftMargin : leftMargin + gridCardW + gridColGap;

        // Container card
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.18);
        doc.roundedRect(colX, y, gridCardW, gridCardH, 1.2, 1.2, 'FD');

        // Left accent indicator bar
        doc.setFillColor(79, 70, 229);
        doc.roundedRect(colX, y, 1.2, gridCardH, 0.6, 0.6, 'F');

        // Top line: Index + Desa Name & Total Bidang
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        const maxDesaChars = isLandscape ? 24 : 16;
        const dName = desa.name.length > maxDesaChars ? desa.name.substring(0, maxDesaChars - 2) + '..' : desa.name;
        doc.text(`${i + pairIdx + 1}. ${dName.toUpperCase()}`, colX + 3.5, y + 3.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        doc.text(`(${desa.total} Bidang)`, colX + gridCardW - 3, y + 3.8, { align: 'right' });

        // Line 2: Berkas Progress
        const sPctDesa = desa.total > 0 ? Math.round((desa.selesai / desa.total) * 100) : 0;
        const tPctDesa = desa.total > 0 ? Math.round((desa.trabasSudah / desa.total) * 100) : 0;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(71, 85, 105);
        doc.text('Berkas:', colX + 3.5, y + 7.4);

        const barX = colX + 16;
        const barW = gridCardW - 47;
        const barH = 1.9;

        const sW = desa.total > 0 ? (desa.selesai / desa.total) * barW : 0;
        const kW = desa.total > 0 ? (desa.konsinyasi / desa.total) * barW : 0;
        const bW = desa.total > 0 ? (desa.belum / desa.total) * barW : 0;

        let cX = barX;
        if (sW > 0) {
          doc.setFillColor(16, 185, 129);
          doc.rect(cX, y + 5.8, sW, barH, 'F');
          cX += sW;
        }
        if (kW > 0) {
          doc.setFillColor(245, 158, 11);
          doc.rect(cX, y + 5.8, kW, barH, 'F');
          cX += kW;
        }
        if (bW > 0) {
          doc.setFillColor(244, 63, 94);
          doc.rect(cX, y + 5.8, bW, barH, 'F');
        }
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.1);
        doc.rect(barX, y + 5.8, barW, barH, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.0);
        doc.setTextColor(16, 185, 129);
        doc.text(`${sPctDesa}%`, colX + gridCardW - 3, y + 7.4, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.4);
        doc.setTextColor(100, 116, 139);
        doc.text(`S:${desa.selesai} K:${desa.konsinyasi} B:${desa.belum}`, colX + gridCardW - 13, y + 7.4, { align: 'right' });

        // Line 3: TRABAS Progress
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(71, 85, 105);
        doc.text('TRABAS:', colX + 3.5, y + 11.2);

        const trabasSW = desa.total > 0 ? (desa.trabasSudah / desa.total) * barW : 0;
        const trabasBW = desa.total > 0 ? (desa.trabasBelum / desa.total) * barW : 0;

        doc.setFillColor(59, 130, 246);
        doc.rect(barX, y + 9.6, trabasSW, barH, 'F');
        doc.setFillColor(226, 232, 240);
        doc.rect(barX + trabasSW, y + 9.6, trabasBW, barH, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.1);
        doc.rect(barX, y + 9.6, barW, barH, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.0);
        doc.setTextColor(59, 130, 246);
        doc.text(`${tPctDesa}%`, colX + gridCardW - 3, y + 11.2, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.4);
        doc.setTextColor(100, 116, 139);
        doc.text(`Upload:${desa.trabasSudah}`, colX + gridCardW - 13, y + 11.2, { align: 'right' });
      });

      y += gridCardH + 2.0;
    }

    y += 4;

    // SECTION 4: KLASIFIKASI ALAS HAK / BUKTI KEPEMILIKAN LAHAN
    if (y + 55 > bottomLimit) {
      y = addNewPage();
    }
    drawSectionHeader('KLASIFIKASI ALAS HAK / BUKTI KEPEMILIKAN LAHAN', '9 Klasifikasi Yuridis');

    const hexToRgb = (hex: string): [number, number, number] => {
      const cleanHex = hex.replace('#', '');
      const num = parseInt(cleanHex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };

    const pieCenterX = leftMargin + (isLandscape ? 38 : 28);
    const pieCenterY = y + 23;
    const radius = isLandscape ? 18 : 16;

    let currentAngle = 0;
    const totalAnalyzed = alasHakAnalysis.totalAnalyzed || 1;

    alasHakAnalysis.items.forEach(item => {
      if (item.count > 0) {
        const sweepAngle = (item.count / totalAnalyzed) * 360;
        const rgb = hexToRgb(item.color);
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        const steps = Math.max(2, Math.ceil(sweepAngle / 2));
        for (let i = 0; i < steps; i++) {
          const a1 = (currentAngle + (i / steps) * sweepAngle - 90) * (Math.PI / 180);
          const a2 = (currentAngle + ((i + 1) / steps) * sweepAngle - 90) * (Math.PI / 180);
          const x1 = pieCenterX + radius * Math.cos(a1);
          const y1 = pieCenterY + radius * Math.sin(a1);
          const x2 = pieCenterX + radius * Math.cos(a2);
          const y2 = pieCenterY + radius * Math.sin(a2);
          doc.triangle(pieCenterX, pieCenterY, x1, y1, x2, y2, 'F');
        }
        currentAngle += sweepAngle;
      }
    });

    doc.setFillColor(255, 255, 255);
    doc.circle(pieCenterX, pieCenterY, radius * 0.52, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(`${totalAnalyzed}`, pieCenterX, pieCenterY + 1, { align: 'center' });
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text('BIDANG', pieCenterX, pieCenterY + 4, { align: 'center' });

    // Legend Table
    const legendX = pieCenterX + radius + 14;
    const legendW = rightMargin - legendX;
    let legendY = y;

    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.roundedRect(legendX, legendY, legendW, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text('Kategori Alas Hak (9 Klasifikasi)', legendX + 3, legendY + 4.2);
    doc.text('Jumlah', legendX + legendW - 28, legendY + 4.2, { align: 'right' });
    doc.text('Persentase', legendX + legendW - 4, legendY + 4.2, { align: 'right' });

    legendY += 6;

    alasHakAnalysis.items.forEach((item, idx) => {
      const rowH = 4.4;
      const rgb = hexToRgb(item.color);

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(legendX, legendY, legendW, rowH, 'F');

      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(legendX + 3, legendY + 1.1, 2.8, 2.3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      const shortTxt = `${item.code}. ${item.label}`;
      const maxChar = isLandscape ? 50 : 34;
      const truncatedLabel = shortTxt.length > maxChar ? shortTxt.substring(0, maxChar - 2) + '..' : shortTxt;
      doc.text(truncatedLabel, legendX + 8, legendY + 3.1);

      doc.setFont('helvetica', 'bold');
      doc.text(`${item.count}`, legendX + legendW - 28, legendY + 3.1, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(`${item.percentage}%`, legendX + legendW - 4, legendY + 3.1, { align: 'right' });

      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.1);
      doc.line(legendX, legendY + rowH, legendX + legendW, legendY + rowH);

      legendY += rowH;
    });

    y = Math.max(pieCenterY + radius + 8, legendY + 5);
  }

  // ==========================================
  // SECTION 5: RESUME TAHAPAN KOMPENSASI PER DESA
  // ==========================================
  if (effResume) {
    if (y + 45 > bottomLimit) {
      y = addNewPage();
    }
    drawSectionHeader('RESUME TAHAPAN KOMPENSASI PER DESA (6 TAHAPAN)', `${combinedVillageResumes.length} Desa Terdaftar`);

    const resCardGap = 3;
    const resCardW = (contentWidth - (resCardGap * 3)) / 4;
    const resCardH = 15;

    const drawResKpi = (x: number, title: string, value: string, textRgb: [number, number, number]) => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, resCardW, resCardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
      doc.text(value, x + resCardW / 2, y + 6.8, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(title, x + resCardW / 2, y + 12, { align: 'center' });
    };

    drawResKpi(leftMargin, 'TOTAL DESA', `${resumeSummary.totalDesa} Desa`, [15, 23, 42]);
    drawResKpi(leftMargin + (resCardW + resCardGap), 'TUNTAS 100%', `${resumeSummary.tuntasDesa} Desa`, [16, 185, 129]);
    drawResKpi(leftMargin + (resCardW + resCardGap) * 2, 'DALAM PROSES', `${resumeSummary.prosesDesa} Desa`, [245, 158, 11]);
    drawResKpi(leftMargin + (resCardW + resCardGap) * 3, 'RATA-RATA PROGRES', `${resumeSummary.avgProgress}%`, [79, 70, 229]);

    y += resCardH + 4;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text('Tahapan: 1. Sos. Pendahuluan | 2. Sos. Pengumuman Inv. | 3. BAPT Register | 4. Sos. Penyampaian Nilai | 5. Sos. Pembayaran | 6. Bush Clearing', leftMargin, y);
    y += 4;

    const resColNoW = 8;
    const resColDesaW = isLandscape ? 48 : 34;
    const resColPctW = isLandscape ? 24 : 18;
    const totalStagesW = contentWidth - resColNoW - resColDesaW - resColPctW;
    const stageW = totalStagesW / 6;

    const drawResumeTableHeader = (curY: number) => {
      doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.roundedRect(leftMargin, curY, contentWidth, 7.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('No', leftMargin + 2, curY + 5);
      doc.text('Wilayah Desa', leftMargin + resColNoW + 2, curY + 5);
      doc.text('1. Sos Awal', leftMargin + resColNoW + resColDesaW + (stageW * 0) + 1, curY + 5);
      doc.text('2. Pengumuman', leftMargin + resColNoW + resColDesaW + (stageW * 1) + 1, curY + 5);
      doc.text('3. BAPT Reg', leftMargin + resColNoW + resColDesaW + (stageW * 2) + 1, curY + 5);
      doc.text('4. Nilai', leftMargin + resColNoW + resColDesaW + (stageW * 3) + 1, curY + 5);
      doc.text('5. Bayar', leftMargin + resColNoW + resColDesaW + (stageW * 4) + 1, curY + 5);
      doc.text('6. Clearing', leftMargin + resColNoW + resColDesaW + (stageW * 5) + 1, curY + 5);
      doc.text('Capaian', rightMargin - 2, curY + 5, { align: 'right' });
    };

    drawResumeTableHeader(y);
    y += 7.5;

    const stagesKeys = [
      'baSosialisasiAwal',
      'baPengumuman',
      'lampiranBapt',
      'baPenyampaianNilai',
      'baSerahTerimaRekening',
      'bushClearing'
    ];

    combinedVillageResumes.forEach((vr, vIdx) => {
      const rowH = 8.6;
      if (y + rowH > bottomLimit) {
        y = addNewPage();
        drawResumeTableHeader(y);
        y += 7.5;
      }

      if (vIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(leftMargin, y, contentWidth, rowH, 'F');

      doc.setFillColor(79, 70, 229);
      doc.rect(leftMargin, y, 1, rowH, 'F');

      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.12);
      doc.line(leftMargin, y + rowH, rightMargin, y + rowH);

      // No
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(String(vIdx + 1), leftMargin + 2, y + 4.6);

      // Desa Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      const maxCharD = isLandscape ? 24 : 16;
      const dName = vr.desaName.length > maxCharD ? vr.desaName.substring(0, maxCharD - 2) + '..' : vr.desaName;
      doc.text(dName, leftMargin + resColNoW + 2, y + 4.0);

      const desaRecs = records.filter(r => (r.DESA || '').trim().toUpperCase() === vr.desaName.trim().toUpperCase());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(`(${desaRecs.length} Bidang)`, leftMargin + resColNoW + 2, y + 7.4);

      // 6 Stages
      let pts = 0;
      stagesKeys.forEach((key, sIdx) => {
        const sX = leftMargin + resColNoW + resColDesaW + (sIdx * stageW);
        const docObj = (vr as any)[key];
        const stStatus = docObj?.status || 'BELUM';
        let bg: [number, number, number] = [241, 245, 249];
        let fg: [number, number, number] = [100, 116, 139];
        let label = 'Belum';

        if (stStatus === 'SELESAI') {
          bg = [16, 185, 129];
          fg = [255, 255, 255];
          label = '✓ Selesai';
          pts += 100 / 6;
        } else if (stStatus === 'PROSES') {
          bg = [245, 158, 11];
          fg = [255, 255, 255];
          label = '◷ Proses';
          pts += 50 / 6;
        }

        const pillW = Math.min(stageW - 1.5, 22);
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.roundedRect(sX + 0.8, y + 1.4, pillW, 3.2, 0.6, 0.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(fg[0], fg[1], fg[2]);
        doc.text(label, sX + 0.8 + (pillW / 2), y + 3.8, { align: 'center' });

        if (docObj?.date) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(4.8);
          doc.setTextColor(textGray[0], textGray[1], textGray[2]);
          const rawD = String(docObj.date);
          const cleanD = rawD.length > 10 ? rawD.substring(0, 10) : rawD;
          doc.text(cleanD, sX + 0.8 + (pillW / 2), y + 7.2, { align: 'center' });
        }
      });

      // Capaian %
      const vPct = Math.min(100, Math.round(pts));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(16, 185, 129);
      doc.text(`${vPct}%`, rightMargin - 4, y + 4.2, { align: 'right' });

      const pctBarW = resColPctW - 6;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(rightMargin - pctBarW - 2, y + 5.8, pctBarW, 1.6, 0.5, 0.5, 'F');
      if (vPct > 0) {
        doc.setFillColor(16, 185, 129);
        doc.rect(rightMargin - pctBarW - 2, y + 5.8, (vPct / 100) * pctBarW, 1.6, 'F');
      }

      y += rowH;
    });

    y += 5;
  }

  // ==========================================
  // SECTION 6: MONITORING SURAT INSTANSI
  // ==========================================
  if (effSurat) {
    if (y + 45 > bottomLimit) {
      y = addNewPage();
    }
    drawSectionHeader('AGENDA & MONITORING SURAT INSTANSI TERKAIT', `${suratSummary.total} Berkas Terdata`);

    const surCardGap = 3;
    const surCardW = (contentWidth - (surCardGap * 3)) / 4;
    const surCardH = 15;

    const drawSurKpi = (x: number, title: string, value: string, textRgb: [number, number, number]) => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, surCardW, surCardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
      doc.text(value, x + surCardW / 2, y + 6.8, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(title, x + surCardW / 2, y + 12, { align: 'center' });
    };

    drawSurKpi(leftMargin, 'TOTAL SURAT', `${suratSummary.total} Berkas`, [15, 23, 42]);
    drawSurKpi(leftMargin + (surCardW + surCardGap), 'STATUS SELESAI', `${suratSummary.selesai} Selesai`, [16, 185, 129]);
    drawSurKpi(leftMargin + (surCardW + surCardGap) * 2, 'TERKIRIM / PROSES', `${suratSummary.onProgress} Berkas`, [59, 130, 246]);
    drawSurKpi(leftMargin + (surCardW + surCardGap) * 3, 'TINDAK LANJUT', `${suratSummary.tindakLanjut} Berkas`, [244, 63, 94]);

    y += surCardH + 5;

    if (agencyLetters.length === 0) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(leftMargin, y, contentWidth, 14, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('Belum ada catatan surat masuk / keluar dinas/instansi untuk jalur proyek ini.', leftMargin + 6, y + 8.5);
      y += 18;
    } else {
      const sColNoW = 8;
      const sColInstW = isLandscape ? 58 : 42;
      const sColNoSW = isLandscape ? 52 : 38;
      const sColPerW = isLandscape ? 70 : 42;
      const sColStatW = isLandscape ? 28 : 22;
      const sColNotW = contentWidth - sColNoW - sColInstW - sColNoSW - sColPerW - sColStatW;

      const drawSuratHeader = (curY: number) => {
        doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.roundedRect(leftMargin, curY, contentWidth, 7.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text('No', leftMargin + 2, curY + 5);
        doc.text('Instansi Mitra / Tujuan', leftMargin + sColNoW + 2, curY + 5);
        doc.text('No Surat & Tanggal', leftMargin + sColNoW + sColInstW + 2, curY + 5);
        doc.text('Perihal / Keperluan', leftMargin + sColNoW + sColInstW + sColNoSW + 2, curY + 5);
        doc.text('Status', leftMargin + sColNoW + sColInstW + sColNoSW + sColPerW + 2, curY + 5);
        doc.text('Tindak Lanjut / PIC', rightMargin - 2, curY + 5, { align: 'right' });
      };

      drawSuratHeader(y);
      y += 7.5;

      agencyLetters.forEach((l, lIdx) => {
        const rowH = 11;
        if (y + rowH > bottomLimit) {
          y = addNewPage();
          drawSuratHeader(y);
          y += 7.5;
        }

        if (lIdx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(leftMargin, y, contentWidth, rowH, 'F');

        doc.setFillColor(59, 130, 246);
        doc.rect(leftMargin, y, 1, rowH, 'F');

        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.12);
        doc.line(leftMargin, y + rowH, rightMargin, y + rowH);

        // No
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.text(String(lIdx + 1), leftMargin + 2, y + 5.5);

        // Instansi
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        const maxInst = isLandscape ? 32 : 20;
        const instText = l.instansiName.length > maxInst ? l.instansiName.substring(0, maxInst - 2) + '..' : l.instansiName;
        doc.text(instText, leftMargin + sColNoW + 2, y + 4.8);

        if (l.picInstansi) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(textGray[0], textGray[1], textGray[2]);
          const maxPic = isLandscape ? 30 : 18;
          doc.text(`PIC: ${l.picInstansi.length > maxPic ? l.picInstansi.substring(0, maxPic - 2) + '..' : l.picInstansi}`, leftMargin + sColNoW + 2, y + 8.5);
        }

        // No Surat & Tanggal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        const maxNoS = isLandscape ? 30 : 18;
        const noS = l.noSurat.length > maxNoS ? l.noSurat.substring(0, maxNoS - 2) + '..' : l.noSurat;
        doc.text(noS, leftMargin + sColNoW + sColInstW + 2, y + 4.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        doc.text(`Tgl: ${l.tanggalSurat || '-'}`, leftMargin + sColNoW + sColInstW + 2, y + 8.5);

        // Perihal
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(51, 65, 85);
        const maxPer = isLandscape ? 45 : 24;
        const perihalShort = l.perihal.length > maxPer ? l.perihal.substring(0, maxPer - 2) + '..' : l.perihal;
        doc.text(perihalShort, leftMargin + sColNoW + sColInstW + sColNoSW + 2, y + 5.5);

        // Status Badge
        let sBg: [number, number, number] = [59, 130, 246];
        let sLabel = 'TERKIRIM';
        if (l.status === 'SELESAI') {
          sBg = [16, 185, 129];
          sLabel = 'SELESAI';
        } else if (l.status === 'ON_PROGRESS') {
          sBg = [245, 158, 11];
          sLabel = 'PROSES';
        } else if (l.status === 'TINDAK_LANJUT') {
          sBg = [244, 63, 94];
          sLabel = 'T. LANJUT';
        }

        const statX = leftMargin + sColNoW + sColInstW + sColNoSW + sColPerW + 2;
        doc.setFillColor(sBg[0], sBg[1], sBg[2]);
        doc.roundedRect(statX, y + 2.8, sColStatW - 4, 4.2, 0.8, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(255, 255, 255);
        doc.text(sLabel, statX + (sColStatW - 4) / 2, y + 5.8, { align: 'center' });

        // Catatan
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        const maxNot = isLandscape ? 35 : 20;
        const noteText = l.catatanTindakLanjut || '-';
        const noteShort = noteText.length > maxNot ? noteText.substring(0, maxNot - 2) + '..' : noteText;
        doc.text(noteShort, rightMargin - 2, y + 5.5, { align: 'right' });

        y += rowH;
      });

      y += 7;
    }
  }

  // ==========================================
  // OFFICIAL CLOSURE & SYSTEM SEAL (MURNI SEBATAS LAPORAN)
  // ==========================================
  if (y + 24 > bottomLimit) {
    y = addNewPage();
  } else {
    y += 6;
  }

  const closureH = 16;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(leftMargin, y, contentWidth, closureH, 1.8, 1.8, 'FD');

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(leftMargin, y, 2.0, closureH, 0.8, 0.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text('DOKUMEN RESMI STATUS & MONITORING PROGRES PERTANAHAN', leftMargin + 5, y + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text('Laporan ini diterbitkan secara otomatis oleh Project Ventura GIS & Land Management System sebagai dokumen monitoring', leftMargin + 5, y + 9.5);
  doc.text('eksekutif terpadu tanpa memerlukan lembar pengesahan basah (murni sebatas laporan status terkini).', leftMargin + 5, y + 13.5);

  const sealW = 42;
  const sealX = rightMargin - sealW - 2;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(sealX, y + 2.8, sealW, 10.4, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0);
  doc.setTextColor(71, 85, 105);
  doc.text('VERIFIED GIS REPORT', sealX + sealW / 2, y + 6.8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(148, 163, 184);
  doc.text(formattedDate, sealX + sealW / 2, y + 10.5, { align: 'center' });

  y += closureH + 4;

  // Legal footer note
  if (y + 10 > bottomLimit) {
    y = addNewPage();
  }
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.2);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text('* Dokumen ini dihasilkan secara otomatis oleh Project Ventura GIS & Land Management System.', leftMargin, y);
  doc.text('* Terintegrasi: Rekap Lahan & Bidang, Resume Tahapan Proyek Desa, dan Monitoring Agenda Surat Instansi.', leftMargin, y + 3.8);

  return doc;
}
