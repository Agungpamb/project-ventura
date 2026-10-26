import React, { useRef, useState, useEffect } from 'react';
import { 
  X, Check, Trash2, Upload, PenTool, Image as ImageIcon, 
  RotateCcw, Sparkles, AlertCircle, FileCheck
} from 'lucide-react';

export type SignatureType = 
  | 'TTD_SAKSI_1'
  | 'TTD_SAKSI_2'
  | 'TTD_TIM_1'
  | 'TTD_TIM_2'
  | 'TTD_KADES'
  | 'CAP_DESA'
  | 'TTD_PEMILIK';

export interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: SignatureType;
  title: string;
  personName?: string;
  initialImage?: string;
  onSave: (type: SignatureType, dataUrl: string) => Promise<void> | void;
}

export const SIGNATURE_CONFIGS: { [key in SignatureType]: { label: string; desc: string; isSquare: boolean; width: number; height: number; defaultColor: string } } = {
  TTD_SAKSI_1: {
    label: 'Tanda Tangan Saksi 1',
    desc: 'Tanda tangan digital Saksi Batas / Lingkungan 1 (Ukuran pas formulir: 400 × 200 px)',
    isSquare: false,
    width: 400,
    height: 200,
    defaultColor: '#1e3a8a' // Biru Tua
  },
  TTD_SAKSI_2: {
    label: 'Tanda Tangan Saksi 2',
    desc: 'Tanda tangan digital Saksi Batas / Lingkungan 2 (Ukuran pas formulir: 400 × 200 px)',
    isSquare: false,
    width: 400,
    height: 200,
    defaultColor: '#1e3a8a'
  },
  TTD_TIM_1: {
    label: 'Tanda Tangan Tim 1',
    desc: 'Tanda tangan Petugas Satgas Lapangan 1 (Ukuran pas formulir: 400 × 200 px)',
    isSquare: false,
    width: 400,
    height: 200,
    defaultColor: '#1e3a8a'
  },
  TTD_TIM_2: {
    label: 'Tanda Tangan Tim 2',
    desc: 'Tanda tangan Petugas Satgas Lapangan 2 (Ukuran pas formulir: 400 × 200 px)',
    isSquare: false,
    width: 400,
    height: 200,
    defaultColor: '#1e3a8a'
  },
  TTD_PEMILIK: {
    label: 'Tanda Tangan Pemilik / Pihak Berhak',
    desc: 'Tanda tangan Warga / Ahli Waris Pihak Berhak (Ukuran pas formulir: 400 × 200 px)',
    isSquare: false,
    width: 400,
    height: 200,
    defaultColor: '#0f172a' // Hitam
  },
  TTD_KADES: {
    label: 'Tanda Tangan Kepala Desa',
    desc: 'Tanda tangan Pengesahan Kepala Desa / Lurah (Ukuran pas formulir: 450 × 225 px)',
    isSquare: false,
    width: 450,
    height: 225,
    defaultColor: '#1e3a8a'
  },
  CAP_DESA: {
    label: 'Cap / Stempel Resmi Desa',
    desc: 'Cap Stempel Basah Pemerintahan Desa (Ukuran pas formulir: 300 × 300 px, format 1:1)',
    isSquare: true,
    width: 300,
    height: 300,
    defaultColor: '#6d28d9' // Ungu / Violet khas stempel desa
  }
};

export default function SignatureModal({
  isOpen,
  onClose,
  type,
  title,
  personName,
  initialImage,
  onSave
}: SignatureModalProps) {
  const config = SIGNATURE_CONFIGS[type] || SIGNATURE_CONFIGS.TTD_PEMILIK;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const [penColor, setPenColor] = useState<string>(config.defaultColor);
  const [penWidth, setPenWidth] = useState<number>(type === 'CAP_DESA' ? 3.5 : 2.5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(initialImage || null);
  const [autoRemoveWhiteBg, setAutoRemoveWhiteBg] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Initialize or reset canvas
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastPoint.current = null;
    setHasContent(false);
  };

  useEffect(() => {
    if (isOpen) {
      setPenColor(config.defaultColor);
      setUploadedImagePreview(initialImage || null);
      setTimeout(() => {
        initCanvas();
      }, 50);
    }
  }, [isOpen, type, config.defaultColor, initialImage]);

  if (!isOpen) return null;

  // Drawing handlers (mouse and touch)
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleStartDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e);
    lastPoint.current = coords;
    setIsDrawing(true);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(coords.x, coords.y, penWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = penColor;
      ctx.fill();
      setHasContent(true);
    }
  };

  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPoint.current) return;

    const currentCoords = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentCoords.x, currentCoords.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPoint.current = currentCoords;
    setHasContent(true);
  };

  const handleStopDrawing = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  // Convert uploaded image and optionally strip white background to transparent PNG
  const processUploadedFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = config.width;
        tempCanvas.height = config.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;

        // Draw image centered and scaled keeping aspect ratio
        ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        const scale = Math.min(tempCanvas.width / img.width, tempCanvas.height / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const nx = (tempCanvas.width - nw) / 2;
        const ny = (tempCanvas.height - nh) / 2;

        ctx.drawImage(img, nx, ny, nw, nh);

        if (autoRemoveWhiteBg) {
          // Transparency filter: turn near-white pixels transparent
          const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // If color is very bright (paper white / off-white), set alpha to 0
            if (r > 215 && g > 215 && b > 215) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const pngUrl = tempCanvas.toDataURL('image/png');
        setUploadedImagePreview(pngUrl);
        setHasContent(true);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async () => {
    setIsProcessing(true);
    try {
      let finalDataUrl = '';
      if (activeTab === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        finalDataUrl = canvas.toDataURL('image/png');
      } else {
        if (!uploadedImagePreview) return;
        finalDataUrl = uploadedImagePreview;
      }

      await onSave(type, finalDataUrl);
      onClose();
    } catch (err: any) {
      console.error("Gagal menyimpan tanda tangan:", err);
      alert("Gagal menyimpan tanda tangan: " + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    if (activeTab === 'draw') {
      initCanvas();
    } else {
      setUploadedImagePreview(null);
      setHasContent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${type === 'CAP_DESA' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                {title || config.label}
              </h2>
              {personName && (
                <p className="text-xs text-amber-300 font-medium">
                  {personName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch: Draw vs Upload */}
        <div className="flex border-b border-white/10 bg-slate-950/30 px-5 pt-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`pb-2.5 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'draw'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Gores Tangan Langsung</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Unggah Foto / Gambar Scan</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {config.desc}
          </p>

          {activeTab === 'draw' ? (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/50 rounded-xl border border-white/5">
                {/* Pen colors */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Warna Tinta:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { color: '#1e3a8a', label: 'Biru Tua (Dokumen)' },
                      { color: '#0f172a', label: 'Hitam' },
                      { color: '#4338ca', label: 'Indigo' },
                      { color: '#6d28d9', label: 'Ungu (Stempel)' },
                      { color: '#b91c1c', label: 'Merah' }
                    ].map((item) => (
                      <button
                        key={item.color}
                        type="button"
                        onClick={() => setPenColor(item.color)}
                        title={item.label}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          penColor === item.color ? 'scale-110 border-amber-400 ring-2 ring-amber-400/30' : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: item.color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Pen width */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ketebalan:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { width: 1.8, label: 'Halus' },
                      { width: 2.8, label: 'Sedang' },
                      { width: 4.2, label: 'Tebal' }
                    ].map((sz) => (
                      <button
                        key={sz.width}
                        type="button"
                        onClick={() => setPenWidth(sz.width)}
                        className={`px-2 py-0.5 text-[10px] rounded-md font-semibold transition-colors cursor-pointer ${
                          penWidth === sz.width
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawing Canvas */}
              <div className="relative border-2 border-dashed border-white/20 rounded-2xl bg-white overflow-hidden shadow-inner flex items-center justify-center select-none touch-none">
                <canvas
                  ref={canvasRef}
                  width={config.width}
                  height={config.height}
                  onMouseDown={handleStartDrawing}
                  onMouseMove={handleDrawMove}
                  onMouseUp={handleStopDrawing}
                  onMouseLeave={handleStopDrawing}
                  onTouchStart={handleStartDrawing}
                  onTouchMove={handleDrawMove}
                  onTouchEnd={handleStopDrawing}
                  className="w-full cursor-crosshair touch-none"
                  style={{
                    aspectRatio: `${config.width} / ${config.height}`,
                    maxHeight: '260px'
                  }}
                />
                {!hasContent && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400">
                    <PenTool className="w-8 h-8 mb-1.5 opacity-40 text-slate-500 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-400">Goreskan tanda tangan / stempel di sini</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">(Gunakan jari di HP/Tablet, stylus, atau kursor mouse)</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* File upload box */}
              <label className="border-2 border-dashed border-white/20 hover:border-amber-400/50 rounded-2xl p-6 bg-slate-950/40 hover:bg-slate-950/60 transition-all flex flex-col items-center justify-center cursor-pointer text-center group">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processUploadedFile(f);
                  }}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-white/5 group-hover:bg-amber-500/20 text-slate-300 group-hover:text-amber-400 flex items-center justify-center transition-colors mb-2">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white group-hover:text-amber-300">
                  Pilih Foto Tanda Tangan / Stempel
                </span>
                <span className="text-[10px] text-slate-400 mt-1">
                  Format gambar JPG, JPEG, atau PNG (Maks 5 MB)
                </span>
              </label>

              {/* Auto remove white background checkbox */}
              <label className="flex items-center gap-2 p-2.5 bg-slate-950/40 border border-white/5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRemoveWhiteBg}
                  onChange={(e) => setAutoRemoveWhiteBg(e.target.checked)}
                  className="rounded border-white/20 text-amber-500 focus:ring-amber-500 bg-slate-900"
                />
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Otomatis bersihkan latar putih menjadi transparan (Transparansi PNG)</span>
                </div>
              </label>

              {/* Preview image */}
              {uploadedImagePreview && (
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pratinjau Hasil:</span>
                  <div className="bg-white rounded-lg p-3 flex items-center justify-center border border-slate-200">
                    <img 
                      src={uploadedImagePreview} 
                      alt="Pratinjau tanda tangan" 
                      className="max-h-36 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-950/70 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-rose-400 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Hapus / Bersihkan</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={!hasContent && !uploadedImagePreview || isProcessing}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Gunakan {type === 'CAP_DESA' ? 'Cap Desa' : 'Tanda Tangan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
