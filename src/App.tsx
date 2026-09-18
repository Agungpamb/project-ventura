import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { 
  googleSignIn, logout, auth, setAccessToken, db
} from './lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { 
  findOrCreateSpreadsheet, fetchSpreadsheetRecords, saveRecordToSpreadsheet, setupProjectDriveStructure, findOrCreateFolder, fetchWithTimeout, registerTokenRefreshHandler, deleteSpreadsheetRow 
} from './lib/googleApi';
import { executeDeleteParcel } from './lib/parcelManagement';
import {
  saveGeoJSONLayerToFirestore,
  loadGeoJSONLayerDoc,
  deleteGeoJSONLayerFromFirestore,
  saveLayerToLocalStorage,
  loadDeployedDefaultGeoJSONs
} from './lib/geojsonStorage';
import { type LandRecord, compareLandRecords, type OperatorConfig, type DataIntegrityLog, type ActivityLog } from './types';
import { saveActivityLog, saveIntegrityLog } from './lib/activityStorage';
import CacheDiffModal from './components/CacheDiffModal';
import ModuleLoadingFallback from './components/ModuleLoadingFallback';

// Code-splitting with React.lazy for high performance and reduced initial memory footprint
const Dashboard = lazy(() => import('./components/Dashboard'));
const FormInput = lazy(() => import('./components/FormInput'));
const QCPanel = lazy(() => import('./components/QCPanel'));
const ActivityLogsPanel = lazy(() => import('./components/ActivityLogsPanel'));
const InteractiveMap = lazy(() => import('./components/InteractiveMap'));
const PetaBidangTanah = lazy(() => import('./components/PetaBidangTanah'));
const SandingDataPanel = lazy(() => import('./components/SandingDataPanel'));
const SandingEsdmPanel = lazy(() => import('./components/SandingEsdmPanel'));
const DaftarNominatifPanel = lazy(() => import('./components/DaftarNominatifPanel'));
const ResumeProjectPanel = lazy(() => import('./components/ResumeProjectPanel'));
const SuratInstansiPanel = lazy(() => import('./components/SuratInstansiPanel'));
import { 
  Map as MapIcon, Database, UploadCloud, ShieldAlert, LogOut, 
  RefreshCw, FileSpreadsheet, KeyRound, CheckSquare,
  Plus, User, UserCheck, Settings, Folder, Key, Eye, EyeOff, Lock, Unlock, Info, ShieldCheck, HelpCircle, Briefcase, Filter,
  Pin, Menu, Clock, LayoutGrid, Sun, Moon, Copy, Users, ExternalLink, Layers, Trash2, X, Globe, GitCompare,
  CheckCircle2, AlertCircle, FileText, Landmark, Mail
} from 'lucide-react';

interface ProjectConfig {
  id: string;
  name: string;
  folderId: string | null;
  spreadsheetId: string | null;
  uploadsFolderId: string | null;
  publicCsvUrl?: string | null;
}

const DEFAULT_PROJECTS: ProjectConfig[] = [
  { id: 'proj-1', name: 'KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN', folderId: null, spreadsheetId: null, uploadsFolderId: null, publicCsvUrl: null },
  { id: 'proj-2', name: 'KOMPENSASI ROW 150 kV BANGIL - BULUKANDANG', folderId: null, spreadsheetId: null, uploadsFolderId: null, publicCsvUrl: null },
  { id: 'proj-3', name: 'KOMPENSASI ROW 150 kV LAWANG - BULUKANDANG', folderId: null, spreadsheetId: null, uploadsFolderId: null, publicCsvUrl: null },
  { id: 'proj-4', name: 'KOMPENSASI ROW 150 kV GRATI - BANGIL', folderId: null, spreadsheetId: null, uploadsFolderId: null, publicCsvUrl: null },
];

// RFC-compliant CSV Parser
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(cell);
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (row.length > 0 || cell !== '') {
    row.push(cell);
    result.push(row);
  }
  return result;
}

// Helper to transform Google Sheets URL to direct CSV export URL
function formatGoogleCsvUrl(url: string): string {
  if (!url) return url;
  let clean = url.trim();
  if (clean.includes('/pubhtml')) {
    return clean.replace('/pubhtml', '/pub?output=csv');
  }
  if (clean.includes('docs.google.com/spreadsheets/d/')) {
    const match = clean.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const spreadsheetId = match[1];
      const gidMatch = clean.match(/[?&#]gid=([0-9]+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      if (!clean.includes('/pub?')) {
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gidParam}`;
      }
    }
  }
  return clean;
}

// Resilient CSV fetch with timeout and CORS fallback
async function fetchPublicCsvContent(url: string): Promise<string> {
  const formattedUrl = formatGoogleCsvUrl(url);
  try {
    const res = await fetchWithTimeout(formattedUrl, { mode: 'cors' }, 15000);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (directErr) {
    // Ignore direct fetch error
  }

  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(formattedUrl)}`;
    const res = await fetchWithTimeout(proxyUrl, {}, 15000);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (proxyErr) {
    // Ignore proxy error
  }

  throw new Error("Tautan CSV publik tidak dapat diakses (CORS atau URL tidak valid)");
}

import { rowToRecord } from './types';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Helper to map pathname to activeMenu
  const getMenuFromPath = (pathname: string): 'dashboard' | 'nominatif' | 'input' | 'qc' | 'qc_sanding' | 'qc_sanding_esdm' | 'map' | 'map_span' | 'resume_project' | 'surat_instansi' | 'logs' | 'project' => {
    const cleanPath = pathname.replace(/^\/+/, '').split('/')[0] || '';
    switch (cleanPath) {
      case 'nominatif': return 'nominatif';
      case 'input': return 'input';
      case 'qc': return 'qc';
      case 'sanding': return 'qc_sanding';
      case 'sanding-esdm': return 'qc_sanding_esdm';
      case 'map': return 'map';
      case 'peta-bidang': return 'map_span';
      case 'resume-project':
      case 'resume': return 'resume_project';
      case 'surat-instansi':
      case 'surat': return 'surat_instansi';
      case 'logs': return 'logs';
      case 'project': return 'project';
      case 'dashboard':
      default: return 'dashboard';
    }
  };

  // Helper to map activeMenu to route URL path
  const getPathFromMenu = (menu: string): string => {
    switch (menu) {
      case 'nominatif': return '/nominatif';
      case 'input': return '/input';
      case 'qc': return '/qc';
      case 'qc_sanding': return '/sanding';
      case 'qc_sanding_esdm': return '/sanding-esdm';
      case 'map': return '/map';
      case 'map_span': return '/peta-bidang';
      case 'resume_project': return '/resume-project';
      case 'surat_instansi': return '/surat-instansi';
      case 'logs': return '/logs';
      case 'project': return '/project';
      case 'dashboard':
      default: return '/dashboard';
    }
  };

  // Theme state
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightMode]);

  // Auth state
  const [user, setUser] = useState<any | null>(() => {
    const isBypass = localStorage.getItem('project_ventura_guest_bypass') === 'true';
    if (isBypass) {
      return {
        uid: 'guest-bypass-user',
        displayName: 'Tamu Kontraktor',
        email: 'tamu@projectventura.com',
        photoURL: '',
        emailVerified: true,
      };
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => {
    const isBypass = localStorage.getItem('project_ventura_guest_bypass') === 'true';
    if (isBypass) return 'GUEST_BYPASS';
    return typeof window !== 'undefined' ? sessionStorage.getItem('project_ventura_oauth_token') : null;
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<React.ReactNode | null>(null);

  // Re-authenticate / Refresh Google OAuth session on-demand
  const handleRefreshGoogleAuth = useCallback(async (): Promise<string | null> => {
    setIsLoggingIn(true);
    try {
      localStorage.removeItem('project_ventura_guest_bypass');
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setAccessToken(result.accessToken);
        return result.accessToken;
      }
      return null;
    } catch (err: any) {
      const isPopupBlocked = err?.code === 'auth/popup-blocked' || String(err?.message || '').includes('popup-blocked');
      const isPopupCancelled = err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-closed-by-user';
      if (isPopupBlocked) {
        console.warn("Popup Google diblokir oleh peramban/iframe saat memperbarui izin.");
      } else if (isPopupCancelled) {
        console.warn("Penyegaran izin Google dibatalkan oleh pengguna.");
      } else {
        console.error("Gagal memperbarui izin Google:", err);
      }
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  // Register Google API 401 interceptor handler so all API requests auto-refresh and retry seamlessly
  useEffect(() => {
    registerTokenRefreshHandler(handleRefreshGoogleAuth);
    return () => {
      registerTokenRefreshHandler(null);
    };
  }, [handleRefreshGoogleAuth]);

  // Guest Bypass Login Action
  const handleGuestBypassLogin = () => {
    localStorage.setItem('project_ventura_guest_bypass', 'true');
    setUser({
      uid: 'guest-bypass-user',
      displayName: 'Tamu Kontraktor',
      email: 'tamu@projectventura.com',
      photoURL: '',
      emailVerified: true,
    } as any);
    setToken('GUEST_BYPASS');
    setLoginRole('GUEST');
    loadProjectsFromCloud();
  };

  // Role based access control (RBAC) states
  const [role, setRole] = useState<'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null>(() => {
    return (localStorage.getItem('project_ventura_role') as any) || null;
  });
  const [loginRole, setLoginRole] = useState<'ADMIN' | 'FIELD' | 'QC' | 'GUEST'>('ADMIN');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Selected record for direct navigation to FormInput
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<LandRecord | null>(null);

  // Global setting for Dashboard Utama filtering: Sembunyikan Luas 0/Null (Admin Config)
  const [hideZeroLuas, setHideZeroLuas] = useState<boolean>(() => {
    return localStorage.getItem('project_ventura_hide_zero_luas') !== 'false';
  });

  const handleToggleHideZeroLuas = (value: boolean) => {
    setHideZeroLuas(value);
    localStorage.setItem('project_ventura_hide_zero_luas', value ? 'true' : 'false');
    saveProjectsToCloud(projects, value);
  };

  // Default role PINs (editable/customizable by Admin in settings if needed, or static defaults)
  const [rolePins, setRolePins] = useState(() => {
    const saved = localStorage.getItem('project_ventura_role_pins');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.ADMIN === 'admin123') {
          parsed.ADMIN = 'djancok123';
        }
        return parsed;
      } catch (e) {}
    }
    return {
      ADMIN: 'djancok123',
      FIELD: 'lapangan123',
      QC: 'qc123',
      GUEST: 'tamu123'
    };
  });

  // Projects state
  const [projects, setProjects] = useState<ProjectConfig[]>(() => {
    const saved = localStorage.getItem('project_ventura_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return DEFAULT_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem('project_ventura_active_project_id') || 'proj-1';
  });

  // Main master records and Google Sheets states
  const [records, setRecords] = useState<LandRecord[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [projectUploadsFolderId, setProjectUploadsFolderId] = useState<string | null>(null);
  const [activeMenu, setActiveMenuState] = useState<'dashboard' | 'nominatif' | 'input' | 'qc' | 'qc_sanding' | 'qc_sanding_esdm' | 'map' | 'map_span' | 'resume_project' | 'surat_instansi' | 'logs' | 'project'>(() => {
    return getMenuFromPath(window.location.pathname);
  });

  // Navigate function that syncs activeMenu state and URL
  const setActiveMenu = useCallback((menu: 'dashboard' | 'nominatif' | 'input' | 'qc' | 'qc_sanding' | 'qc_sanding_esdm' | 'map' | 'map_span' | 'resume_project' | 'surat_instansi' | 'logs' | 'project') => {
    setActiveMenuState(menu);
    const targetPath = getPathFromMenu(menu);
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [navigate, location.pathname]);

  // Keep activeMenu synced when user presses browser Back/Forward buttons
  useEffect(() => {
    const currentMenu = getMenuFromPath(location.pathname);
    setActiveMenuState(prev => prev !== currentMenu ? currentMenu : prev);
  }, [location.pathname]);
  
  // Sidebar state
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem('project_ventura_sidebar_pinned');
    return saved === null ? true : saved === 'true';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  
  // Loading and feedback states
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isLiveGoogleConnected, setIsLiveGoogleConnected] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'warning' | 'info' | 'error'; message: string; timestamp: number } | null>(null);
  const [sheetNameInfo, setSheetNameInfo] = useState<string | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState<DataIntegrityLog | null>(null);
  const [isIntegrityDismissed, setIsIntegrityDismissed] = useState(false);

  // Comparison modal states for Admin (Cache vs Spreadsheet)
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [spreadsheetRecordsForDiff, setSpreadsheetRecordsForDiff] = useState<LandRecord[]>([]);
  const [cachedRecordsForDiff, setCachedRecordsForDiff] = useState<LandRecord[]>([]);
  const [isApplyingDiffDecision, setIsApplyingDiffDecision] = useState(false);

  // Admin specific states
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSpreadsheetId, setNewProjectSpreadsheetId] = useState('');
  const [newProjectFolderId, setNewProjectFolderId] = useState('');
  const [newProjectUploadsFolderId, setNewProjectUploadsFolderId] = useState('');
  const [newProjectPublicCsvUrl, setNewProjectPublicCsvUrl] = useState('');
  const [showPinSettings, setShowPinSettings] = useState(false);
  const [newAdminPin, setNewAdminPin] = useState('');
  const [newFieldPin, setNewFieldPin] = useState('');
  const [newQcPin, setNewQcPin] = useState('');

  // Operator / Team Member Name Tracking
  const [operatorName, setOperatorName] = useState<string>(() => {
    return localStorage.getItem('project_ventura_operator_name') || '';
  });

  // Project ID configuration & Syncing tools
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editSpreadsheetId, setEditSpreadsheetId] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editUploadsFolderId, setEditUploadsFolderId] = useState('');
  const [editPublicCsvUrl, setEditPublicCsvUrl] = useState('');
  
  const [showBackupTools, setShowBackupTools] = useState(false);
  const [projectSubTab, setProjectSubTab] = useState<'projects' | 'geojson' | 'operators' | 'pins' | 'migration'>('projects');
  const [backupJsonString, setBackupJsonString] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  // GeoJSON Layer State & Configuration for project management
  const [loadedGeoJSONs, setLoadedGeoJSONs] = useState<any[]>([]);
  const [configuringLayer, setConfiguringLayer] = useState<any | null>(null);
  const [tempLayerProjectId, setTempLayerProjectId] = useState<string>('global');
  const [tempLayerType, setTempLayerType] = useState<'bidang' | 'jalur' | 'tower'>('bidang');
  const [geoJsonFilterProject, setGeoJsonFilterProject] = useState<string>('ALL');
  const [tempMapping, setTempMapping] = useState<{
    desa?: string;
    span?: string;
    nobid?: string;
    nama?: string;
    tower?: string;
    jalurName?: string;
    rotasi?: string;
  }>({});

  // Registered Operator specific states
  const [operators, setOperators] = useState<OperatorConfig[]>([]);
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);
  const [isOperatorLocked, setIsOperatorLocked] = useState<boolean>(() => {
    return localStorage.getItem('project_ventura_operator_locked') === 'true';
  });
  const [operatorLockedProjectId, setOperatorLockedProjectId] = useState<string>(() => {
    return localStorage.getItem('project_ventura_operator_locked_project_id') || '';
  });
  const [isOperatorLoginMode, setIsOperatorLoginMode] = useState(false);
  const [operatorLoginUsername, setOperatorLoginUsername] = useState('');
  const [operatorLoginPassword, setOperatorLoginPassword] = useState('');

  // Form states for creating a new operator
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpPassword, setNewOpPassword] = useState('');
  const [newOpName, setNewOpName] = useState('');
  const [newOpRole, setNewOpRole] = useState<'ADMIN' | 'FIELD' | 'QC'>('FIELD');
  const [newOpProjectId, setNewOpProjectId] = useState('');
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [operatorSuccess, setOperatorSuccess] = useState<string | null>(null);

  // Save projects to Firestore cloud database (so other accounts can sync automatically)
  const saveProjectsToCloud = async (updatedProjects: ProjectConfig[], overrideHideZeroLuas?: boolean) => {
    try {
      const isHide = overrideHideZeroLuas !== undefined ? overrideHideZeroLuas : hideZeroLuas;
      await setDoc(doc(db, 'configs', 'projects'), {
        projectsList: updatedProjects,
        hideZeroLuas: isHide,
        lastUpdated: Date.now(),
        updatedBy: user?.email || 'unknown'
      });
      console.log("Konfigurasi proyek & filter berhasil disimpan di Firestore cloud!");
    } catch (err) {
      console.warn("Gagal menyimpan ke Firestore cloud (Mungkin Firestore belum diaktifkan):", err);
    }
  };

  // Load projects from Firestore cloud database (for automatic cross-device sync)
  const loadProjectsFromCloud = useCallback(async () => {
    try {
      const docRef = doc(db, 'configs', 'projects');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          if (Array.isArray(data.projectsList) && data.projectsList.length > 0) {
            setProjects(data.projectsList);
            localStorage.setItem('project_ventura_projects', JSON.stringify(data.projectsList));
            console.log("Konfigurasi proyek disinkronkan dari Firestore cloud!");
            
            // Also verify active project still exists
            const currentActive = localStorage.getItem('project_ventura_active_project_id') || 'proj-1';
            const activeExists = data.projectsList.some((p: any) => p.id === currentActive);
            if (!activeExists) {
              const fallbackId = data.projectsList[0].id;
              setActiveProjectId(fallbackId);
              localStorage.setItem('project_ventura_active_project_id', fallbackId);
            }
          }
          if (typeof data.hideZeroLuas === 'boolean') {
            setHideZeroLuas(data.hideZeroLuas);
            localStorage.setItem('project_ventura_hide_zero_luas', data.hideZeroLuas ? 'true' : 'false');
          }
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil dari Firestore cloud (Menggunakan local storage):", err);
    }
  }, []);

  // Realtime Cloud Synchronization for Project Configs & Global Filters
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(doc(db, 'configs', 'projects'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data) {
            if (Array.isArray(data.projectsList) && data.projectsList.length > 0) {
              setProjects(data.projectsList);
              localStorage.setItem('project_ventura_projects', JSON.stringify(data.projectsList));
            }
            if (typeof data.hideZeroLuas === 'boolean') {
              setHideZeroLuas(data.hideZeroLuas);
              localStorage.setItem('project_ventura_hide_zero_luas', data.hideZeroLuas ? 'true' : 'false');
            }
          }
        }
      }, (err) => {
        console.warn("Realtime cloud sync error:", err);
      });
    } catch (e) {}

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Realtime Cloud Synchronization for Land Records (records_cache) across devices
  useEffect(() => {
    if (!activeProjectId) return;
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(doc(db, 'records_cache', activeProjectId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && Array.isArray(data.records) && data.records.length > 0) {
            setRecords(data.records);
            try {
              localStorage.setItem(`project_ventura_records_cache_${activeProjectId}`, JSON.stringify(data.records));
            } catch (e) {}
          }
        }
      }, (err) => {
        console.warn("Realtime records cache sync warning:", err);
      });
    } catch (e) {}

    return () => {
      if (unsub) unsub();
    };
  }, [activeProjectId]);

  // Load registered operators from local cache and Firestore cloud database
  const loadOperatorsFromCloud = useCallback(async () => {
    setIsLoadingOperators(true);
    let localOps: OperatorConfig[] = [];
    try {
      const saved = localStorage.getItem('project_ventura_registered_operators');
      if (saved) {
        localOps = JSON.parse(saved);
        if (Array.isArray(localOps)) {
          setOperators(localOps);
        }
      }
    } catch (e) {}

    try {
      const qSnap = await getDocs(collection(db, 'registered_operators'));
      const opsList: OperatorConfig[] = [];
      qSnap.forEach((doc) => {
        const data = doc.data();
        opsList.push({
          id: doc.id,
          username: data.username || doc.id,
          password: data.password || '',
          name: data.name || '',
          role: data.role || 'FIELD',
          projectId: data.projectId || '',
          createdAt: data.createdAt || Date.now(),
        });
      });

      const mergedMap = new Map<string, OperatorConfig>();
      localOps.forEach(op => mergedMap.set(op.username, op));
      opsList.forEach(op => mergedMap.set(op.username, op));

      const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
      setOperators(mergedList);
      localStorage.setItem('project_ventura_registered_operators', JSON.stringify(mergedList));
      console.log("Daftar operator berhasil disinkronkan!");
    } catch (err) {
      console.warn("Firestore cloud operator load warning (menggunakan cache lokal):", err);
    } finally {
      setIsLoadingOperators(false);
    }
  }, []);

  // Action: Add new Operator
  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperatorError(null);
    setOperatorSuccess(null);

    const usernameTrimmed = newOpUsername.trim().toLowerCase();
    const passwordTrimmed = newOpPassword.trim();
    const nameTrimmed = newOpName.trim();
    const projectIdSelected = newOpProjectId || 'all';

    if (!usernameTrimmed || !passwordTrimmed || !nameTrimmed) {
      setOperatorError("Semua kolom (Nama Pengguna, Sandi, & Nama Lengkap) wajib diisi!");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(usernameTrimmed)) {
      setOperatorError("Nama pengguna harus 3-20 karakter dan hanya boleh berisi huruf, angka, atau garis bawah (_).");
      return;
    }

    // Check duplicate
    const exists = operators.some(op => op.username === usernameTrimmed);
    if (exists) {
      setOperatorError(`Nama pengguna "${usernameTrimmed}" sudah terdaftar.`);
      return;
    }

    const newOp: OperatorConfig = {
      id: usernameTrimmed,
      username: usernameTrimmed,
      password: passwordTrimmed,
      name: nameTrimmed,
      role: newOpRole,
      projectId: projectIdSelected,
      createdAt: Date.now(),
    };

    // 1. Immediately update React state & LocalStorage so it saves without blocking
    const updatedOperators = [newOp, ...operators];
    setOperators(updatedOperators);
    try {
      localStorage.setItem('project_ventura_registered_operators', JSON.stringify(updatedOperators));
    } catch (e) {}

    // Reset form & show feedback
    setNewOpUsername('');
    setNewOpPassword('');
    setNewOpName('');
    setNewOpRole('FIELD');
    setNewOpProjectId('');
    setOperatorSuccess(`Akun operator "${usernameTrimmed}" berhasil terdaftar & disimpan!`);
    setTimeout(() => setOperatorSuccess(null), 5000);

    // 2. Background sync to Firestore cloud
    try {
      await setDoc(doc(db, 'registered_operators', usernameTrimmed), newOp);
      console.log("Operator disinkronkan ke cloud Firestore:", usernameTrimmed);
    } catch (err: any) {
      console.warn("Gagal menyinkronkan operator ke Firestore cloud (Tersimpan di penyimpanan lokal):", err);
    }
  };

  // Action: Delete Operator
  const handleDeleteOperator = async (username: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus operator "${username}"?`)) {
      return;
    }

    const updated = operators.filter(op => op.username !== username);
    setOperators(updated);
    try {
      localStorage.setItem('project_ventura_registered_operators', JSON.stringify(updated));
    } catch (e) {}

    try {
      await deleteDoc(doc(db, 'registered_operators', username));
      console.log("Operator berhasil dihapus dari cloud:", username);
    } catch (err: any) {
      console.warn("Gagal menghapus operator dari Firestore cloud:", err);
    }
  };

  // Initialize auth state and load projects and operators from cloud on mount
  useEffect(() => {
    loadProjectsFromCloud();
    loadOperatorsFromCloud();
  }, [loadProjectsFromCloud, loadOperatorsFromCloud]);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      const isBypass = localStorage.getItem('project_ventura_guest_bypass') === 'true';
      if (isBypass) {
        // If guest bypass is active, ignore Firebase Auth updates
        return;
      }
      if (currentUser) {
        setUser(currentUser);
        loadProjectsFromCloud();
        loadOperatorsFromCloud();
      } else {
        setUser(null);
        setToken(null);
        setSpreadsheetId(null);
        setRecords([]);
      }
    });
    return () => unsubscribe();
  }, [loadProjectsFromCloud, loadOperatorsFromCloud]);

  // Helper to extract property keys from GeoJSON features for mapping
  const getGeoJSONKeys = (geojson: any): string[] => {
    if (!geojson || !geojson.features || !geojson.features.length) return [];
    const keysSet = new Set<string>();
    const sampleCount = Math.min(geojson.features.length, 15);
    for (let i = 0; i < sampleCount; i++) {
      const props = geojson.features[i].properties;
      if (props) {
        Object.keys(props).forEach(k => keysSet.add(k));
      }
    }
    return Array.from(keysSet).sort();
  };

  // Real-time synchronization of custom & deployed GeoJSON layers from Firestore / /public/geojson/
  useEffect(() => {
    let isMounted = true;

    const syncLayers = async (snapshotDocs: any[]) => {
      const docPromises = snapshotDocs.map(docSnap => loadGeoJSONLayerDoc(docSnap));
      const customLayers = await Promise.all(docPromises);

      // 1. Fetch default deployed GeoJSON files from /public/geojson/
      const defaultDeployedLayers = await loadDeployedDefaultGeoJSONs();

      // 2. Combine and remove duplicates by ID
      const mergedMap = new Map<string, any>();

      // Merge deployed static layers first
      defaultDeployedLayers.forEach(d => mergedMap.set(d.id, d));

      // Merge local fallback layers next
      let localLayers: any[] = [];
      try {
        localLayers = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
      } catch (e) {}
      localLayers.forEach(l => mergedMap.set(l.id, l));

      // Override/merge with cloud Firestore layers safely
      customLayers.forEach(c => {
        const existing = mergedMap.get(c.id);
        mergedMap.set(c.id, {
          ...existing,
          ...c,
          name: c.name || existing?.name || '',
          data: (c.data?.features?.length ? c.data : (existing?.data || c.data)),
          type: c.type || existing?.type || 'bidang',
          fieldMapping: c.fieldMapping || existing?.fieldMapping || null
        });
      });

      if (isMounted) {
        setLoadedGeoJSONs(Array.from(mergedMap.values()));
      }
    };

    // Load default deployed files immediately on mount
    loadDeployedDefaultGeoJSONs().then(defaults => {
      if (isMounted && defaults.length > 0) {
        setLoadedGeoJSONs(prev => {
          const map = new Map<string, any>();
          defaults.forEach(d => map.set(d.id, d));
          prev.forEach(p => map.set(p.id, p));
          return Array.from(map.values());
        });
      }
    });

    const unsubscribe = onSnapshot(collection(db, 'geojson_layers'), (snapshot) => {
      syncLayers(snapshot.docs);
    }, (err) => {
      console.warn('Error listening to geojson_layers collection in App:', err);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleAddGeoJSON = async (data: any, name: string, type: 'bidang' | 'jalur' | 'tower') => {
    const newId = `${type}_${Date.now()}`;
    const newLayer: any = {
      id: newId,
      name,
      type,
      data,
      visible: true,
      isDefault: false,
      fieldMapping: null,
      projectId: activeProjectId || 'global'
    };

    // Update local state immediately for instant feedback
    setLoadedGeoJSONs(prev => {
      if (prev.some(p => p.id === newId)) return prev;
      return [...prev, newLayer];
    });

    // Always update localStorage safely without throwing quota error
    saveLayerToLocalStorage(newLayer);

    try {
      await saveGeoJSONLayerToFirestore(newLayer);
    } catch (err: any) {
      console.warn('Gagal menyimpan GeoJSON ke Firestore:', err);
    }
  };

  const handleToggleVisibility = async (id: string, visible: boolean) => {
    try {
      await setDoc(doc(db, 'geojson_layers', id), {
        visible: !visible
      }, { merge: true });
    } catch (err) {
      console.warn('Gagal mengubah visibilitas:', err);
    }
    setLoadedGeoJSONs(prev => prev.map(g => g.id === id ? { ...g, visible: !visible } : g));
  };

  const handleRemoveGeoJSON = async (id: string) => {
    const targetLayer = loadedGeoJSONs.find(g => g.id === id);

    // 1. Immediately remove from localStorage first
    try {
      const localGeoJSONs = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
      const filtered = localGeoJSONs.filter((l: any) => l.id !== id);
      localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
    } catch (e) {}

    // 2. Immediately remove from React state for instant UI update
    setLoadedGeoJSONs(prev => prev.filter(g => g.id !== id));

    // 3. Delete from Firestore in background
    try {
      await deleteGeoJSONLayerFromFirestore(id, targetLayer?.chunked);
    } catch (err) {
      console.warn('Gagal menghapus GeoJSON dari Firestore:', err);
    }
  };

  const handleGeoJSONUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'bidang' | 'jalur' | 'tower') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const nameClean = file.name.replace(/\.[^/.]+$/, ""); // strip extension
        handleAddGeoJSON(json, `${nameClean} (${type.toUpperCase()})`, type);
      } catch (err) {
        alert('File format salah! Pastikan mengunggah file .geojson yang valid.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle SignIn action
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      localStorage.removeItem('project_ventura_guest_bypass');
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      console.warn("Login attempt completed with status:", err?.code || err?.message || err);
      const errStr = err.message || String(err);
      const isPopupBlocked = errStr.includes('popup-blocked') || err.code === 'auth/popup-blocked';
      const isPopupCancelled = errStr.includes('cancelled-popup-request') || err.code === 'auth/cancelled-popup-request';
      const isUnauthorizedDomain = errStr.includes('unauthorized-domain') || err.code === 'auth/unauthorized-domain';
      
      if (isUnauthorizedDomain) {
        const currentDomain = window.location.hostname;
        setAuthError(
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Domain Belum Terotorisasi (auth/unauthorized-domain)</span>
            </div>
            <p className="text-slate-300 font-normal text-[11px] leading-relaxed">
              Firebase menolak login dari domain preview container ini karena belum didaftarkan di Firebase Console.
            </p>
            <div className="bg-slate-900/90 border border-slate-700/70 rounded-lg p-2 flex items-center justify-between gap-2 text-[11px] font-mono text-amber-300">
              <span className="truncate select-all">{currentDomain}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentDomain);
                  alert(`Domain "${currentDomain}" berhasil disalin! Tambahkan ke Firebase Console > Authentication > Settings > Authorized domains.`);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-1 rounded text-[10px] font-sans font-semibold shrink-0 cursor-pointer"
              >
                Salin Domain
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleGuestBypassLogin}
                className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all w-full cursor-pointer shadow-md"
              >
                <UserCheck className="w-3.5 h-3.5" /> Masuk via Mode Tamu
              </button>
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all w-full"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Buka di Tab Baru
              </a>
            </div>
          </div>
        );
      } else if (isPopupBlocked || isPopupCancelled) {
        setAuthError(
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Google Sign-In Popup Terblokir / Dibatalkan</span>
            </div>
            <p className="text-slate-300 font-normal text-[11px] leading-relaxed">
              Browser memblokir jendela popup karena aplikasi berjalan di dalam frame web. Silakan buka aplikasi langsung di tab baru atau lanjutkan via Mode Tamu:
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleGuestBypassLogin}
                className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all w-full cursor-pointer shadow-md"
              >
                <UserCheck className="w-3.5 h-3.5" /> Masuk via Mode Tamu
              </button>
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all w-full"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Buka di Tab Baru
              </a>
            </div>
          </div>
        );
      } else {
        setAuthError(errStr || 'Gagal masuk dengan akun Google.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout action
  const handleLogout = async () => {
    try {
      localStorage.removeItem('project_ventura_guest_bypass');
      await logout();
      setUser(null);
      setToken(null);
      setSpreadsheetId(null);
      setRecords([]);
      setRole(null);
      setOperatorName('');
      setIsOperatorLocked(false);
      setOperatorLockedProjectId('');
      localStorage.removeItem('project_ventura_role');
      localStorage.removeItem('project_ventura_operator_name');
      localStorage.removeItem('project_ventura_operator_locked');
      localStorage.removeItem('project_ventura_operator_locked_project_id');
      setActiveMenu('dashboard');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Helper to create fully typed mock records for guest mode
  const createMockRecord = (
    code: string,
    name: string,
    desa: string,
    span: string,
    nobid: string,
    luas: string,
    progres_pemberkasan: string,
    progres_upload_trabas: string,
    qc_status: 'PENDING' | 'APPROVED' | 'REJECTED',
    qc_notes: string
  ): LandRecord => {
    const buildings = Array.from({ length: 8 }, () => ({ luas: "", bentuk: "", jenis: "" }));
    const plants = Array.from({ length: 30 }, () => ({
      jenis: "", sudah_menghasilkan: "", belum_menghasilkan: "", kecil: "", sedang: "", besar: ""
    }));
    return {
      CODE: code,
      DESA: desa,
      SPAN: span,
      NOBID: nobid,
      LUAS: luas,
      PENUTUP_LAHAN: "SAWAH",
      STATUS_PENUTUP_LAHAN: "TANAH MASYARAKAT",
      STATUS_KEPEMILIKAN: "PEMILIK DIKETAHUI",
      NAMA: name,
      NIK: "320101" + Math.floor(1000000000 + Math.random() * 9000000000),
      TTL: "Mojokerto, 12-05-1980",
      JENIS_KELAMIN: "Laki-laki",
      ALAMAT_KTP_BARIS_1: "RT 02 RW 04",
      ALAMAT_KTP_BARIS_2: "Dusun Krajan",
      ALAMAT_KTP_BARIS_3: desa,
      ALAMAT_KTP_BARIS_4: "Jawa Timur",
      PEKERJAAN: "Petani",
      JENIS_ALAS_HAK: "SERTIPIKAT HAK MILIK",
      NOMER_HAK: "M." + Math.floor(100 + Math.random() * 900),
      NAMA_ALAS_HAK: name,
      LUAS_YANG_ADA_PADA_ALAS_HAK: luas,
      KETERANGAN_ALAS_HAK: "SESUAI",
      buildings,
      plants,
      STATUS_DESA: "Selesai",
      STATUS_KEPALA: "Lengkap",
      NAMA_KADES: "H. Mulyono",
      NAMA_SAKSI_1: "Slamet",
      NAMA_SAKSI_2: "Kusno",
      nama_tim_1: "Tim Lapangan A",
      nama_tim_2: "Tim Lapangan B",
      TANGGAL_PELAKSANAAN: "2026-07-10",
      KECAMATAN: "Trowulan",
      KABUPATEN: "Mojokerto",
      KONFIRMASI_BPN: "Sudah",
      PROGRES_PEMBERKASAN: progres_pemberkasan,
      PROGRES_UPLOAD_TRABAS: progres_upload_trabas,
      KEKURANGAN_BERKAS: progres_pemberkasan === "Lengkap" ? "" : "Kekurangan berkas Surat Kuasa",
      KETERANGAN: "",
      LINK_KTP: "https://drive.google.com/open?id=mock-ktp",
      LINK_KK: "https://drive.google.com/open?id=mock-kk",
      LINK_ALAS_HAK: "https://drive.google.com/open?id=mock-alas-hak",
      LINK_PERALIHAN_HAK: "",
      QC_STATUS: qc_status,
      QC_NOTES: qc_notes,
      QC_BY: "Verifikator Pusat",
      QC_DATE: "2026-07-12",
      ID_UNIK: `ID-${code.replace(/[\s-]/g, '_')}`,
      JENIS_PERALIHAN_HAK: "WARIS",
      LINK_JUAL_BELI: "",
      LINK_KETERANGAN_WARIS: "",
      LINK_KUASA_WARIS: "",
      LINK_SURAT_KUASA: "",
      LINK_KET_BEDA_NAMA: "",
      LINK_WAKAF: "",
      LINK_KLAIM_TANAMAN: "",
      LINK_KLAIM_BANGUNAN: "",
      LINK_DOKUMEN_LAIN: "",
      LINK_DOKUMENTASI_BIDANG: "",
      LINK_DOKUMENTASI_BIDANG_2: "",
      LINK_DOKUMENTASI_BIDANG_3: "",
      LINK_WAJAH_PEMILIK: "",
      DRIVE_FOLDER_ID: "",
      BATAS_UTARA: "Sri Suyani",
      BATAS_SELATAN: "Sri Suyani",
      BATAS_TIMUR: "Sri Suyani",
      BATAS_BARAT: "Tumirah"
    };
  };

  // Save records cache to Firestore so guests can access real data automatically
  const saveRecordsToFirestoreCache = async (projectId: string, list: LandRecord[]) => {
    try {
      await setDoc(doc(db, 'records_cache', projectId), {
        records: list,
        lastUpdated: Date.now(),
        updatedBy: user?.email || 'admin/user'
      });
      console.log("Records cache updated in Firestore successfully for project:", projectId);
    } catch (err) {
      console.warn("Gagal menyimpan cache ke Firestore:", err);
    }
  };

  // Connect and load/create project-specific Google Drive/Spreadsheet
  const loadProjectData = useCallback(async (
    accessToken: string, 
    projectId: string, 
    options?: { isManualSync?: boolean; forceDirectSheet?: boolean }
  ) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const activeProj = projects.find(p => p.id === projectId);
      if (!activeProj) throw new Error("Proyek tidak ditemukan.");

      if (!accessToken || accessToken === 'GUEST_BYPASS' || accessToken === 'null' || accessToken === 'undefined' || accessToken.trim() === '') {
        setIsLiveGoogleConnected(false);
        setSpreadsheetId('guest_bypass');
        setProjectUploadsFolderId('guest_bypass');
        setSheetNameInfo(`${activeProj.name} (Mode Tamu / Offline)`);

        // Try to fetch from public CSV URL first if configured
        if (activeProj.publicCsvUrl) {
          try {
            console.log("Fetching public CSV URL:", activeProj.publicCsvUrl);
            const csvText = await fetchPublicCsvContent(activeProj.publicCsvUrl);
            const csvRows = parseCSV(csvText);
            
            if (csvRows.length > 1) {
              const dataRows = csvRows.slice(1);
              const parsedRecords = dataRows
                .filter(row => row && row.length > 0 && row[0] && row[0] !== 'CODE') // Ensure CODE is present and not header
                .map((row, idx) => {
                  const record = rowToRecord(row, idx);
                  record.rowNumber = idx + 2;
                  return record;
                });
              
              const sorted = [...parsedRecords].sort(compareLandRecords);
              setRecords(sorted);
              
              // Cache in local storage safely
              try {
                localStorage.setItem(`project_ventura_records_cache_${projectId}`, JSON.stringify(sorted));
              } catch (storageError) {
                console.warn("localStorage quota exceeded, unable to cache records locally:", storageError);
              }
              if (options?.isManualSync) {
                setSyncFeedback({
                  type: 'success',
                  message: `Berhasil memuat ${sorted.length} data bidang dari CSV Publik.`,
                  timestamp: Date.now()
                });
              }
              return; // Success!
            }
          } catch (csvErr: any) {
            console.warn("Tautan Publik CSV tidak dapat diakses langsung, mengalihkan ke cache lokal/cloud:", csvErr);
            // Don't crash, fall back to localStorage cached data or Firestore
          }
        }

        // Try to load cached records from localStorage first (for instant initial load)
        const cached = localStorage.getItem(`project_ventura_records_cache_${projectId}`);
        let hasLoadedLocal = false;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRecords(parsed);
              hasLoadedLocal = true;
            }
          } catch (e) {
            console.warn("Gagal membaca cache lokal:", e);
          }
        }

        // Fetch from Firestore cloud cache (always try this to get up-to-date data synced by Admin)
        try {
          const cacheRef = doc(db, 'records_cache', projectId);
          const cacheSnap = await getDoc(cacheRef);
          if (cacheSnap.exists()) {
            const cacheData = cacheSnap.data();
            if (cacheData && Array.isArray(cacheData.records) && cacheData.records.length > 0) {
              setRecords(cacheData.records);
              localStorage.setItem(`project_ventura_records_cache_${projectId}`, JSON.stringify(cacheData.records));
              if (options?.isManualSync) {
                setSyncFeedback({
                  type: 'warning',
                  message: `Mode Tamu: Data diperbarui dari Cadangan Cloud Firestore (${cacheData.records.length} bidang). Hubungkan akun Google untuk mengambil langsung dari Google Sheets.`,
                  timestamp: Date.now()
                });
              }
              return; // Successfully got up-to-date real data from Firestore!
            }
          }
        } catch (fsErr) {
          console.warn("Gagal mengambil cache data dari Firestore:", fsErr);
        }

        // If we didn't get from Firestore and also have nothing in local storage, use the default mocks
        if (!hasLoadedLocal) {
          // Fallback template records
          const mockList: LandRecord[] = [
            createMockRecord("VT-001", "Budi Santoso", "Sukamaju", "SPAN-1", "015", "250", "Lengkap", "Selesai", "APPROVED", "Semua berkas sudah valid"),
            createMockRecord("VT-002", "Siti Rahmawati", "Sukamaju", "SPAN-1", "016", "410", "Sebagian", "Belum", "PENDING", "Menunggu Surat Kuasa ditandatangani"),
            createMockRecord("VT-003", "Ahmad Fauzi", "Sukamaju", "SPAN-2", "017", "180", "Belum", "Belum", "PENDING", "Belum ada berkas fisik"),
            createMockRecord("VT-004", "Dewi Lestari", "Jatisari", "SPAN-3", "005", "320", "Lengkap", "Selesai", "APPROVED", "Validasi BPN sesuai"),
            createMockRecord("VT-005", "Hendra Wijaya", "Jatisari", "SPAN-3", "006", "550", "Sebagian", "Selesai", "REJECTED", "Nama di sertifikat beda dengan KTP, belum ada Surat Keterangan Beda Nama")
          ];
          setRecords(mockList);
        }
        return;
      }
      
      let folderId = activeProj.folderId;
      let sheetId = activeProj.spreadsheetId;
      let uploadsFolderId = activeProj.uploadsFolderId;
      
      // Execute setup & fetch with a 35-second maximum timeout
      const syncPromise = (async () => {
        // If any is missing, automate creation in Drive under "PROJECT_VENTURA"
        if (!folderId || !sheetId || !uploadsFolderId) {
          const setup = await setupProjectDriveStructure(accessToken, activeProj.name);
          folderId = setup.folderId;
          sheetId = setup.spreadsheetId;
          uploadsFolderId = setup.uploadsFolderId;
          
          // Save back to projects state and localStorage
          const updatedProjects = projects.map(p => {
            if (p.id === projectId) {
              return { ...p, folderId, spreadsheetId: sheetId, uploadsFolderId };
            }
            return p;
          });
          setProjects(updatedProjects);
          localStorage.setItem('project_ventura_projects', JSON.stringify(updatedProjects));
          saveProjectsToCloud(updatedProjects);
        }
        
        setSpreadsheetId(sheetId);
        setProjectUploadsFolderId(uploadsFolderId);
        
        // Fetch cached Firestore count if available to compare integrity & inspect diff
        let cachedCount = records.length;
        let existingCacheList: LandRecord[] = [];
        try {
          const cacheRef = doc(db, 'records_cache', projectId);
          const cacheSnap = await getDoc(cacheRef);
          if (cacheSnap.exists() && Array.isArray(cacheSnap.data()?.records)) {
            existingCacheList = cacheSnap.data().records;
            cachedCount = existingCacheList.length;
          }
        } catch (cErr) {
          console.warn("Could not retrieve cached count for integrity check:", cErr);
        }

        if (existingCacheList.length === 0) {
          try {
            const local = localStorage.getItem(`project_ventura_records_cache_${projectId}`);
            if (local) {
              const parsed = JSON.parse(local);
              if (Array.isArray(parsed) && parsed.length > 0) {
                existingCacheList = parsed;
                cachedCount = existingCacheList.length;
              }
            }
          } catch (e) {}
        }
        setCachedRecordsForDiff(existingCacheList);

        // Fetch all rows with integrity audit
        const items = await fetchSpreadsheetRecords(accessToken, sheetId, {
          projectId,
          cachedFirestoreCount: cachedCount,
          onIntegrityCheck: (log) => {
            setIntegrityStatus(log);
            setIsIntegrityDismissed(false);
            // Save integrity log in local storage & Firestore for audit trail
            saveIntegrityLog({
              ...log,
              timestamp: Date.now(),
              message: log.message || `[Audit Integritas] ${activeProj.name || projectId}: ${log.status}`
            });
          }
        });
        return { items, folderId, sheetId, uploadsFolderId, existingCacheList };
      })();

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Koneksi Google Drive/Sheets timeout (35 detik). Mengalihkan ke data cadangan...')), 35000)
      );

      const { items, existingCacheList } = await Promise.race([syncPromise, timeoutPromise]);

      const sortedItems = [...items].sort(compareLandRecords);
      setSpreadsheetRecordsForDiff(sortedItems);
      setRecords(sortedItems);
      setIsLiveGoogleConnected(true);
      
      // Cache records in localStorage safely
      try {
        localStorage.setItem(`project_ventura_records_cache_${projectId}`, JSON.stringify(sortedItems));
      } catch (storageError) {
        console.warn("localStorage quota exceeded, unable to cache records locally:", storageError);
      }

      // If an inconsistency was detected, do not immediately overwrite Firestore cache
      // so that Admin can inspect differences and choose whether to apply spreadsheet or keep cache!
      const hasInconsistency = existingCacheList && existingCacheList.length > 0 && Math.abs(sortedItems.length - existingCacheList.length) > 0;
      if (!hasInconsistency || options?.isManualSync) {
        saveRecordsToFirestoreCache(projectId, sortedItems);
      }
      setSheetNameInfo(activeProj.name);
      
      if (options?.isManualSync) {
        setSyncFeedback({
          type: 'success',
          message: `✅ Sinkronisasi Master Berhasil! ${sortedItems.length} baris data berhasil dimuat langsung dari Google Spreadsheet.`,
          timestamp: Date.now()
        });
      }
    } catch (err: any) {
      console.warn("Gagal sinkronisasi langsung dengan Google Sheets, mengaktifkan mode cadangan:", err?.message || err);
      setIsLiveGoogleConnected(false);
      
      let loadedFromFallback = false;
      let fallbackCount = 0;
      const activeProj = projects.find(p => p.id === projectId);

      // 1. Try Firestore Cache (Most up-to-date shared cloud cache)
      try {
        const cacheRef = doc(db, 'records_cache', projectId);
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          const cacheData = cacheSnap.data();
          if (cacheData && Array.isArray(cacheData.records) && cacheData.records.length > 0) {
            setRecords(cacheData.records);
            fallbackCount = cacheData.records.length;
            loadedFromFallback = true;
          }
        }
      } catch (fsErr) {
        console.warn("Gagal memuat dari Firestore cache:", fsErr);
      }

      // 2. Try LocalStorage Cache
      if (!loadedFromFallback) {
        const cached = localStorage.getItem(`project_ventura_records_cache_${projectId}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRecords(parsed);
              fallbackCount = parsed.length;
              loadedFromFallback = true;
            }
          } catch (e) {
            console.warn("Gagal memuat dari LocalStorage cache:", e);
          }
        }
      }

      // 3. Try Public CSV URL if configured
      if (!loadedFromFallback && activeProj?.publicCsvUrl) {
        try {
          const csvText = await fetchPublicCsvContent(activeProj.publicCsvUrl);
          const csvRows = parseCSV(csvText);
          if (csvRows.length > 1) {
            const dataRows = csvRows.slice(1);
            const parsedRecords = dataRows
              .filter(row => row && row.length > 0 && row[0] && row[0] !== 'CODE')
              .map((row, idx) => {
                const record = rowToRecord(row, idx);
                record.rowNumber = idx + 2;
                return record;
              });
            const sorted = [...parsedRecords].sort(compareLandRecords);
            setRecords(sorted);
            fallbackCount = sorted.length;
            loadedFromFallback = true;
          }
        } catch (csvErr) {
          console.warn("Gagal memuat dari Public CSV URL:", csvErr);
        }
      }

      const isAuthIssue = err?.isAuthError || 
        err?.code === 'UNAUTHENTICATED' || 
        String(err?.message || '').includes('Token') || 
        String(err?.message || '').includes('OAuth') ||
        String(err?.message || '').includes('401') ||
        String(err?.message || '').includes('invalid authentication credentials') ||
        String(err?.message || '').includes('Google Drive terputus') ||
        String(err?.message || '').includes('Failed to fetch');

      if (loadedFromFallback) {
        setSheetNameInfo(`${activeProj?.name || ''} (Mode Cadangan Cloud / Offline)`);
        if (isAuthIssue) {
          setDataError('Sesi Google Sheets telah kedaluwarsa atau belum terhubung. Klik "Perbarui Sesi Google" untuk menyinkronkan data langsung dari Google Spreadsheet.');
          setSyncFeedback({
            type: 'warning',
            message: `Perhatian: Sesi Google Sheets kedaluwarsa/belum terhubung. Aplikasi menampilkan data Cadangan Cloud (${fallbackCount} baris). Klik tombol 'Perbarui Sesi Google' di bawah untuk menyinkronkan langsung dari Master Spreadsheet.`,
            timestamp: Date.now()
          });
        } else {
          setSyncFeedback({
            type: 'warning',
            message: `Peringatan: Gagal terhubung ke Google Sheets (${err?.message || 'Koneksi terputus'}). Menampilkan data Cadangan Cloud (${fallbackCount} baris).`,
            timestamp: Date.now()
          });
        }
      } else {
        if (isAuthIssue) {
          setDataError('Sesi Google Drive/Sheets belum terhubung atau telah kedaluwarsa. Klik tombol di bawah untuk memperbarui sesi Google Anda.');
        } else {
          setDataError(err.message || 'Gagal menyinkronkan data proyek dengan Google Drive/Sheets. Periksa koneksi internet atau hak akses.');
        }
      }
      throw err;
    } finally {
      setIsLoadingData(false);
    }
  }, [projects, records.length]);

  // Sync when token/projectId becomes available
  useEffect(() => {
    if (activeProjectId && role) {
      const activeToken = token || 'GUEST_BYPASS';
      loadProjectData(activeToken, activeProjectId).catch(() => {});
    }
  }, [token, activeProjectId, role, loadProjectData]);

  // Re-sync button handler with automated auth refresh
  const handleManualSync = async (forceReauth = false) => {
    if (!activeProjectId) return;
    setIsLoadingData(true);
    setSyncFeedback({
      type: 'info',
      message: 'Sedang menghubungkan ke Google Sheets & menyinkronkan data terbaru...',
      timestamp: Date.now()
    });

    let currentToken = token;

    // If user explicitly requested reauth or if current token is missing / guest bypass
    if (forceReauth || !currentToken || currentToken === 'GUEST_BYPASS' || currentToken === 'null') {
      try {
        const freshToken = await handleRefreshGoogleAuth();
        if (freshToken) {
          currentToken = freshToken;
        }
      } catch (authErr: any) {
        console.warn("Autentikasi Google dibatalkan atau gagal:", authErr);
        setSyncFeedback({
          type: 'warning',
          message: 'Otentikasi Google tidak selesai. Menggunakan data cadangan cloud.',
          timestamp: Date.now()
        });
      }
    }

    try {
      const activeToken = currentToken || 'GUEST_BYPASS';
      await loadProjectData(activeToken, activeProjectId, { isManualSync: true });
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      
      const isAuthIssue = err?.isAuthError || 
        err?.code === 'UNAUTHENTICATED' || 
        String(err?.message || '').includes('Token') || 
        String(err?.message || '').includes('OAuth') ||
        String(err?.message || '').includes('401') ||
        String(err?.message || '').includes('invalid authentication credentials') ||
        String(err?.message || '').includes('Google Drive terputus') ||
        String(err?.message || '').includes('Failed to fetch');

      // If failed with auth issue and we haven't prompted reauth yet, prompt once if user gesture is active
      if (isAuthIssue && !forceReauth) {
        const hasUserGesture = typeof navigator !== 'undefined' && 'userActivation' in navigator 
          ? navigator.userActivation.isActive 
          : true;
        if (hasUserGesture) {
          try {
            const freshToken = await handleRefreshGoogleAuth();
            if (freshToken) {
              await loadProjectData(freshToken, activeProjectId, { isManualSync: true });
              return;
            }
          } catch (reauthErr: any) {
            console.warn("Penyegaran otentikasi Google dilewati/dibatalkan:", reauthErr?.message || reauthErr);
          }
        }
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  // Diff comparison modal handlers for Admin
  const handleOpenDiffModal = async () => {
    let sheetList = spreadsheetRecordsForDiff;
    if (sheetList.length === 0 && records.length > 0) {
      sheetList = records;
      setSpreadsheetRecordsForDiff(records);
    }
    let cacheList = cachedRecordsForDiff;
    if (cacheList.length === 0) {
      try {
        const cacheRef = doc(db, 'records_cache', activeProjectId);
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists() && Array.isArray(cacheSnap.data()?.records)) {
          cacheList = cacheSnap.data().records;
        }
      } catch (e) {
        console.warn("Could not retrieve cache from Firestore:", e);
      }
      if (cacheList.length === 0) {
        try {
          const local = localStorage.getItem(`project_ventura_records_cache_${activeProjectId}`);
          if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) cacheList = parsed;
          }
        } catch (e) {}
      }
      setCachedRecordsForDiff(cacheList);
    }
    setIsDiffModalOpen(true);
  };

  const handleApplySpreadsheetData = async () => {
    setIsApplyingDiffDecision(true);
    try {
      const sorted = [...(spreadsheetRecordsForDiff.length > 0 ? spreadsheetRecordsForDiff : records)].sort(compareLandRecords);
      setRecords(sorted);
      try {
        localStorage.setItem(`project_ventura_records_cache_${activeProjectId}`, JSON.stringify(sorted));
      } catch (e) {
        console.warn("localStorage quota exceeded:", e);
      }
      await saveRecordsToFirestoreCache(activeProjectId, sorted);
      if (integrityStatus) {
        setIntegrityStatus({
          ...integrityStatus,
          status: 'CONSISTENT',
          cacheCount: sorted.length,
          spreadsheetCount: sorted.length,
          difference: 0,
          message: `[Log Integritas Data] Sinkron: Data diselaraskan dengan Google Spreadsheet (${sorted.length} baris).`
        });
      }
      setIsIntegrityDismissed(true);
      setIsDiffModalOpen(false);
      setSyncFeedback({
        type: 'success',
        message: `✅ Berhasil menerapkan ${sorted.length} baris data dari Google Spreadsheet (Master)! Cache telah diperbarui.`,
        timestamp: Date.now()
      });
      logActivity(
        'SYNC-MASTER',
        'UPDATE',
        `Admin menyelaraskan ${sorted.length} baris data dari Google Spreadsheet (Master) ke Firestore Cache.`
      );
    } catch (err: any) {
      alert("Gagal menerapkan data spreadsheet: " + (err?.message || err));
    } finally {
      setIsApplyingDiffDecision(false);
    }
  };

  const handleApplyCacheData = async () => {
    setIsApplyingDiffDecision(true);
    try {
      const sorted = [...cachedRecordsForDiff].sort(compareLandRecords);
      setRecords(sorted);
      setIsIntegrityDismissed(true);
      setIsDiffModalOpen(false);
      setSyncFeedback({
        type: 'info',
        message: `ℹ️ Menggunakan data dari Cache (${sorted.length} baris). Peringatan integritas ditutup.`,
        timestamp: Date.now()
      });
      logActivity(
        'RESOLVE-CACHE',
        'UPDATE',
        `Admin mempertahankan data dari Cache Firestore (${sorted.length} baris) sebagai data operasional.`
      );
    } catch (err: any) {
      alert("Gagal menerapkan data cache: " + (err?.message || err));
    } finally {
      setIsApplyingDiffDecision(false);
    }
  };

  // Helper to log activities in LocalStorage and Firestore
  const logActivity = async (
    recordCode: string,
    actionType: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'QC',
    details: string
  ) => {
    const activeProj = projects.find(p => p.id === activeProjectId);
    const storedOp = typeof window !== 'undefined' ? localStorage.getItem('project_ventura_operator_name') : null;
    const opName = (storedOp && storedOp.trim()) || operatorName || (user?.displayName) || (user?.email ? user.email.split('@')[0] : 'Operator');
    const uEmail = user?.email || (role === 'ADMIN' ? 'admin@pln.co.id' : 'operator@pln.co.id');
    
    await saveActivityLog({
      projectId: activeProjectId,
      projectName: activeProj?.name || 'Unknown Project',
      timestamp: Date.now(),
      userEmail: uEmail,
      operatorName: opName,
      userRole: role || 'GUEST',
      actionType,
      recordCode,
      details
    });
  };

  // Helper to execute operations with automatic token expiry detection & seamless refresh
  const executeWithAuthRetry = async <T,>(operation: (authToken: string) => Promise<T>): Promise<T> => {
    let currentToken = token;
    if (!currentToken || currentToken === 'GUEST_BYPASS') {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem('project_ventura_oauth_token') : null;
      if (stored) {
        currentToken = stored;
        setToken(stored);
      }
    }

    if (!currentToken || currentToken === 'GUEST_BYPASS') {
      const freshToken = await handleRefreshGoogleAuth();
      if (!freshToken) throw new Error('Otentikasi Google diperlukan untuk menyimpan ke Google Sheets.');
      currentToken = freshToken;
    }

    try {
      return await operation(currentToken);
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const isAuthIssue = err?.isAuthError || 
        err?.code === 'UNAUTHENTICATED' || 
        errStr.includes('Token Expired') ||
        errStr.includes('invalid authentication credentials') ||
        errStr.includes('OAuth 2') ||
        errStr.includes('UNAUTHENTICATED') ||
        errStr.includes('Google Drive terputus');

      if (isAuthIssue) {
        const hasUserGesture = typeof navigator !== 'undefined' && 'userActivation' in navigator 
          ? navigator.userActivation.isActive 
          : false;
        if (hasUserGesture) {
          console.warn("OAuth token expired during operation, prompting auto-refresh...");
          try {
            const freshToken = await handleRefreshGoogleAuth();
            if (freshToken) {
              return await operation(freshToken);
            }
          } catch (reauthErr: any) {
            console.warn("Penyegaran token saat operasi dibatalkan atau diblokir:", reauthErr?.message || reauthErr);
          }
        }
      }
      throw err;
    }
  };

  // Helper to ensure atomic record verification and prevent row drop or duplicate
  const verifyAndMergeRecords = (
    fetchedRecords: LandRecord[],
    targetRecord: LandRecord
  ): LandRecord[] => {
    const cleanList: LandRecord[] = [];
    const seenIds = new Set<string>();
    const seenCodes = new Set<string>();

    for (const r of fetchedRecords) {
      const codeKey = (r.CODE || '').trim().toUpperCase();
      const idKey = r.ID_UNIK || '';
      if (codeKey && seenCodes.has(codeKey)) continue;
      if (idKey && seenIds.has(idKey)) continue;
      if (codeKey) seenCodes.add(codeKey);
      if (idKey) seenIds.add(idKey);
      cleanList.push(r);
    }

    const targetCodeKey = (targetRecord.CODE || '').trim().toUpperCase();
    const targetIdKey = targetRecord.ID_UNIK || '';
    const existsInClean = cleanList.some(r => 
      (targetIdKey && r.ID_UNIK === targetIdKey) || 
      (targetCodeKey && r.CODE && r.CODE.trim().toUpperCase() === targetCodeKey)
    );

    if (!existsInClean) {
      cleanList.push(targetRecord);
    }

    return cleanList;
  };

  // Callback to add/update a record in the sheet
  const handleSaveRecord = async (record: LandRecord, isEdit: boolean) => {
    if (isOperatorLocked && operatorLockedProjectId && activeProjectId !== operatorLockedProjectId) {
      throw new Error('Izin Ditolak: Akun operator Anda dikunci hanya untuk jalur proyek yang teregister.');
    }

    if (!spreadsheetId) {
      throw new Error('ID Spreadsheet proyek belum disetel. Periksa konfigurasi di menu Pengaturan.');
    }
    
    await executeWithAuthRetry(async (activeAuthToken) => {
      // 1. Save/append to spreadsheet and get assigned row
      const saved = await saveRecordToSpreadsheet(activeAuthToken, spreadsheetId, record, isEdit, records);
      
      // 2. Refresh local list with atomic min-count verification
      const expectedMinCount = isEdit ? records.length : records.length + 1;
      const updatedRecords = await fetchSpreadsheetRecords(activeAuthToken, spreadsheetId, { expectedMinCount });
      
      // 3. Verify and deduplicate before state update
      const verifiedRecords = verifyAndMergeRecords(updatedRecords, saved);
      const sortedRecords = [...verifiedRecords].sort(compareLandRecords);
      setRecords(sortedRecords);

      // 4. Update Firestore cache
      saveRecordsToFirestoreCache(activeProjectId, sortedRecords);
    });
    
    // Calculate log details
    let logType: 'CREATE' | 'UPDATE' = isEdit ? 'UPDATE' : 'CREATE';
    let logDetails = '';
    
    if (!isEdit) {
      logDetails = `Menambahkan data lahan baru dengan CODE: ${record.CODE} (Nama: ${record.NAMA || '-'})`;
    } else {
      const originalRecord = records.find(r => r.CODE === record.CODE);
      if (originalRecord) {
        const changedFields: string[] = [];
        const fieldsToCompare = [
          { label: 'Nama Pemilik', key: 'NAMA' },
          { label: 'NIK Pemilik', key: 'NIK' },
          { label: 'Desa', key: 'DESA' },
          { label: 'Span', key: 'SPAN' },
          { label: 'No. Bidang', key: 'NOBID' },
          { label: 'Luas Lahan', key: 'LUAS' },
          { label: 'Progres Pemberkasan', key: 'PROGRES_PEMBERKASAN' },
          { label: 'Progres Trabas', key: 'PROGRES_UPLOAD_TRABAS' }
        ] as const;

        fieldsToCompare.forEach(({ label, key }) => {
          if (record[key] !== originalRecord[key]) {
            changedFields.push(`${label} ("${originalRecord[key] || ''}" ➔ "${record[key] || ''}")`);
          }
        });

        if (changedFields.length > 0) {
          logDetails = `Mengubah data lahan CODE: ${record.CODE} pada bagian: ${changedFields.join(', ')}`;
        } else {
          logDetails = `Memperbarui data lahan CODE: ${record.CODE}`;
        }
      } else {
        logDetails = `Mengubah data lahan CODE: ${record.CODE}`;
      }
    }

    // Save log asynchronously
    logActivity(record.CODE, logType, logDetails);
  };

  // Callback to update a record (e.g. after adding file links or admin QC)
  const handleUpdateRecord = async (updatedRecord: LandRecord) => {
    if (isOperatorLocked && operatorLockedProjectId && activeProjectId !== operatorLockedProjectId) {
      throw new Error('Izin Ditolak: Akun operator Anda dikunci hanya untuk jalur proyek yang teregister.');
    }

    if (!spreadsheetId) {
      throw new Error('ID Spreadsheet proyek belum disetel. Periksa konfigurasi di menu Pengaturan.');
    }

    const originalRecord = records.find(r => r.CODE === updatedRecord.CODE);
    let actionType: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'QC' = 'UPDATE';
    let details = `Mengubah data lahan dengan CODE: ${updatedRecord.CODE}`;

    if (originalRecord) {
      // Check if QC status changed
      if (updatedRecord.QC_STATUS !== originalRecord.QC_STATUS) {
        actionType = 'QC';
        details = `Melakukan verifikasi QC untuk CODE: ${updatedRecord.CODE} dengan status: ${updatedRecord.QC_STATUS || 'PENDING'}`;
        if (updatedRecord.QC_NOTES) {
          details += ` (Catatan: "${updatedRecord.QC_NOTES}")`;
        }
      }
      // Check if file upload links changed
      else {
        const fileFields = [
          { name: 'KTP', field: 'LINK_KTP' },
          { name: 'Kartu Keluarga', field: 'LINK_KK' },
          { name: 'Alas Hak', field: 'LINK_ALAS_HAK' },
          { name: 'Surat Kuasa', field: 'LINK_SURAT_KUASA' },
          { name: 'Peralihan Hak', field: 'LINK_PERALIHAN_HAK' },
          { name: 'Keterangan Waris', field: 'LINK_KETERANGAN_WARIS' },
          { name: 'Kuasa Waris', field: 'LINK_KUASA_WARIS' },
          { name: 'Klaim Tanaman', field: 'LINK_KLAIM_TANAMAN' },
          { name: 'Klaim Bangunan', field: 'LINK_KLAIM_BANGUNAN' },
          { name: 'Beda Nama', field: 'LINK_KET_BEDA_NAMA' },
          { name: 'Akta Jual Beli', field: 'LINK_JUAL_BELI' },
          { name: 'Wakaf', field: 'LINK_WAKAF' },
          { name: 'Lainnya', field: 'LINK_DOKUMEN_LAIN' }
        ] as const;

        const uploadedFields: string[] = [];
        const deletedFields: string[] = [];

        fileFields.forEach(({ name, field }) => {
          if (updatedRecord[field] && !originalRecord[field]) {
            uploadedFields.push(name);
          } else if (!updatedRecord[field] && originalRecord[field]) {
            deletedFields.push(name);
          }
        });

        if (uploadedFields.length > 0 || deletedFields.length > 0) {
          actionType = 'UPLOAD';
          const parts: string[] = [];
          if (uploadedFields.length > 0) {
            parts.push(`Mengunggah berkas ${uploadedFields.join(', ')}`);
          }
          if (deletedFields.length > 0) {
            parts.push(`Menghapus berkas ${deletedFields.join(', ')}`);
          }
          details = `${parts.join(' dan ')} untuk CODE: ${updatedRecord.CODE}`;
        } else {
          // General field edits
          const changedFields: string[] = [];
          const fieldsToCompare = [
            { label: 'Nama Pemilik', key: 'NAMA' },
            { label: 'NIK Pemilik', key: 'NIK' },
            { label: 'Desa', key: 'DESA' },
            { label: 'Span', key: 'SPAN' },
            { label: 'No. Bidang', key: 'NOBID' },
            { label: 'Luas Lahan', key: 'LUAS' },
            { label: 'Progres Pemberkasan', key: 'PROGRES_PEMBERKASAN' },
            { label: 'Progres Trabas', key: 'PROGRES_UPLOAD_TRABAS' }
          ] as const;

          fieldsToCompare.forEach(({ label, key }) => {
            if (updatedRecord[key] !== originalRecord[key]) {
              changedFields.push(`${label} ("${originalRecord[key] || ''}" ➔ "${updatedRecord[key] || ''}")`);
            }
          });

          if (changedFields.length > 0) {
            details = `Mengubah data lahan CODE: ${updatedRecord.CODE} pada bagian: ${changedFields.join(', ')}`;
          } else {
            details = `Memperbarui data lahan CODE: ${updatedRecord.CODE}`;
          }
        }
      }
    }

    await executeWithAuthRetry(async (activeAuthToken) => {
      // 1. Save full record back to spreadsheet
      const saved = await saveRecordToSpreadsheet(activeAuthToken, spreadsheetId, updatedRecord, true, records);
      
      // 2. Refresh local list with min-count verification
      const refreshed = await fetchSpreadsheetRecords(activeAuthToken, spreadsheetId, { expectedMinCount: records.length });
      
      // 3. Verify and deduplicate before state update
      const verified = verifyAndMergeRecords(refreshed, saved);
      const sortedRefreshed = [...verified].sort(compareLandRecords);
      setRecords(sortedRefreshed);

      // 4. Update Firestore cache
      saveRecordsToFirestoreCache(activeProjectId, sortedRefreshed);
    });

    // Save log asynchronously
    logActivity(updatedRecord.CODE, actionType, details);
  };

  // Handle Batch Update of Records (e.g. from Merge or Split Bidang)
  const handleBatchUpdateRecords = async (newRecords: LandRecord[], logDetails: string) => {
    const sorted = [...newRecords].sort(compareLandRecords);
    setRecords(sorted);

    // 1. Update localStorage cache
    try {
      localStorage.setItem(`project_ventura_records_cache_${activeProjectId}`, JSON.stringify(sorted));
    } catch (e) {
      console.warn("localStorage quota exceeded:", e);
    }

    // 2. Update Firestore cache
    try {
      await saveRecordsToFirestoreCache(activeProjectId, sorted);
    } catch (e) {
      console.warn("Gagal menyimpan cache Firestore:", e);
    }

    // 3. Log Activity
    logActivity('MUTASI_BIDANG', 'UPDATE', logDetails);

    // 4. Update integrity status if active
    if (integrityStatus) {
      setIntegrityStatus({
        ...integrityStatus,
        cacheCount: sorted.length,
        message: `[Mutasi Bidang Sukses] ${logDetails} (Total: ${sorted.length} bidang).`
      });
    }

    // 5. Toast Feedback
    setSyncFeedback({
      type: 'success',
      message: `✅ Berhasil: ${logDetails}`,
      timestamp: Date.now()
    });
  };

  // Handle Delete Record (Admin Only)
  const handleDeleteRecord = async (targetRecord: LandRecord, adjustNextParcels: boolean = true) => {
    if (role !== 'ADMIN') {
      alert('Akses Ditolak: Hanya akun dengan peran Administrator (ADMIN) yang diizinkan untuk menghapus data bidang.');
      return;
    }

    const { updatedRecords, logSummary } = executeDeleteParcel(records, {
      targetRecord,
      adjustNextParcels
    });

    // Delete row from Google Sheets in background if connected and rowNumber is valid
    if (targetRecord.rowNumber && targetRecord.rowNumber > 1 && spreadsheetId && token && token !== 'GUEST_BYPASS') {
      deleteSpreadsheetRow(token, spreadsheetId, targetRecord.rowNumber).catch(e => {
        console.warn('Gagal menghapus baris di Google Sheets:', e);
      });
    }

    if (selectedRecordForEdit && (selectedRecordForEdit.CODE === targetRecord.CODE || selectedRecordForEdit.ID_UNIK === targetRecord.ID_UNIK)) {
      setSelectedRecordForEdit(null);
    }

    await handleBatchUpdateRecords(updatedRecords, logSummary);
  };

  // Handle Registered Operator Verification
  const handleVerifyOperator = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    const userLower = operatorLoginUsername.trim().toLowerCase();
    const passTrimmed = operatorLoginPassword.trim();

    if (!userLower || !passTrimmed) {
      setPinError('Nama pengguna dan sandi/PIN wajib diisi.');
      return;
    }

    // 1. Check for built-in Admin login
    if (userLower === 'agung763' || userLower === 'admin') {
      if (passTrimmed === rolePins.ADMIN || passTrimmed === 'djancok123') {
        setRole('ADMIN');
        setOperatorName('agung763');
        localStorage.setItem('project_ventura_role', 'ADMIN');
        localStorage.setItem('project_ventura_operator_name', 'agung763');
        
        setIsOperatorLocked(false);
        setOperatorLockedProjectId('');
        localStorage.removeItem('project_ventura_operator_locked');
        localStorage.removeItem('project_ventura_operator_locked_project_id');

        setOperatorLoginUsername('');
        setOperatorLoginPassword('');
        setActiveMenu('dashboard');
        console.log("Admin logged in successfully!");
        return;
      } else {
        setPinError('Sandi PIN Administrator salah.');
        return;
      }
    }

    // 2. Otherwise look in registered operators list
    const matchedOp = operators.find(op => op.username === userLower);

    if (!matchedOp) {
      setPinError('Akun tidak ditemukan. Periksa nama pengguna atau hubungi Admin.');
      return;
    }

    if (matchedOp.password !== passTrimmed) {
      setPinError('Sandi/PIN salah. Hubungi Administrator.');
      return;
    }

    // Success! Log them in
    setRole(matchedOp.role);
    setOperatorName(matchedOp.name);
    localStorage.setItem('project_ventura_role', matchedOp.role);
    localStorage.setItem('project_ventura_operator_name', matchedOp.name);

    // If restricted to 1 project path
    if (matchedOp.projectId && matchedOp.projectId !== 'all') {
      setIsOperatorLocked(true);
      setOperatorLockedProjectId(matchedOp.projectId);
      setActiveProjectId(matchedOp.projectId);
      localStorage.setItem('project_ventura_operator_locked', 'true');
      localStorage.setItem('project_ventura_operator_locked_project_id', matchedOp.projectId);
      localStorage.setItem('project_ventura_active_project_id', matchedOp.projectId);
    } else {
      setIsOperatorLocked(false);
      setOperatorLockedProjectId('');
      localStorage.removeItem('project_ventura_operator_locked');
      localStorage.removeItem('project_ventura_operator_locked_project_id');
    }

    // Clear login fields
    setOperatorLoginUsername('');
    setOperatorLoginPassword('');
    setActiveMenu('dashboard');
    console.log(`Operator "${matchedOp.name}" successfully logged in with role ${matchedOp.role}`);
  };

  // Handle Role Verification (Legacy PIN approach)
  const handleVerifyRole = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    const trimmedName = operatorName.trim();
    if (loginRole !== 'GUEST' && !trimmedName) {
      setPinError('Nama Petugas Lapangan / Operator wajib diisi untuk pelacakan perubahan data.');
      return;
    }

    // Save final trimmed name to localStorage
    const finalOperatorName = trimmedName || 'Tamu Kontraktor';
    setOperatorName(finalOperatorName);
    localStorage.setItem('project_ventura_operator_name', finalOperatorName);

    const isBypass = localStorage.getItem('project_ventura_guest_bypass') === 'true';

    if (loginRole === 'GUEST') {
      // Guest doesn't need strict PIN or can use tamu123
      if (pinInput && pinInput !== rolePins.GUEST) {
        setPinError('PIN Tamu salah. Masukkan "tamu123" atau biarkan kosong.');
        return;
      }
      setRole('GUEST');
      localStorage.setItem('project_ventura_role', 'GUEST');
      setActiveMenu('dashboard');
      setPinInput('');
      return;
    }

    if (isBypass) {
      setPinError(`Peran ${loginRole} memerlukan akses penuh Google Drive & Google Sheets. Silakan kembali ke halaman utama dan hubungkan akun Google Anda.`);
      return;
    }

    const expectedPin = rolePins[loginRole];
    if (pinInput === expectedPin) {
      setRole(loginRole);
      localStorage.setItem('project_ventura_role', loginRole);
      setPinInput('');
      setActiveMenu('dashboard');
    } else {
      setPinError(`PIN untuk peran ${loginRole} salah.`);
    }
  };

  // Switch role action (returns to role selection screen)
  const handleSwitchRole = () => {
    setRole(null);
    setOperatorName('');
    setIsOperatorLocked(false);
    setOperatorLockedProjectId('');
    localStorage.removeItem('project_ventura_role');
    localStorage.removeItem('project_ventura_operator_name');
    localStorage.removeItem('project_ventura_operator_locked');
    localStorage.removeItem('project_ventura_operator_locked_project_id');
  };

  // Admin action: Add new project path
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProj: ProjectConfig = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim().toUpperCase(),
      folderId: newProjectFolderId.trim() || null,
      spreadsheetId: newProjectSpreadsheetId.trim() || null,
      uploadsFolderId: newProjectUploadsFolderId.trim() || null,
      publicCsvUrl: newProjectPublicCsvUrl.trim() || null
    };

    const updated = [...projects, newProj];
    setProjects(updated);
    localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
    saveProjectsToCloud(updated);
    setActiveProjectId(newProj.id);
    localStorage.setItem('project_ventura_active_project_id', newProj.id);
    
    setNewProjectName('');
    setNewProjectSpreadsheetId('');
    setNewProjectFolderId('');
    setNewProjectUploadsFolderId('');
    setNewProjectPublicCsvUrl('');
    setIsAddingProject(false);
  };

  // Admin action: Delete project path
  const handleDeleteProject = (id: string) => {
    if (projects.length <= 1) {
      alert("Harus ada minimal 1 proyek di aplikasi.");
      return;
    }
    if (confirm("Apakah Anda yakin ingin menghapus jalur proyek ini dari daftar aplikasi? (Data di Google Drive/Sheets tidak akan terhapus)")) {
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
      saveProjectsToCloud(updated);
      if (activeProjectId === id) {
        const nextActive = updated[0].id;
        setActiveProjectId(nextActive);
        localStorage.setItem('project_ventura_active_project_id', nextActive);
      }
    }
  };

  // Admin action: Save customized PIN codes
  const handleSavePins = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPins = {
      ADMIN: newAdminPin || rolePins.ADMIN,
      FIELD: newFieldPin || rolePins.FIELD,
      QC: newQcPin || rolePins.QC,
      GUEST: rolePins.GUEST
    };
    setRolePins(updatedPins);
    localStorage.setItem('project_ventura_role_pins', JSON.stringify(updatedPins));
    setShowPinSettings(false);
    alert("PIN Akses berhasil diperbarui!");
  };

  // Start editing manual Spreadsheet & Folder IDs for a project
  const startEditingProject = (proj: ProjectConfig) => {
    setEditingProjectId(proj.id);
    setEditSpreadsheetId(proj.spreadsheetId || '');
    setEditFolderId(proj.folderId || '');
    setEditUploadsFolderId(proj.uploadsFolderId || '');
    setEditPublicCsvUrl(proj.publicCsvUrl || '');
  };

  // Cancel editing IDs
  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditSpreadsheetId('');
    setEditFolderId('');
    setEditUploadsFolderId('');
    setEditPublicCsvUrl('');
  };

  // Save manual Spreadsheet & Folder IDs
  const handleSaveProjectIDs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectId) return;

    const updated = projects.map(p => {
      if (p.id === editingProjectId) {
        return {
          ...p,
          spreadsheetId: editSpreadsheetId.trim() || null,
          folderId: editFolderId.trim() || null,
          uploadsFolderId: editUploadsFolderId.trim() || null,
          publicCsvUrl: editPublicCsvUrl.trim() || null
        };
      }
      return p;
    });

    setProjects(updated);
    localStorage.setItem('project_ventura_projects', JSON.stringify(updated));
    saveProjectsToCloud(updated);

    // Force data reload if we just edited the active project
    if (activeProjectId === editingProjectId) {
      setSpreadsheetId(editSpreadsheetId.trim() || null);
      setProjectUploadsFolderId(editUploadsFolderId.trim() || null);
      if (token) {
        loadProjectData(token, activeProjectId);
      }
    }

    cancelEditingProject();
    alert("Konfigurasi ID Google Drive / Sheets berhasil disimpan!");
  };

  // Copy full project settings JSON to Clipboard
  const handleExportConfig = () => {
    const jsonStr = JSON.stringify(projects, null, 2);
    navigator.clipboard.writeText(jsonStr)
      .then(() => {
        alert("Konfigurasi proyek berhasil disalin ke Clipboard! Silakan paste (tempel) di menu Impor di web Anda.");
      })
      .catch(err => {
        console.error("Gagal menyalin:", err);
        // Fallback: show in textarea
        setBackupJsonString(jsonStr);
        alert("Gagal otomatis menyalin. Silakan salin teks dari kotak yang muncul di bawah.");
      });
  };

  // Import project settings from JSON
  const handleImportConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setImportStatus('idle');
    setImportMessage('');

    if (!backupJsonString.trim()) {
      setImportStatus('error');
      setImportMessage('Masukkan kode konfigurasi terlebih dahulu.');
      return;
    }

    try {
      const parsed = JSON.parse(backupJsonString.trim());
      if (!Array.isArray(parsed)) {
        throw new Error("Data konfigurasi harus berupa Array.");
      }

      // Basic structure validation
      const isValid = parsed.every(p => p && typeof p === 'object' && p.id && p.name);
      if (!isValid) {
        throw new Error("Format data tidak valid. Pastikan setiap proyek memiliki ID dan Nama.");
      }

      setProjects(parsed);
      localStorage.setItem('project_ventura_projects', JSON.stringify(parsed));
      saveProjectsToCloud(parsed);
      
      // Select the first project as active
      if (parsed.length > 0) {
        setActiveProjectId(parsed[0].id);
        localStorage.setItem('project_ventura_active_project_id', parsed[0].id);
        
        // Force refresh active spreadsheet configuration
        setSpreadsheetId(parsed[0].spreadsheetId || null);
        setProjectUploadsFolderId(parsed[0].uploadsFolderId || null);
        
        if (token) {
          loadProjectData(token, parsed[0].id);
        }
      }

      setImportStatus('success');
      setImportMessage('Konfigurasi berhasil diimpor! Data Anda sekarang sepenuhnya sinkron.');
      setBackupJsonString('');
      setTimeout(() => {
        setShowBackupTools(false);
        setImportStatus('idle');
      }, 3000);
    } catch (err: any) {
      setImportStatus('error');
      setImportMessage(`Gagal mengimpor: ${err.message || 'Format tidak valid.'}`);
    }
  };

  // Initialize Admin PIN settings form on open
  useEffect(() => {
    if (showPinSettings) {
      setNewAdminPin(rolePins.ADMIN);
      setNewFieldPin(rolePins.FIELD);
      setNewQcPin(rolePins.QC);
    }
  }, [showPinSettings, rolePins]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden" id="sip_root_app">
      {/* Dynamic Background Blur Blobs - VSS Gold & Charcoal */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>
      <div className="absolute top-[35%] right-[5%] w-[400px] h-[400px] bg-yellow-500/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* 1. TOP BAR NAVBAR */}
      <header className="glass-card border-t-0 border-x-0 sticky top-0 z-40 px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl border-b border-amber-500/20 bg-slate-950/80">
        <div className="flex items-center gap-3.5">
          {/* Compass Icon Badge reflecting VSS Geodetic/GIS Logo */}
          <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/30 shadow-inner flex items-center justify-center">
            <Globe className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse shadow-md shadow-amber-400/50"></div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black text-white tracking-tight leading-none font-sans uppercase">
                  VENTURA <span className="text-amber-400 font-extrabold">SKALA SIMETRIS</span>
                </span>
                <span className="text-[9px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded tracking-wider">
                  VSS
                </span>
              </div>
              <p className="text-[9px] text-slate-400 font-bold tracking-wider uppercase mt-1">Sistem Informasi Pertanahan & Jalur Transmisi</p>
            </div>
          </div>
        </div>

        {/* Project Display Banner and Profile Area */}
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-end z-10">
          {/* Day/Night Toggle Button */}
          <button
            onClick={() => setIsLightMode(prev => !prev)}
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl border border-white/10 hover:border-white/20 transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-bold shrink-0 self-stretch md:self-auto"
            title={isLightMode ? 'Aktifkan Mode Malam' : 'Aktifkan Mode Terang'}
            id="theme_toggle_btn"
          >
            {isLightMode ? (
              <>
                <Moon className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="md:hidden lg:inline">Mode Malam</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="md:hidden lg:inline">Mode Siang</span>
              </>
            )}
          </button>

          {user && role && (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-end">
              {/* Interactive Jalur / Proyek Selector Dropdown */}
              {isOperatorLocked && operatorLockedProjectId ? (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl w-full sm:w-auto sm:max-w-[320px] lg:max-w-[420px] truncate shadow-inner" title="Jalur dikunci oleh akun operator">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[9px] font-extrabold text-amber-300 uppercase tracking-wider shrink-0">Jalur:</span>
                  <span className="text-xs font-extrabold text-white truncate font-sans">
                    {projects.find(p => p.id === activeProjectId)?.name || 'MEMUAT...'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-900 border border-amber-500/40 hover:border-amber-400 px-3 py-1 rounded-xl w-full sm:w-auto sm:max-w-[340px] lg:max-w-[440px] shadow-sm transition-all group">
                  <Briefcase className="w-3.5 h-3.5 text-amber-400 shrink-0 group-hover:text-amber-300" />
                  <span className="text-[9px] font-extrabold text-amber-300 uppercase tracking-wider shrink-0">Jalur:</span>
                  <select
                    id="header_active_project_select"
                    value={activeProjectId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setActiveProjectId(newId);
                      localStorage.setItem('project_ventura_active_project_id', newId);
                    }}
                    className="bg-transparent text-xs font-extrabold text-white focus:outline-none focus:ring-0 cursor-pointer w-full truncate font-sans py-0.5"
                    title="Klik untuk memilih & beralih ke Jalur Transmisi lain"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id} className="bg-slate-950 text-white font-semibold py-1">
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                {/* Sync Button & Connection Status */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleManualSync(false)}
                    disabled={isLoadingData}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 hover:border-white/20 transition-all inline-flex items-center gap-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    title="Sinkronisasi Ulang Data Master Google Sheets"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                    <span>Sync</span>
                  </button>

                  {isLiveGoogleConnected ? (
                    <span 
                      onClick={() => handleManualSync(false)}
                      className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 font-mono cursor-pointer hover:bg-emerald-500/20 transition-all"
                      title="Terhubung Live ke Google Spreadsheet. Klik untuk sinkronisasi."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Live Sheets
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleManualSync(true)}
                      className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-md flex items-center gap-1 font-mono hover:bg-amber-500/25 transition-all cursor-pointer"
                      title="Menggunakan Data Cadangan Cloud. Klik untuk menghubungkan Google Account & Sync Live"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      Mode Cadangan (Hubungkan)
                    </button>
                  )}
                </div>

                {/* Role Badge and Switch */}
                <div className="flex items-center gap-2 pl-2.5 border-l border-white/10 shrink-0">
                  {operatorName && (
                    <div className="flex flex-col text-right pr-1">
                      <span className="text-[10px] font-extrabold text-slate-200 uppercase leading-none">{operatorName}</span>
                      <span className="text-[8px] font-mono text-amber-400 mt-0.5">Operator</span>
                    </div>
                  )}
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                    role === 'ADMIN' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                    role === 'FIELD' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                    role === 'QC' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                    'bg-slate-500/15 text-slate-300 border-slate-500/30'
                  }`} title={`Peran saat ini: ${role}`}>
                    {role === 'ADMIN' ? 'Admin' : role === 'FIELD' ? 'Lapangan' : role === 'QC' ? 'QC' : 'Tamu'}
                  </span>

                  <button
                    onClick={handleSwitchRole}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/10 hover:border-white/20 transition-all text-[10px] font-bold cursor-pointer shrink-0"
                    title="Ganti Jalur Proyek atau Hak Akses / Peran"
                  >
                    Ganti Jalur/Peran
                  </button>
                </div>

                {/* Profile Image & Logout */}
                <div className="flex items-center gap-2 pl-2.5 border-l border-white/10 shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full border border-white/10" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                      {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="p-1.5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
                    title="Keluar Google Account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. AUTHENTICATION & PORTAL LOGINS GATE */}
      {(!user || !token) ? (
        // A. Google Authentication Landing Card (Needs authorization first) - Ventura VSS Corporate Theme
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12 flex flex-col justify-center items-center z-10" id="sip_auth_landing">
          
          {/* Main Hero Container */}
          <div className="w-full max-w-2xl space-y-6">
            
            {/* Top Brand Header Card */}
            <div className="bg-slate-900/95 rounded-3xl overflow-hidden p-7 sm:p-10 text-center space-y-6 shadow-2xl border border-amber-500/25 relative">
              {/* Subtle top accent bar in VSS Gold */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500"></div>

              <div className="mx-auto w-16 h-16 bg-amber-500/15 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10">
                <Globe className="w-8 h-8 text-amber-400" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">
                    PT. VENTURA SKALA SIMETRIS
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase font-sans">
                  Sistem Informasi Pertanahan & GIS
                </h2>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-lg mx-auto font-normal">
                  Platform terpadu inventarisasi pengadaan tanah, survei tegakan & bangunan, pemetaan spasial koridor Right of Way (RoW), serta penyusunan daftar nominatif jalur transmisi.
                </p>
              </div>

              {/* Quick Insight Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-left">
                <div className="p-3 bg-slate-950/80 rounded-xl border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                    <MapIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Peta Spasial GIS</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Visualisasi batas poligon bidang, tapak tower, dan as jalur transmisi interaktif.
                  </p>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-xl border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span>Daftar Nominatif</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Sinkronisasi berkas kepemilikan, alas hak, NIK, dan kompensasi tanam tumbuh.
                  </p>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-xl border border-white/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>QC & Administrasi</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Validasi berlapis data lapangan, mutasi pecah/gabung bidang, & ekspor laporan.
                  </p>
                </div>
              </div>

              {/* Detect if inside iframe and render warning */}
              {typeof window !== 'undefined' && window.self !== window.top && !authError && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-slate-300 text-xs rounded-xl text-left space-y-2 leading-relaxed">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Info className="w-4 h-4 shrink-0 text-amber-400" />
                    <span className="uppercase tracking-wider text-[10px]">Perhatian Akses Iframe</span>
                  </div>
                  <p className="text-[11px]">
                    Jika popup Google Sign-In terhalang pembatasan browser, Anda dapat membuka portal langsung di jendela baru:
                  </p>
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-2 px-3 rounded-lg transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Buka Aplikasi di Tab Baru
                  </a>
                </div>
              )}

              {authError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold rounded-xl flex items-start gap-2 text-left">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">{authError}</div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3 pt-1">
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl px-5 py-3.5 text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-center gap-3">
                    <div className="shrink-0 bg-white p-1 rounded-md">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '18px', height: '18px' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="text-xs uppercase tracking-wider font-extrabold text-slate-950">
                      {isLoggingIn ? 'Menghubungkan Akun...' : 'Masuk Dengan Akun Google (Operator / Admin)'}
                    </span>
                  </div>
                </button>

                <div className="flex items-center justify-center gap-2 text-slate-600">
                  <span className="h-px bg-white/10 flex-1"></span>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">ATAU</span>
                  <span className="h-px bg-white/10 flex-1"></span>
                </div>

                <button 
                  type="button"
                  onClick={handleGuestBypassLogin}
                  className="w-full flex items-center justify-center gap-2.5 bg-slate-950 hover:bg-slate-900 border border-amber-500/20 hover:border-amber-500/50 rounded-xl px-5 py-3 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer shadow-md"
                >
                  <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>MASUK SEBAGAI TAMU (MODE PANTAU / READ-ONLY)</span>
                </button>
              </div>

              {/* Bantuan & Hubungi Admin (WhatsApp & Email Icon Only) */}
              <div className="border-t border-white/10 pt-5 text-left">
                <div className="flex items-center justify-between gap-4 bg-slate-950/70 p-4 rounded-2xl border border-white/5">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Pusat Bantuan & Layanan Informasi
                    </p>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Butuh bantuan akses, izin folder proyek, atau pertanyaan teknis? Hubungi admin kami:
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* WhatsApp Icon Button (Direct Click) */}
                    <a
                      href="https://wa.me/6281225085742?text=Halo%20Admin%20Ventura,%20saya%20membutuhkan%20informasi%20bantuan%20terkait%20Sistem%20Informasi%20Pertanahan%20VSS."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-md hover:shadow-emerald-500/20 active:scale-95 cursor-pointer"
                      title="Hubungi Admin via WhatsApp"
                      aria-label="Hubungi Admin via WhatsApp"
                    >
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                    </a>

                    {/* Email Icon Button (Direct Click) */}
                    <a
                      href="mailto:agungpambudi763@gmail.com?subject=Pertanyaan%20Sistem%20Informasi%20Pertanahan%20VSS"
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-white/10 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
                      title="Kirim Email ke Admin"
                      aria-label="Kirim Email ke Admin"
                    >
                      <Mail className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      ) : !role ? (
        // B. Streamlined Gate based on Auth Type (Guest Bypass vs. Unified Operator/Admin Login)
        token === 'GUEST_BYPASS' ? (
          // 1. Streamlined Guest Gate (Request 2)
          <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center z-10" id="sip_role_gate_guest">
            <div className="glass-card rounded-3xl p-8 md:p-10 max-w-lg w-full shadow-2xl border border-white/10 space-y-6 animate-fadeIn">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-white/5 mx-auto">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight font-sans">Masuk Mode Tamu</h2>
                <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
                  Silakan pilih jalur transmisi / proyek yang ingin Anda pantau (Read-Only).
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="guest_project_select" className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Pilih Jalur Transmisi / Proyek
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400">
                      <Briefcase className="w-4 h-4" />
                    </span>
                    <select
                      id="guest_project_select"
                      value={activeProjectId}
                      onChange={(e) => {
                        setActiveProjectId(e.target.value);
                        localStorage.setItem('project_ventura_active_project_id', e.target.value);
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer font-sans font-bold"
                    >
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id} className="bg-slate-950 text-white font-semibold">
                          {proj.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-2.5 bg-slate-900 border border-white/10 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRole('GUEST');
                      localStorage.setItem('project_ventura_role', 'GUEST');
                      setActiveMenu('dashboard');
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
                  >
                    Masuk Dashboard
                  </button>
                </div>
              </div>
            </div>
          </main>
        ) : (
          // 2. Unified Operator & Admin Login Form (Request 3) - VSS Theme
          <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center items-center z-10" id="sip_role_gate_auth">
            <div className="bg-slate-900/95 rounded-3xl p-8 md:p-10 max-w-lg w-full shadow-2xl border border-amber-500/25 space-y-6 animate-fadeIn relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500"></div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-amber-500/15 text-amber-400 rounded-xl flex items-center justify-center border border-amber-500/30 mx-auto">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight font-sans">Masuk Akun Operator</h2>
                <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
                  Terhubung dengan Google Drive. Silakan masukkan kredensial Nama Pengguna & Sandi/PIN.
                </p>
              </div>

              <form onSubmit={handleVerifyOperator} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="op_login_username" className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Nama Pengguna (Username)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      id="op_login_username"
                      type="text"
                      required
                      value={operatorLoginUsername}
                      onChange={(e) => setOperatorLoginUsername(e.target.value)}
                      placeholder="Masukkan nama pengguna..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label htmlFor="op_login_password" className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Sandi Akses / PIN
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPin ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      id="op_login_password"
                      type={showPin ? 'text' : 'password'}
                      required
                      value={operatorLoginPassword}
                      onChange={(e) => setOperatorLoginPassword(e.target.value)}
                      placeholder="Masukkan sandi atau PIN..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                    />
                  </div>
                </div>

                {pinError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <p>{pinError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-2.5 bg-slate-950 border border-white/10 hover:bg-slate-900 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Ganti Akun Google
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-xs font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    Masuk Operator
                  </button>
                </div>
              </form>
            </div>
          </main>
        )
      ) : (
        /* 3. CORE APP VIEW (NAVBAR + VIEW PANEL) */
        <div className="flex-1 flex flex-col md:flex-row max-w-full w-full p-4 sm:p-6 lg:p-8 gap-6 z-10 relative" id="sip_main_layout">
          
          {/* Backdrop overlay when sidebar is auto-hiding and opened */}
          {!isSidebarPinned && isSidebarHovered && (
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-xs z-45 transition-opacity duration-300"
              onClick={() => setIsSidebarHovered(false)}
            />
          )}

          {/* Floating trigger button and hover strip when unpinned */}
          {!isSidebarPinned && (
            <div className="fixed left-0 top-[120px] z-40 flex items-center">
              {/* Floating Tab Button */}
              <button
                onMouseEnter={() => setIsSidebarHovered(true)}
                onClick={() => setIsSidebarHovered(true)}
                className="p-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-r-2xl shadow-xl border border-l-0 border-amber-400/50 transition-all hover:pr-5 cursor-pointer flex items-center justify-center group font-black"
                title="Arahkan kursor atau klik untuk membuka menu"
              >
                <Menu className="w-4 h-4 group-hover:scale-110 transition-all text-slate-950" />
              </button>
              
              {/* Secret hover-trigger border zone */}
              <div 
                onMouseEnter={() => setIsSidebarHovered(true)}
                className="fixed inset-y-0 left-0 w-3.5 z-30"
              />
            </div>
          )}

          {/* Menu Sidebar */}
          <aside 
            onMouseEnter={() => setIsSidebarHovered(true)}
            onMouseLeave={() => setIsSidebarHovered(false)}
            className={`
              transition-all duration-300 ease-in-out shadow-lg flex flex-col gap-1.5 shrink-0
              ${isSidebarPinned 
                ? 'md:w-64 glass-card p-4 rounded-2xl h-fit border-amber-500/15' 
                : `fixed top-0 left-0 h-full w-72 p-6 z-50 bg-slate-950/98 backdrop-blur-md border-r border-amber-500/20 shadow-2xl transform ${
                    isSidebarHovered ? 'translate-x-0' : '-translate-x-full'
                  }`
              }
            `}
          >
            {/* Sidebar Title with Pinned/Unpinned toggle button */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5 px-1">
              <span className="text-[10px] font-extrabold text-amber-400 tracking-wider uppercase">
                Menu Aplikasi VSS
              </span>
              <button
                type="button"
                onClick={() => {
                  const newPinned = !isSidebarPinned;
                  setIsSidebarPinned(newPinned);
                  localStorage.setItem('project_ventura_sidebar_pinned', String(newPinned));
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
                title={isSidebarPinned ? "Sembunyikan menu otomatis (Auto-hide)" : "Sematkan menu di samping (Pinned)"}
              >
                {isSidebarPinned ? (
                  <Pin className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Pin className="w-3.5 h-3.5 rotate-45 text-slate-500 hover:text-amber-400" />
                )}
              </button>
            </div>

            {/* Menu 1. Dashboard Utama - All roles can see */}
            <button
              onClick={() => {
                setActiveMenu('dashboard');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'dashboard' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              1. Dashboard Utama
            </button>

            {/* Menu 1.1. Daftar Nominatif - All roles can see */}
            <button
              onClick={() => {
                setActiveMenu('nominatif');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'nominatif' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              1.1. Daftar Nominatif
            </button>

            {/* Menu 1.2. Peta Spasial (GIS) - All roles can see */}
            <button
              onClick={() => {
                setActiveMenu('map');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'map' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              1.2. Peta Spasial (GIS)
            </button>

            {/* Menu 1.3. Peta Bidang Tanah - All roles can see */}
            <button
              onClick={() => {
                setActiveMenu('map_span');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'map_span' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              1.3. Peta Bidang Tanah
            </button>

            {/* Menu 1.4. Resume Project - All roles can see */}
            <button
              id="sidebar_menu_resume_project_btn"
              onClick={() => {
                setActiveMenu('resume_project');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'resume_project' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
              1.4. Resume Project
            </button>

            {/* Menu 1.5. Surat Instansi - All roles can see */}
            <button
              id="sidebar_menu_surat_instansi_btn"
              onClick={() => {
                setActiveMenu('surat_instansi');
                if (!isSidebarPinned) setIsSidebarHovered(false);
              }}
              className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                activeMenu === 'surat_instansi' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              1.5. Surat Instansi
            </button>

            {/* Menu 2. Input & Edit Lahan - Locked for Guests */}
            {role !== 'GUEST' && (
              <button
                onClick={() => {
                  setActiveMenu('input');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'input' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Database className="w-4 h-4 shrink-0" />
                2. Input & Edit Lahan
              </button>
            )}

            {/* Menu 3. Verifikasi & QC - Admin and QC only */}
            {(role === 'ADMIN' || role === 'QC') && (
              <>
                <button
                  onClick={() => {
                    setActiveMenu('qc');
                    if (!isSidebarPinned) setIsSidebarHovered(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                    activeMenu === 'qc' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  3. Verifikasi & QC
                </button>

                {/* Menu 3.1. Sanding Data (Peta vs Input) */}
                <button
                  onClick={() => {
                    setActiveMenu('qc_sanding');
                    if (!isSidebarPinned) setIsSidebarHovered(false);
                  }}
                  className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                    activeMenu === 'qc_sanding' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  3.1. Sanding Data (Peta vs Input)
                </button>

                {/* Menu 3.2. Sanding Data ESDM (PDF vs Input) */}
                <button
                  onClick={() => {
                    setActiveMenu('qc_sanding_esdm');
                    if (!isSidebarPinned) setIsSidebarHovered(false);
                  }}
                  className={`w-full text-left pl-7 pr-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                    activeMenu === 'qc_sanding_esdm' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  3.2. Sanding Data ESDM (PDF)
                </button>
              </>
            )}

            {/* Menu 4. Log Aktivitas - Admin only */}
            {role === 'ADMIN' && (
              <button
                onClick={() => {
                  setActiveMenu('logs');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'logs' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                4. Log Aktivitas
              </button>
            )}

            {/* Menu 5. Manajemen Proyek - Admin only */}
            {role === 'ADMIN' && (
              <button
                onClick={() => {
                  setActiveMenu('project');
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                  activeMenu === 'project' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Briefcase className="w-4 h-4 shrink-0 text-amber-400" />
                5. Manajemen Proyek
              </button>
            )}

            {/* Menu Komparasi Cache vs Spreadsheet - Admin only */}
            {role === 'ADMIN' && (
              <button
                id="sidebar_open_diff_modal_btn"
                type="button"
                onClick={() => {
                  handleOpenDiffModal();
                  if (!isSidebarPinned) setIsSidebarHovered(false);
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer text-slate-400 hover:bg-white/5 hover:text-white border border-transparent group"
                title="Buka Komparasi Data Cache vs Google Spreadsheet"
              >
                <div className="flex items-center gap-2.5">
                  <GitCompare className="w-4 h-4 shrink-0 text-amber-400 group-hover:text-amber-300" />
                  <span>Komparasi Cache vs Master</span>
                </div>
                {integrityStatus && integrityStatus.status === 'INCONSISTENT' && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono border border-rose-500/30">
                    Selisih
                  </span>
                )}
              </button>
            )}

            {/* Connected Sheet Display & Fast Jalur Selector */}
            <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 text-[10px] text-slate-400 space-y-2 font-sans shadow-inner">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 uppercase tracking-wide block text-[10px] flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3 text-amber-400" />
                  Jalur Transmisi
                </span>
                <span className="text-[9px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {projects.length} Jalur
                </span>
              </div>

              {!isOperatorLocked ? (
                <div className="relative">
                  <select
                    id="sidebar_active_project_select"
                    value={activeProjectId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setActiveProjectId(newId);
                      localStorage.setItem('project_ventura_active_project_id', newId);
                    }}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-amber-500/30 hover:border-amber-400/60 rounded-lg text-[11px] font-bold text-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer truncate shadow-sm"
                    title="Pilih Jalur Transmisi / Proyek Aktif"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id} className="bg-slate-950 text-white py-1">
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <p className="font-bold text-amber-300 truncate font-sans text-[11px]">
                    {projects.find(p => p.id === activeProjectId)?.name}
                  </p>
                </div>
              )}

              <div className="text-[9px] text-slate-500 leading-normal pt-1.5 border-t border-white/5 space-y-0.5">
                <p className="flex justify-between">
                  <span>Status DB:</span>
                  <span className="font-mono text-slate-300 font-semibold truncate max-w-[130px]">{sheetNameInfo || 'Terhubung'}</span>
                </p>
                <p className="flex justify-between">
                  <span>Hak Akses:</span>
                  <span className="font-semibold text-slate-300">{role === 'ADMIN' ? 'Admin' : role === 'FIELD' ? 'Lapangan' : role === 'QC' ? 'Verifikator' : 'Tamu'}</span>
                </p>
              </div>
            </div>
          </aside>

          {/* Main Display Panel */}
          <main className="flex-1 min-w-0 space-y-6">
            
            {/* INLINE ADMIN FORM: ADD PROJECT PATH - DISABLED (MOVED TO PROJECT MENU) */}
            {false && role === 'ADMIN' && isAddingProject && (
              <div className="glass-card p-5 rounded-2xl border border-amber-500/30 shadow-lg space-y-4 animate-fadeIn" id="admin_add_project_form">
                <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold uppercase tracking-wider">
                  <Plus className="w-4 h-4" />
                  Tambah Jalur Kompensasi Baru
                </div>
                <p className="text-xs text-slate-400">
                  Masukkan nama jalur baru. Jika Anda membiarkan kolom ID Spreadsheet/Folder kosong, sistem akan otomatis membuatnya di Google Drive Anda (memerlukan masuk akun Google). Atau Anda dapat menempelkan ID yang sudah ada langsung di bawah ini.
                </p>
                <form onSubmit={handleAddProject} className="space-y-3 mt-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nama Jalur Kompensasi (Wajib)</label>
                    <input
                      type="text"
                      required
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Contoh: KOMPENSASI ROW 150 kV GRATI - BANGIL"
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase font-semibold placeholder:normal-case placeholder:font-normal"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Google Spreadsheet (Opsional)</label>
                      <input
                        type="text"
                        value={newProjectSpreadsheetId}
                        onChange={(e) => setNewProjectSpreadsheetId(e.target.value)}
                        placeholder="ID Spreadsheet (Contoh: 1aBcDe...)"
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tautan Publik CSV Google Sheet (Opsional)</label>
                      <input
                        type="text"
                        value={newProjectPublicCsvUrl}
                        onChange={(e) => setNewProjectPublicCsvUrl(e.target.value)}
                        placeholder="Contoh: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Folder Utama Drive (Opsional)</label>
                      <input
                        type="text"
                        value={newProjectFolderId}
                        onChange={(e) => setNewProjectFolderId(e.target.value)}
                        placeholder="ID Folder (Contoh: 1XyZ...)"
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Folder PDF Bukti (Opsional)</label>
                      <input
                        type="text"
                        value={newProjectUploadsFolderId}
                        onChange={(e) => setNewProjectUploadsFolderId(e.target.value)}
                        placeholder="ID Folder PDF (Contoh: 1AbC...)"
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingProject(false);
                        setNewProjectName('');
                        setNewProjectSpreadsheetId('');
                        setNewProjectFolderId('');
                        setNewProjectUploadsFolderId('');
                        setNewProjectPublicCsvUrl('');
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-bold rounded-xl cursor-pointer shadow-md"
                    >
                      Simpan & Tambah Jalur
                    </button>
                  </div>
                </form>

                 {/* List of current projects with Delete & Edit option */}
                 <div className="border-t border-white/5 pt-3 mt-3">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Daftar Jalur Saat Ini & ID Koneksi:</span>
                   <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                     {projects.map(proj => (
                       <div key={proj.id} className="flex flex-col gap-1 bg-white/5 p-3 rounded-lg border border-white/5">
                         <div className="flex justify-between items-center text-xs">
                           <span className="font-bold text-slate-200 truncate pr-4">{proj.name}</span>
                           <div className="flex items-center gap-1.5 shrink-0">
                             <span className="text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                               {proj.spreadsheetId ? 'Tersinkron' : 'Belum Setup'}
                             </span>
                             <button
                               type="button"
                               onClick={() => startEditingProject(proj)}
                               className="text-amber-400 hover:text-amber-300 text-[10px] font-bold px-2 py-1 bg-amber-500/10 rounded-md cursor-pointer border border-amber-500/15 hover:bg-amber-500/20"
                               title="Edit Manual ID Spreadsheet & Folder"
                             >
                               Edit ID
                             </button>
                             <button
                               type="button"
                               onClick={() => handleDeleteProject(proj.id)}
                               className="text-rose-400 hover:text-rose-300 text-[10px] font-bold px-2 py-1 bg-rose-500/10 rounded-md cursor-pointer border border-rose-500/15 hover:bg-rose-500/20"
                             >
                               Hapus
                             </button>
                           </div>
                         </div>
                         {proj.spreadsheetId && (
                           <div className="text-[9px] font-mono text-slate-500 truncate pt-1 border-t border-white/5 flex flex-col gap-0.5">
                             <span>Sheet ID: <span className="text-slate-400">{proj.spreadsheetId}</span></span>
                              {proj.publicCsvUrl && <span className="text-emerald-400 font-semibold">Tautan CSV: <span className="text-slate-400">{proj.publicCsvUrl}</span></span>}
                             {proj.folderId && <span>Folder ID: <span className="text-slate-400">{proj.folderId}</span></span>}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Manual IDs editor section */}
                 {editingProjectId && (
                   <form onSubmit={handleSaveProjectIDs} className="mt-4 p-4 bg-slate-900 rounded-xl border border-amber-500/30 space-y-3 animate-fadeIn">
                     <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                         Edit ID Google Drive & Sheets untuk Jalur:
                       </span>
                       <button 
                         type="button"
                         onClick={cancelEditingProject}
                         className="text-slate-400 hover:text-slate-200 font-bold text-xs"
                       >
                         ✕
                       </button>
                     </div>
                     <p className="text-[11px] text-white font-bold font-mono truncate">
                       {projects.find(p => p.id === editingProjectId)?.name}
                     </p>
                     
                     <div className="space-y-3">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Google Spreadsheet ID</label>
                         <input
                           type="text"
                           required
                           value={editSpreadsheetId}
                           onChange={(e) => setEditSpreadsheetId(e.target.value)}
                           placeholder="Contoh: 1aBcDeFgH123456789..."
                           className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                         />
                         <span className="text-[8px] text-slate-500 leading-none">ID dari URL spreadsheet: https://docs.google.com/spreadsheets/d/<span className="font-bold text-slate-400">SPREADSHEET_ID</span>/edit</span>
                          <span className="block mt-2.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Tautan Publik CSV Google Sheet (Untuk Mode Tamu)</label>
                            <input
                              type="text"
                              value={editPublicCsvUrl}
                              onChange={(e) => setEditPublicCsvUrl(e.target.value)}
                              placeholder="Contoh: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv"
                              className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                            />
                            <span className="text-[8px] text-slate-500 leading-none block mt-1">Cara mendapatkan: Di Google Sheet, klik <strong>File ➔ Bagikan ➔ Publikasikan ke Web</strong>, pilih format <strong>Nilai Terpisah Koma (.csv)</strong>, klik Publikasikan, lalu salin tautannya.</span>
                          </span>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-2">
                         <div>
                           <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Folder Utama ID (Optional)</label>
                           <input
                             type="text"
                             value={editFolderId}
                             onChange={(e) => setEditFolderId(e.target.value)}
                             placeholder="Contoh: 1XyZ..."
                             className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none"
                           />
                         </div>
                         <div>
                           <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Folder PDF ID (Optional)</label>
                           <input
                             type="text"
                             value={editUploadsFolderId}
                             onChange={(e) => setEditUploadsFolderId(e.target.value)}
                             placeholder="Contoh: 1AbC..."
                             className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-200 font-mono focus:outline-none"
                           />
                         </div>
                       </div>
                     </div>

                     <div className="flex justify-end gap-1.5 pt-1.5 border-t border-white/5">
                       <button
                         type="button"
                         onClick={cancelEditingProject}
                         className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-[10px] font-bold rounded-lg border border-white/10"
                       >
                         Batal
                       </button>
                       <button
                         type="submit"
                         className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg"
                       >
                         Simpan ID & Sinkronkan
                       </button>
                     </div>
                   </form>
                 )}
              </div>
            )}

            {/* INLINE ADMIN FORM: MANAGE Access PIN codes - DISABLED (MOVED TO PROJECT MENU) */}
            {false && role === 'ADMIN' && showPinSettings && (
              <form onSubmit={handleSavePins} className="glass-card p-5 rounded-2xl border border-amber-500/30 shadow-lg space-y-4 animate-fadeIn" id="admin_manage_pins">
                <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold uppercase tracking-wider">
                  <Settings className="w-4 h-4" />
                  Pengaturan Keamanan: Kelola PIN Akses Peran
                </div>
                <p className="text-xs text-slate-400 leading-normal">
                  Kustomisasi PIN sandi untuk masing-masing level peran pekerjaan lapangan agar keamanan berkas dan spreadsheet terjamin.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Admin</label>
                    <input
                      type="text"
                      required
                      value={newAdminPin}
                      onChange={(e) => setNewAdminPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Lapangan (Field)</label>
                    <input
                      type="text"
                      required
                      value={newFieldPin}
                      onChange={(e) => setNewFieldPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Verifikator (QC)</label>
                    <input
                      type="text"
                      required
                      value={newQcPin}
                      onChange={(e) => setNewQcPin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowPinSettings(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md"
                  >
                    Perbarui PIN
                  </button>
                </div>
              </form>
            )}

            {/* Backup & Import Configurations Tools - DISABLED (MOVED TO PROJECT MENU) */}
            {false && role === 'ADMIN' && showBackupTools && (
              <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 shadow-lg space-y-4 animate-fadeIn" id="admin_backup_sync">
                <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  Alat Migrasi & Sinkronisasi Database (Google Drive & Sheets)
                </div>
                
                <p className="text-xs text-slate-400 leading-relaxed">
                  Gunakan alat ini untuk memindahkan konfigurasi ID Spreadsheet/Folder Google Drive Anda dari halaman Pratinjau (AI Studio) ke Web Mandiri Anda (atau sebaliknya). Ini memastikan data Anda yang berisi ribuan baris langsung tersambung sempurna tanpa harus setup ulang.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                  {/* Export section */}
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider block">1. Ekspor Konfigurasi</span>
                    <p className="text-[11px] text-slate-400">
                      Klik tombol di bawah untuk menyalin seluruh konfigurasi ID jalur proyek saat ini ke clipboard Anda.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportConfig}
                      className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 text-xs font-bold rounded-xl cursor-pointer transition-all"
                    >
                      Salin Kode Konfigurasi Ke Clipboard
                    </button>
                    <p className="text-[9px] text-slate-500 italic">
                      Lakukan ini di halaman tempat data Anda muncul dengan benar (misalnya di panel Pratinjau AI Studio).
                    </p>
                  </div>

                  {/* Import section */}
                  <form onSubmit={handleImportConfig} className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider block">2. Impor Konfigurasi</span>
                    <p className="text-[11px] text-slate-400">
                      Tempel (paste) kode konfigurasi yang telah Anda ekspor di sini untuk menyinkronkan seluruh ID secara instan.
                    </p>
                    <textarea
                      rows={3}
                      value={backupJsonString}
                      onChange={(e) => setBackupJsonString(e.target.value)}
                      placeholder='Tempel kode JSON di sini (diawali dengan "[" dan diakhiri "]")'
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-[11px] font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    
                    {importStatus === 'success' && (
                      <p className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">{importMessage}</p>
                    )}
                    {importStatus === 'error' && (
                      <p className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">{importMessage}</p>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBackupJsonString('');
                          setImportStatus('idle');
                        }}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-lg border border-white/10"
                      >
                        Clear
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg shadow-sm"
                      >
                        Impor & Sinkronkan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Main view container display state */}
            {isLoadingData ? (
              <div className="glass-card p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 min-h-[350px] shadow-lg">
                <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-200 font-sans">Mengkoneksikan Google Drive & Memuat Data Proyek...</p>
                <p className="text-[10px] text-slate-400 italic font-sans max-w-sm">Ini memakan waktu beberapa saat untuk memverifikasi folder & spreadsheet di Google Drive Anda.</p>
                <button
                  onClick={() => {
                    if (activeProjectId) {
                      loadProjectData('GUEST_BYPASS', activeProjectId);
                    }
                  }}
                  className="mt-2 px-3.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-lg border border-slate-700 transition-all cursor-pointer"
                >
                  Batal & Guanakan Mode Cadangan (Lokal/Cloud)
                </button>
              </div>
            ) : dataError ? (
              <div className="glass-card p-8 rounded-2xl space-y-4 shadow-lg">
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                  <div>
                    <strong className="block text-white font-sans">Sinkronisasi Proyek Memerlukan Perhatian</strong>
                    <p className="font-sans text-[11px] mt-0.5">{dataError}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleRefreshGoogleAuth}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Perbarui Sesi Google
                  </button>
                  <button
                    onClick={handleManualSync}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    Coba Sinkronisasi Ulang
                  </button>
                  <button
                    onClick={() => {
                      if (activeProjectId) {
                        loadProjectData('GUEST_BYPASS', activeProjectId);
                      }
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-all cursor-pointer"
                  >
                    Buka Mode Cadangan (Lokal/Cloud)
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-fadeIn space-y-4">
                {/* Sync Feedback Notification Toast Banner */}
                {syncFeedback && (
                  <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg border animate-fadeIn ${
                    syncFeedback.type === 'success' 
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' 
                      : syncFeedback.type === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                      : syncFeedback.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${
                        syncFeedback.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                        syncFeedback.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                        syncFeedback.type === 'error' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {syncFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                        {syncFeedback.type === 'warning' && <AlertCircle className="w-5 h-5" />}
                        {syncFeedback.type === 'error' && <ShieldAlert className="w-5 h-5" />}
                        {syncFeedback.type === 'info' && <RefreshCw className="w-5 h-5 animate-spin" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold font-sans">{syncFeedback.message}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {syncFeedback.type === 'warning' && (
                        <button
                          type="button"
                          onClick={() => handleManualSync(true)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Perbarui Sesi Google
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSyncFeedback(null)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                        title="Tutup Pesan"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Data Integrity Warning Banner - KHUSUS LEVEL ADMIN */}
                {role === 'ADMIN' && integrityStatus && integrityStatus.status === 'INCONSISTENT' && !isIntegrityDismissed && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-rose-500/20 rounded-xl text-rose-400 shrink-0">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-rose-300 uppercase tracking-wide">
                            Peringatan: Data Inkonsisten Terdeteksi
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-500/30">
                            Selisih: {integrityStatus.difference > 0 ? `+${integrityStatus.difference}` : integrityStatus.difference} Baris
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1 leading-normal">
                          {integrityStatus.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        id="banner_open_diff_modal_btn"
                        type="button"
                        onClick={handleOpenDiffModal}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Buka Komparasi Rincian Data Cache vs Spreadsheet"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        Periksa Perbedaan Data
                      </button>

                      <button
                        type="button"
                        onClick={() => handleManualSync(true)}
                        disabled={isLoadingData}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Sinkronkan Ulang Data Langsung dari Google Spreadsheet (Master)"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                        {isLoadingData ? 'Menyinkronkan...' : 'Sinkronkan Ulang dari Master'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsIntegrityDismissed(true)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                        title="Tutup Notifikasi"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                <Suspense fallback={
                  <ModuleLoadingFallback activeMenu={activeMenu} isLightMode={isLightMode} />
                }>
                {activeMenu === 'dashboard' && (
                  <Dashboard 
                    records={records} 
                    role={role} 
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name} 
                    hideZeroLuas={hideZeroLuas}
                    onNavigateToNominatif={() => setActiveMenu('nominatif')}
                    isLiveConnected={isLiveGoogleConnected}
                    onForceSyncMaster={() => handleManualSync(false)}
                    onRefreshGoogleToken={() => handleManualSync(true)}
                    isSyncingMaster={isLoadingData}
                  />
                )}

                {activeMenu === 'nominatif' && (
                  <DaftarNominatifPanel
                    records={records}
                    role={role}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    onNavigateToInput={(rec) => {
                      setSelectedRecordForEdit(rec);
                      setActiveMenu('input');
                    }}
                    onBatchUpdateRecords={handleBatchUpdateRecords}
                    onDeleteRecord={handleDeleteRecord}
                  />
                )}
                
                {activeMenu === 'map' && (
                  <InteractiveMap 
                    records={records} 
                    loadedGeoJSONs={loadedGeoJSONs}
                    role={role} 
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    activeProjectId={activeProjectId}
                    onDeleteRecord={handleDeleteRecord}
                  />
                )}

                {activeMenu === 'map_span' && (
                  <PetaBidangTanah 
                    records={records} 
                    loadedGeoJSONs={loadedGeoJSONs}
                    role={role} 
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    activeProjectId={activeProjectId}
                    onNavigateToInput={(rec) => {
                      setSelectedRecordForEdit(rec);
                      setActiveMenu('input');
                    }}
                    onDeleteRecord={handleDeleteRecord}
                  />
                )}

                {/* Menu 1.4: Resume Project (Per Desa) */}
                {activeMenu === 'resume_project' && (
                  <ResumeProjectPanel 
                    records={records}
                    activeProjectId={activeProjectId}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    role={role}
                    userEmail={user?.email || 'operator@ventura.id'}
                    operatorName={operatorName}
                    accessToken={token || undefined}
                    uploadsFolderId={projectUploadsFolderId || undefined}
                    onNavigateToInput={(rec) => {
                      setSelectedRecordForEdit(rec);
                      setActiveMenu('input');
                    }}
                  />
                )}

                {/* Menu 1.5: Surat Instansi */}
                {activeMenu === 'surat_instansi' && (
                  <SuratInstansiPanel 
                    activeProjectId={activeProjectId}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    role={role}
                    userEmail={user?.email || 'operator@ventura.id'}
                    operatorName={operatorName}
                    accessToken={token || undefined}
                    uploadsFolderId={projectUploadsFolderId || undefined}
                  />
                )}
                
                {activeMenu === 'input' && role !== 'GUEST' && (
                  <FormInput 
                    records={records} 
                    role={role}
                    onSave={handleSaveRecord} 
                    accessToken={token!} 
                    onUpdateRecord={handleUpdateRecord} 
                    onDeleteRecord={handleDeleteRecord}
                    uploadsFolderId={projectUploadsFolderId || undefined}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    initialSelectedRecord={selectedRecordForEdit}
                    onClearInitialRecord={() => setSelectedRecordForEdit(null)}
                    onRefreshGoogleToken={handleRefreshGoogleAuth}
                  />
                )}
                

                {activeMenu === 'qc' && (role === 'ADMIN' || role === 'QC') && (
                  <QCPanel 
                    records={records} 
                    adminEmail={user?.email || 'Admin'} 
                    onSaveQC={handleUpdateRecord} 
                    onNavigateToSanding={() => setActiveMenu('qc_sanding')}
                    onNavigateToSandingEsdm={() => setActiveMenu('qc_sanding_esdm')}
                  />
                )}

                {activeMenu === 'qc_sanding' && (role === 'ADMIN' || role === 'QC' || role === 'FIELD') && (
                  <SandingDataPanel 
                    records={records} 
                    loadedGeoJSONs={loadedGeoJSONs}
                    role={role}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    onNavigateToInput={(rec) => {
                      setSelectedRecordForEdit(rec);
                      setActiveMenu('input');
                    }}
                    onNavigateToMap={(span) => {
                      setActiveMenu('map_span');
                    }}
                    onNavigateToQC={() => setActiveMenu('qc')}
                    onNavigateToSandingEsdm={() => setActiveMenu('qc_sanding_esdm')}
                  />
                )}

                {activeMenu === 'qc_sanding_esdm' && (role === 'ADMIN' || role === 'QC' || role === 'FIELD') && (
                  <SandingEsdmPanel 
                    records={records}
                    role={role || 'FIELD'}
                    activeProjectId={activeProjectId}
                    activeProjectName={projects.find(p => p.id === activeProjectId)?.name}
                    userEmail={user?.email || 'operator@ventura.id'}
                    operatorName={operatorName}
                    onNavigateToQC={() => setActiveMenu('qc')}
                    onNavigateToSandingGeo={() => setActiveMenu('qc_sanding')}
                    onNavigateToInput={(rec) => {
                      setSelectedRecordForEdit(rec);
                      setActiveMenu('input');
                    }}
                  />
                )}
                
                {activeMenu === 'logs' && role === 'ADMIN' && (
                  <ActivityLogsPanel 
                    activeProjectId={activeProjectId} 
                    projects={projects}
                    latestIntegrityLog={integrityStatus}
                    onForceSyncMaster={handleManualSync}
                    onOpenDiffModal={handleOpenDiffModal}
                    isSyncingMaster={isLoadingData}
                  />
                )}
                </Suspense>
                
                {activeMenu === 'project' && role === 'ADMIN' && (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div>
                        <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-amber-400" />
                          MANAJEMEN PROYEK & PIN AKSES
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                          Kelola seluruh jalur kompensasi, tambah jalur baru, ekspor/impor database, dan atur sandi PIN keamanan peran.
                        </p>
                      </div>
                    </div>

                    {/* Secondary Navigation (Sub Tabs) */}
                    <div className="flex items-center gap-2 border-b border-white/10 pb-0.5">
                      <button
                        onClick={() => setProjectSubTab('projects')}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                          projectSubTab === 'projects'
                            ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-xl'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Briefcase className="w-4 h-4 text-amber-400" />
                        Jalur Transmisi / Proyek
                      </button>
                      <button
                        onClick={() => setProjectSubTab('geojson')}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                          projectSubTab === 'geojson'
                            ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-xl'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Layers className="w-4 h-4 text-amber-400" />
                        Manajemen Berkas GeoJSON
                      </button>
                      <button
                        onClick={() => setProjectSubTab('operators')}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                          projectSubTab === 'operators'
                            ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-xl'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Users className="w-4 h-4 text-amber-400" />
                        Registrasi & Kelola Operator
                      </button>
                      <button
                        onClick={() => setProjectSubTab('pins')}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                          projectSubTab === 'pins'
                            ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-xl'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Settings className="w-4 h-4 text-amber-400" />
                        PIN Keamanan Peran
                      </button>
                      <button
                        onClick={() => setProjectSubTab('migration')}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                          projectSubTab === 'migration'
                            ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-xl'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <RefreshCw className="w-4 h-4 text-amber-400" />
                        Ekspor & Impor Database
                      </button>
                    </div>

                    {/* Tab 1: Jalur Transmisi & Proyek */}
                    {projectSubTab === 'projects' && (
                      <div className="space-y-6">
                        {/* Global Dashboard Display Settings Card */}
                        <div className="glass-card p-6 rounded-2xl border border-amber-500/25 bg-slate-900/80 shadow-xl space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                                <Filter className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-white tracking-tight">Pengaturan Filter Data Dashboard Utama</h3>
                                <p className="text-[11px] text-slate-400">
                                  Atur penyaringan data otomatis yang berlaku secara global untuk seluruh peran pengguna (Admin, QC, Lapangan, Tamu) pada Menu 1: Dashboard Utama.
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 self-start sm:self-auto">
                              Global Admin Setting
                            </span>
                          </div>

                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/70 p-4 rounded-xl border border-white/5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-200">Sembunyikan Bidang dengan LUAS = 0 / Kosong / Null</span>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${hideZeroLuas ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                  {hideZeroLuas ? 'AKTIF (Data Disembunyikan)' : 'NONAKTIF (Seluruh Data Tampil)'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl">
                                Jika tombol ini diaktifkan oleh Administrator, data bidang tanah yang belum memiliki nilai LUAS atau bertuliskan LUAS = 0 m² tidak akan dihitung dalam statistik, diagram pie, dan grafik di <strong>Menu 1: Dashboard Utama</strong> untuk SEMUA PENGGUNA (QC, Lapangan, Tamu, Admin).
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleHideZeroLuas(!hideZeroLuas)}
                              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 border ${
                                hideZeroLuas
                                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 font-black border-amber-400'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-md border-slate-600'
                              }`}
                            >
                              <Filter className="w-4 h-4" />
                              {hideZeroLuas ? 'Matikan Filter (Tampilkan Semua Data)' : 'Aktifkan Filter (Sembunyikan Luas 0/Null)'}
                            </button>
                          </div>

                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-200">
                            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p>
                              <strong>Aturan Lingkup Filter:</strong> Aturan ini <u>HANYA BERLAKU DI DASHBOARD UTAMA (MENU 1)</u>. Seluruh sub-menu lainnya seperti <strong>Peta Spasial (GIS), Peta Bidang Tanah, Form Input Data, Verifikasi QC, dan Log Aktivitas</strong> tetap menampilkan 100% seluruh data bidang tanah secara lengkap.
                            </p>
                          </div>
                        </div>

                        {/* List of current projects with Delete & Edit option */}
                        <div className="glass-card p-6 rounded-2xl border border-white/10 shadow-xl space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">Daftar Jalur Saat Ini & ID Koneksi ({projects.length})</span>
                            {!isAddingProject && (
                              <button
                                onClick={() => setIsAddingProject(true)}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Tambah Jalur Baru
                              </button>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {projects.map(proj => (
                              <div key={proj.id} className="flex flex-col gap-2.5 bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="flex justify-between items-start text-xs">
                                  <div className="space-y-1">
                                    <span className="font-extrabold text-slate-200 text-sm block leading-snug">{proj.name}</span>
                                    <span className="text-[10px] text-amber-400 font-mono block">ID: {proj.id}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase tracking-wider border border-emerald-500/20">
                                      {proj.spreadsheetId ? 'Tersinkron' : 'Belum Setup'}
                                    </span>
                                  </div>
                                </div>
                                
                                {proj.spreadsheetId && (
                                  <div className="text-[10px] font-mono text-slate-400 space-y-1 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                      <span>Spreadsheet ID:</span>
                                      <span className="text-amber-200 select-all truncate max-w-[200px]">{proj.spreadsheetId}</span>
                                    </div>
                                    {proj.publicCsvUrl && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-emerald-400">Tautan CSV:</span>
                                        <span className="text-emerald-200 select-all truncate max-w-[200px]">{proj.publicCsvUrl}</span>
                                      </div>
                                    )}
                                    {proj.folderId && (
                                      <div className="flex items-center justify-between">
                                        <span>Folder ID:</span>
                                        <span className="text-amber-200 select-all truncate max-w-[200px]">{proj.folderId}</span>
                                      </div>
                                    )}
                                    {proj.uploadsFolderId && (
                                      <div className="flex items-center justify-between">
                                        <span>Folder PDF ID:</span>
                                        <span className="text-amber-200 select-all truncate max-w-[200px]">{proj.uploadsFolderId}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                                  <button
                                    type="button"
                                    onClick={() => startEditingProject(proj)}
                                    className="text-amber-400 hover:text-amber-300 text-xs font-bold px-3 py-1.5 bg-amber-500/10 rounded-lg cursor-pointer border border-amber-500/15 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                                    title="Edit Manual ID Spreadsheet & Folder"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                    Edit ID
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProject(proj.id)}
                                    className="text-rose-400 hover:text-rose-300 text-xs font-bold px-3 py-1.5 bg-rose-500/10 rounded-lg cursor-pointer border border-rose-500/15 hover:bg-rose-500/20 transition-all"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Tambah Jalur Kompensasi Baru Form */}
                        {isAddingProject && (
                          <div className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4 animate-fadeIn" id="admin_add_project_form">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                              <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold uppercase tracking-wider">
                                <Plus className="w-4 h-4 text-amber-400" />
                                Tambah Jalur Kompensasi Baru
                              </div>
                              <button
                                onClick={() => setIsAddingProject(false)}
                                className="text-slate-400 hover:text-white text-sm font-bold"
                              >
                                ✕
                              </button>
                            </div>
                            <p className="text-xs text-slate-400 leading-normal">
                              Masukkan nama jalur baru. Jika Anda membiarkan kolom ID Spreadsheet/Folder kosong, sistem akan otomatis membuatnya di Google Drive Anda (memerlukan masuk akun Google). Atau Anda dapat menempelkan ID yang sudah ada langsung di bawah ini.
                            </p>
                            <form onSubmit={handleAddProject} className="space-y-3 mt-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nama Jalur Kompensasi (Wajib)</label>
                                <input
                                  type="text"
                                  required
                                  value={newProjectName}
                                  onChange={(e) => setNewProjectName(e.target.value)}
                                  placeholder="Contoh: KOMPENSASI ROW 150 kV GRATI - BANGIL"
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase font-semibold placeholder:normal-case placeholder:font-normal"
                                />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Google Spreadsheet (Opsional)</label>
                                  <input
                                    type="text"
                                    value={newProjectSpreadsheetId}
                                    onChange={(e) => setNewProjectSpreadsheetId(e.target.value)}
                                    placeholder="ID Spreadsheet (Contoh: 1aBcDe...)"
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tautan Publik CSV Google Sheet (Opsional)</label>
                                  <input
                                    type="text"
                                    value={newProjectPublicCsvUrl}
                                    onChange={(e) => setNewProjectPublicCsvUrl(e.target.value)}
                                    placeholder="Contoh: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Folder Utama Drive (Opsional)</label>
                                  <input
                                    type="text"
                                    value={newProjectFolderId}
                                    onChange={(e) => setNewProjectFolderId(e.target.value)}
                                    placeholder="ID Folder (Contoh: 1XyZ...)"
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ID Folder PDF Bukti (Opsional)</label>
                                  <input
                                    type="text"
                                    value={newProjectUploadsFolderId}
                                    onChange={(e) => setNewProjectUploadsFolderId(e.target.value)}
                                    placeholder="ID Folder PDF (Contoh: 1AbC...)"
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAddingProject(false);
                                    setNewProjectName('');
                                    setNewProjectSpreadsheetId('');
                                    setNewProjectFolderId('');
                                    setNewProjectUploadsFolderId('');
                                    setNewProjectPublicCsvUrl('');
                                  }}
                                  className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-300 text-xs font-bold rounded-xl border border-white/10 cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl cursor-pointer shadow-md"
                                >
                                  Simpan & Tambah Jalur
                                </button>
                              </div>
                            </form>
                          </div>
                        )}

                        {/* Manual IDs editor section */}
                        {editingProjectId && (
                          <form onSubmit={handleSaveProjectIDs} className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4 animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                              <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider block">
                                Edit ID Google Drive & Sheets untuk Jalur:
                              </span>
                              <button 
                                type="button"
                                onClick={cancelEditingProject}
                                className="text-slate-400 hover:text-slate-200 font-bold text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            <p className="text-xs text-white font-bold font-mono truncate bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                              {projects.find(p => p.id === editingProjectId)?.name}
                            </p>
                            
                            <div className="space-y-4">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Google Spreadsheet ID</label>
                                <input
                                  type="text"
                                  required
                                  value={editSpreadsheetId}
                                  onChange={(e) => setEditSpreadsheetId(e.target.value)}
                                  placeholder="Contoh: 1aBcDeFgH123456789..."
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                                />
                                <span className="text-[9px] text-slate-500 leading-none mt-1 block">ID dari URL spreadsheet: https://docs.google.com/spreadsheets/d/<span className="font-bold text-slate-400">SPREADSHEET_ID</span>/edit</span>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tautan Publik CSV Google Sheet (Untuk Mode Tamu)</label>
                                <input
                                  type="text"
                                  value={editPublicCsvUrl}
                                  onChange={(e) => setEditPublicCsvUrl(e.target.value)}
                                  placeholder="Contoh: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv"
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                                />
                                <span className="text-[9px] text-slate-500 leading-none block mt-1">Cara mendapatkan: Di Google Sheet, klik <strong>File ➔ Bagikan ➔ Publikasikan ke Web</strong>, pilih format <strong>Nilai Terpisah Koma (.csv)</strong>, klik Publikasikan, lalu salin tautannya.</span>
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Folder Utama ID (Optional)</label>
                                  <input
                                    type="text"
                                    value={editFolderId}
                                    onChange={(e) => setEditFolderId(e.target.value)}
                                    placeholder="Contoh: 1XyZ..."
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Folder PDF ID (Optional)</label>
                                  <input
                                    type="text"
                                    value={editUploadsFolderId}
                                    onChange={(e) => setEditUploadsFolderId(e.target.value)}
                                    placeholder="Contoh: 1AbC..."
                                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                              <button
                                type="button"
                                onClick={cancelEditingProject}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-slate-400 text-xs font-bold rounded-xl border border-white/10"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md"
                              >
                                Simpan ID & Sinkronkan
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {/* Tab 2: PIN Keamanan Peran */}
                    {projectSubTab === 'pins' && (
                      <form onSubmit={handleSavePins} className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4 animate-fadeIn" id="admin_manage_pins">
                        <div className="flex items-center gap-1.5 text-amber-300 text-sm font-bold uppercase tracking-wider border-b border-white/5 pb-2.5">
                          <Settings className="w-5 h-5 text-amber-400" />
                          Pengaturan Keamanan: Kelola PIN Akses Peran
                        </div>
                        <p className="text-xs text-slate-400 leading-normal">
                          Kustomisasi PIN sandi untuk masing-masing level peran pekerjaan lapangan agar keamanan berkas dan spreadsheet terjamin.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Admin</label>
                            <input
                              type="text"
                              required
                              value={newAdminPin}
                              onChange={(e) => setNewAdminPin(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Lapangan (Field)</label>
                            <input
                              type="text"
                              required
                              value={newFieldPin}
                              onChange={(e) => setNewFieldPin(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sandi Verifikator (QC)</label>
                            <input
                              type="text"
                              required
                              value={newQcPin}
                              onChange={(e) => setNewQcPin(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl cursor-pointer shadow-md"
                          >
                            Perbarui PIN
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Tab 3: Ekspor & Impor Database */}
                    {projectSubTab === 'migration' && (
                      <div className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4 animate-fadeIn" id="admin_backup_sync">
                        <div className="flex items-center gap-1.5 text-amber-300 text-sm font-bold uppercase tracking-wider border-b border-white/5 pb-2.5">
                          <RefreshCw className="w-5 h-5 text-amber-400" />
                          Alat Migrasi & Sinkronisasi Database (Google Drive & Sheets)
                        </div>
                        
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Gunakan alat ini untuk memindahkan konfigurasi ID Spreadsheet/Folder Google Drive Anda dari halaman Pratinjau (AI Studio) ke Web Mandiri Anda (atau sebaliknya). Ini memastikan data Anda yang berisi ribuan baris langsung tersambung sempurna tanpa harus setup ulang.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                          {/* Export section */}
                          <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                            <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider block">1. Ekspor Konfigurasi</span>
                            <p className="text-[11px] text-slate-400">
                              Klik tombol di bawah untuk menyalin seluruh konfigurasi ID jalur proyek saat ini ke clipboard Anda.
                            </p>
                            <button
                              type="button"
                              onClick={handleExportConfig}
                              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Salin Semua ID Konfigurasi
                            </button>
                          </div>

                          {/* Import section */}
                          <form onSubmit={handleImportConfig} className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-3">
                            <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider block">2. Impor Konfigurasi</span>
                            <p className="text-[11px] text-slate-400">
                              Tempelkan kode hasil ekspor ke dalam kolom di bawah untuk memuat seluruh ID jalur proyek instan.
                            </p>
                            <div className="space-y-2">
                              <textarea
                                value={backupJsonString}
                                onChange={(e) => setBackupJsonString(e.target.value)}
                                placeholder='Tempel kode JSON di sini (diawali dengan "[" dan diakhiri "]")'
                                className="w-full h-16 p-2 bg-slate-950 border border-white/10 rounded-lg text-[10px] text-amber-300 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                              />
                              
                              {importStatus === 'success' && (
                                <p className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">{importMessage}</p>
                              )}
                              {importStatus === 'error' && (
                                <p className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">{importMessage}</p>
                              )}

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBackupJsonString('');
                                    setImportStatus('idle');
                                  }}
                                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-lg border border-white/10 cursor-pointer"
                                >
                                  Clear
                                </button>
                                <button
                                  type="submit"
                                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg cursor-pointer"
                                >
                                  Impor & Sinkronkan
                                </button>
                              </div>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Manajemen Berkas GeoJSON */}
                    {projectSubTab === 'geojson' && (
                      <div className="space-y-6 animate-fadeIn" id="admin_manage_geojson">
                        
                        {/* A. Info & Description */}
                        <div className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4">
                          <div className="flex items-center gap-1.5 text-amber-300 text-sm font-bold uppercase tracking-wider border-b border-white/5 pb-2.5">
                            <Layers className="w-5 h-5 text-amber-400" />
                            Manajemen File Spasial GeoJSON
                          </div>
                          <p className="text-xs text-slate-400 leading-normal">
                            Unggah, aktifkan, atau atur pemetaan kolom atribut file spasial GeoJSON Anda. Data yang diunggah di sini akan secara otomatis disinkronkan ke seluruh klien dan ditampilkan di Peta Spasial (GIS) secara real-time.
                          </p>

                          {/* Upload Cards Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                            {/* Card upload Bidang */}
                            <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-500/30 flex flex-col justify-between space-y-3">
                              <div>
                                <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                  1. GeoJSON Bidang Tanah
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-1">Poligon bidang per-desa/per-jalur untuk memetakan kepemilikan lahan.</p>
                              </div>
                              <label className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/30 text-white rounded-lg text-xs font-bold text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02]">
                                <UploadCloud className="w-4 h-4 text-white" />
                                Unggah Bidang Tanah
                                <input type="file" accept=".geojson,application/json" onChange={(e) => handleGeoJSONUpload(e, 'bidang')} className="hidden" />
                              </label>
                            </div>

                            {/* Card upload Jalur */}
                            <div className="p-4 bg-amber-950/20 rounded-xl border border-amber-500/30 flex flex-col justify-between space-y-3">
                              <div>
                                <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                  2. GeoJSON Jalur Corridor
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-1">Garis koridor/buffer bebas hambatan ROW transmisi 150 kV.</p>
                              </div>
                              <label className="px-3 py-2 bg-amber-600 hover:bg-amber-500 border border-amber-400/30 text-white rounded-lg text-xs font-bold text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02]">
                                <UploadCloud className="w-4 h-4 text-white" />
                                Unggah Jalur Corridor
                                <input type="file" accept=".geojson,application/json" onChange={(e) => handleGeoJSONUpload(e, 'jalur')} className="hidden" />
                              </label>
                            </div>

                            {/* Card upload Tower */}
                            <div className="p-4 bg-orange-950/20 rounded-xl border border-orange-500/30 flex flex-col justify-between space-y-3">
                              <div>
                                <h4 className="text-xs font-bold text-orange-300 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                                  3. GeoJSON Tapak Tower
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-1">Titik posisi koordinat tower penyangga lengkap dengan nomor tower.</p>
                              </div>
                              <label className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02]">
                                <UploadCloud className="w-4 h-4 text-slate-950" />
                                Unggah Tapak Tower
                                <input type="file" accept=".geojson,application/json" onChange={(e) => handleGeoJSONUpload(e, 'tower')} className="hidden" />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* B. List of currently loaded GeoJSONs */}
                        <div className="glass-card p-6 rounded-2xl border border-white/10 shadow-xl space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/10">
                            <div>
                              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                                Daftar Berkas GeoJSON Cloud Terpasang ({loadedGeoJSONs.length})
                              </span>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Berkas tersimpan permanen di Cloud Database Firestore dan disinkronkan ke seluruh operator.
                              </p>
                            </div>

                            {/* Jalur / Project Filter for GeoJSON list */}
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-slate-400 shrink-0">Filter Jalur:</span>
                              <select
                                value={geoJsonFilterProject}
                                onChange={(e) => setGeoJsonFilterProject(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-900 border border-white/10 text-amber-300 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                              >
                                <option value="ALL">Semua Jalur ({loadedGeoJSONs.length})</option>
                                <option value="global">Global / Semua Jalur</option>
                                {projects.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {loadedGeoJSONs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {loadedGeoJSONs
                                .filter(g => geoJsonFilterProject === 'ALL' || (g.projectId || 'global') === geoJsonFilterProject || g.projectId === 'global')
                                .map((g) => {
                                  const associatedProj = g.projectId === 'global' || !g.projectId
                                    ? 'Semua Jalur (Global)'
                                    : projects.find(p => p.id === g.projectId)?.name || `ID Jalur: ${g.projectId}`;

                                  return (
                                    <div key={g.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5 text-xs">
                                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                                        <span className={`w-3 h-3 rounded-full shrink-0 ${
                                          g.type === 'bidang' ? 'bg-emerald-400' : g.type === 'jalur' ? 'bg-amber-400' : 'bg-orange-400'
                                        }`} />
                                        <div className="overflow-hidden space-y-0.5">
                                          <div className="flex items-center gap-1.5 overflow-hidden">
                                            <span className="text-slate-200 font-bold block truncate" title={g.name}>{g.name}</span>
                                            {g.isDefault && (
                                              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-bold shrink-0">
                                                ⚡ Deployed / Bawaan
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                                            <span className="text-slate-400 font-mono uppercase tracking-wider">
                                              Tipe: {g.type} {g.fieldMapping ? '• Mapped' : '• Auto-Detect'} {g.data?.features ? `• ${g.data.features.length} Fitur` : ''}
                                            </span>
                                            <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-300 border border-amber-500/20 rounded font-semibold truncate max-w-[180px]" title={associatedProj}>
                                              📍 {associatedProj}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          onClick={() => {
                                            setTempMapping(g.fieldMapping || {
                                              desa: '',
                                              span: '',
                                              nobid: '',
                                              nama: '',
                                              tower: '',
                                              jalurName: '',
                                              rotasi: ''
                                            });
                                            setTempLayerProjectId(g.projectId || activeProjectId || 'global');
                                            setTempLayerType(g.type || 'tower');
                                            setConfiguringLayer(g);
                                          }}
                                          className="p-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors border border-amber-500/15"
                                          title="Atur Pemetaan Kolom Atribut & Jalur Proyek"
                                        >
                                          <Settings className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleToggleVisibility(g.id, g.visible)}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                            g.visible ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20' : 'bg-slate-800 text-slate-500'
                                          }`}
                                        >
                                          {g.visible ? 'Sembunyikan' : 'Tampilkan'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveGeoJSON(g.id);
                                          }}
                                          className="p-2 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/20 active:scale-90 rounded-lg transition-all border border-rose-500/20 cursor-pointer shadow-sm"
                                          title="Hapus Lapisan"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-white/5 leading-relaxed">
                              Belum ada berkas GeoJSON eksternal yang diunggah ke cloud. Gunakan tombol di atas untuk mengunggah file.
                            </div>
                          )}
                        </div>

                        {/* C. Dynamic Column Mapping Configuration Modal */}
                        {configuringLayer && (
                          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleUp">
                              
                              {/* Modal Header */}
                              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
                                <div className="flex items-center gap-2">
                                  <Layers className="w-5 h-5 text-amber-400" />
                                  <div>
                                    <h3 className="font-bold text-white text-sm">Pengaturan & Pemetaan GeoJSON</h3>
                                    <p className="text-[11px] text-slate-400 truncate max-w-[280px]">{configuringLayer.name}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setConfiguringLayer(null)}
                                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Modal Content */}
                              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
                                {/* Tipe / Kategori Layer Selection */}
                                <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/20 space-y-1.5">
                                  <label className="text-[11px] font-bold text-amber-200 flex justify-between">
                                    <span>Tipe / Kategori Lapisan GeoJSON:</span>
                                    <span className="text-amber-400 font-bold text-[10px]">Ubah jika salah tipe</span>
                                  </label>
                                  <select
                                    value={tempLayerType}
                                    onChange={(e) => setTempLayerType(e.target.value as 'bidang' | 'jalur' | 'tower')}
                                    className="w-full px-3 py-2 bg-slate-950 border border-amber-500/30 text-amber-100 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400"
                                  >
                                    <option value="tower">🗼 Tapak Tower (Koordinat / Point / Tapak Tower)</option>
                                    <option value="bidang">🏞️ Bidang Tanah (Polygon Batas Lahan / Kepemilikan)</option>
                                    <option value="jalur">🛣️ Jalur Corridor (Line / Koridor Transmisi ROW)</option>
                                  </select>
                                  <p className="text-[10px] text-slate-400">
                                    Pilih jenis lapisan agar kolom atribut dan fungsi visualisasi peta disesuaikan dengan benar.
                                  </p>
                                </div>

                                {/* Project / Jalur Association */}
                                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-1.5">
                                  <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                    <span>Asosiasikan Berkas ke Jalur / Proyek:</span>
                                    <span className="text-amber-400 font-normal text-[10px]">Filter per Jalur</span>
                                  </label>
                                  <select
                                    value={tempLayerProjectId}
                                    onChange={(e) => setTempLayerProjectId(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400"
                                  >
                                    <option value="global">🌐 Semua Jalur (Global - Selalu Tampak)</option>
                                    {projects.map(p => (
                                      <option key={p.id} value={p.id}>📍 {p.name}</option>
                                    ))}
                                  </select>
                                  <p className="text-[10px] text-slate-400">
                                    Menghubungkan berkas GeoJSON ini dengan Jalur Transmisi tertentu agar dapat difilter secara otomatis.
                                  </p>
                                </div>

                                <p className="text-xs text-slate-300 leading-relaxed pt-1">
                                  Pilih nama field (kolom) dari file GeoJSON Anda yang menyimpan data berikut untuk dicocokkan dengan database aplikasi secara real-time.
                                </p>

                                {/* List of fields in GeoJSON to show for reference */}
                                <div className="bg-slate-950 p-3 rounded-xl border border-white/5">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Kolom Tersedia di File:</p>
                                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto scrollbar-thin">
                                    {getGeoJSONKeys(configuringLayer.data).map(key => (
                                      <span key={key} className="text-[9px] font-mono px-1.5 py-0.5 bg-white/5 text-amber-300 rounded border border-white/5">
                                        {key}
                                      </span>
                                    ))}
                                    {getGeoJSONKeys(configuringLayer.data).length === 0 && (
                                      <span className="text-[10px] text-slate-500 font-mono">Tidak ada kolom ditemukan</span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-3.5">
                                  {tempLayerType === 'bidang' && (
                                    <>
                                      {/* Desa */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nama Desa / Kelurahan:</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.desa || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, desa: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Span */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Span / Section (T.xx-T.xx):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.span || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, span: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Nobid */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nomor Bidang Tanah (NOBID):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.nobid || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, nobid: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Nama Pemilik */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nama Pemilik (Nama Final):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.nama || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, nama: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Rotasi */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Field Sudut Rotasi Peta (ROTASI):</span>
                                          <span className="text-emerald-400 font-normal text-[10px]">Rotasi tegak lurus</span>
                                        </label>
                                        <select
                                          value={tempMapping.rotasi || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, rotasi: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Default (Tanpa Rotasi / 0°) --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </>
                                  )}

                                  {tempLayerType === 'tower' && (
                                    <>
                                      {/* Nomor / Label Tower */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nomor / Label Tower (towernumb):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">T.01, T.02, No_Tower</span>
                                        </label>
                                        <select
                                          value={tempMapping.tower || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, tower: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Span / Section Terkait */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Span / Section Terkait (SPAN):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Optional (T.xx - T.xx)</span>
                                        </label>
                                        <select
                                          value={tempMapping.span || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, span: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Desa */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nama Desa / Kelurahan:</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Optional</span>
                                        </label>
                                        <select
                                          value={tempMapping.desa || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, desa: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Rotasi */}
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Field Sudut Rotasi (ROTASI):</span>
                                          <span className="text-emerald-400 font-normal text-[10px]">Optional</span>
                                        </label>
                                        <select
                                          value={tempMapping.rotasi || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, rotasi: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Tanpa Rotasi / Auto --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </>
                                  )}

                                  {tempLayerType === 'jalur' && (
                                    <>
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Nama Jalur / Koridor:</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.jalurName || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, jalurName: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-300 flex justify-between">
                                          <span>Span / Section (SPAN):</span>
                                          <span className="text-amber-400 font-normal text-[10px]">Auto-detect fallback</span>
                                        </label>
                                        <select
                                          value={tempMapping.span || ''}
                                          onChange={(e) => setTempMapping({ ...tempMapping, span: e.target.value })}
                                          className="w-full px-3 py-2 bg-slate-950 border border-white/10 text-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">-- Gunakan Auto-Detect --</option>
                                          {getGeoJSONKeys(configuringLayer.data).map(key => (
                                            <option key={key} value={key}>{key}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Modal Footer */}
                              <div className="p-4 border-t border-white/10 bg-slate-950/40 flex items-center justify-end gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => setConfiguringLayer(null)}
                                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!configuringLayer) return;
                                    const updatedMapping = { ...tempMapping };
                                    const updatedType = tempLayerType;
                                    
                                    // 1. Update React state immediately for instant response
                                    setLoadedGeoJSONs(prev => prev.map(g => g.id === configuringLayer.id ? { ...g, type: updatedType, fieldMapping: updatedMapping, projectId: tempLayerProjectId } : g));

                                    // 2. Update localStorage fallback
                                    try {
                                      const localGeoJSONs = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
                                      const updatedLocal = localGeoJSONs.map((l: any) => l.id === configuringLayer.id ? { ...l, type: updatedType, fieldMapping: updatedMapping, projectId: tempLayerProjectId } : l);
                                      localStorage.setItem('local_geojson_layers', JSON.stringify(updatedLocal));
                                    } catch (e) {}

                                    // 3. Close modal immediately
                                    setConfiguringLayer(null);

                                    // 4. Async sync to Firestore
                                    try {
                                      await setDoc(doc(db, 'geojson_layers', configuringLayer.id), {
                                        type: updatedType,
                                        fieldMapping: updatedMapping,
                                        projectId: tempLayerProjectId
                                      }, { merge: true });
                                    } catch (err) {
                                      console.warn('Gagal menyimpan pemetaan kolom GeoJSON ke Firestore:', err);
                                    }
                                  }}
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95"
                                >
                                  Simpan Pengaturan
                                </button>
                              </div>

                            </div>
                          </div>
                        )}

                      </div>
                    )}

                    {/* Tab: Registrasi & Kelola Operator */}
                    {projectSubTab === 'operators' && (
                      <div className="space-y-6 animate-fadeIn" id="admin_manage_operators">
                        <div className="glass-card p-6 rounded-2xl border border-amber-500/30 shadow-xl space-y-4">
                          <div className="flex items-center gap-1.5 text-amber-300 text-sm font-bold uppercase tracking-wider border-b border-white/5 pb-2.5">
                            <Users className="w-5 h-5 text-amber-400" />
                            Registrasi & Kelola Akun Operator
                          </div>
                          <p className="text-xs text-slate-400 leading-normal">
                            Tambahkan akun khusus untuk staf lapangan, verifikator QC, atau admin tambahan. Operator akan masuk menggunakan <strong>Nama Pengguna (Username)</strong> dan <strong>Sandi/PIN</strong> unik mereka tanpa harus memilih status secara manual. Log aktivitas perubahan data akan mencatat nama masing-masing operator secara otomatis.
                          </p>
                          
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                            {/* Form Pendaftaran */}
                            <form onSubmit={handleAddOperator} className="lg:col-span-5 bg-slate-900/40 p-5 rounded-xl border border-white/5 space-y-4">
                              <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider block border-b border-white/5 pb-1.5">
                                Registrasi Akun Baru
                              </span>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Nama Pengguna (Username)</label>
                                <input
                                  type="text"
                                  required
                                  value={newOpUsername}
                                  onChange={(e) => setNewOpUsername(e.target.value)}
                                  placeholder="contoh: budi_lapangan"
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Sandi Akses / PIN</label>
                                <input
                                  type="text"
                                  required
                                  value={newOpPassword}
                                  onChange={(e) => setNewOpPassword(e.target.value)}
                                  placeholder="contoh: sandi123"
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Nama Lengkap / Tim</label>
                                <input
                                  type="text"
                                  required
                                  value={newOpName}
                                  onChange={(e) => setNewOpName(e.target.value)}
                                  placeholder="contoh: Budi Hartono (Tim 1)"
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Peran Pekerjaan (Role)</label>
                                <select
                                  value={newOpRole}
                                  onChange={(e) => setNewOpRole(e.target.value as any)}
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                                >
                                  <option value="FIELD">PETUGAS LAPANGAN (Input Data)</option>
                                  <option value="QC">VERIFIKATOR QC (Validasi & QC)</option>
                                  <option value="ADMIN">ADMINISTRATOR (Akses Penuh)</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Kunci Akses Jalur Proyek</label>
                                <select
                                  value={newOpProjectId}
                                  onChange={(e) => setNewOpProjectId(e.target.value)}
                                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                                >
                                  <option value="all">Semua Jalur (Akses Global)</option>
                                  {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <span className="text-[8px] text-slate-500 leading-tight block pt-0.5">
                                  Jika dikunci ke jalur tertentu, operator tidak akan bisa melihat atau mengedit data dari jalur proyek lainnya.
                                </span>
                              </div>

                              {operatorError && (
                                <p className="text-[10px] text-rose-400 bg-rose-500/10 px-2.5 py-1.5 rounded-lg border border-rose-500/25 font-semibold leading-normal">
                                  {operatorError}
                                </p>
                              )}

                              {operatorSuccess && (
                                <p className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/25 font-semibold leading-normal">
                                  {operatorSuccess}
                                </p>
                              )}

                              <button
                                type="submit"
                                className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
                              >
                                Daftarkan Akun Operator
                              </button>
                            </form>

                            {/* Daftar Operator Terdaftar */}
                            <div className="lg:col-span-7 bg-slate-900/10 p-1.5 rounded-xl border border-white/5 space-y-3">
                              <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider block border-b border-white/5 pb-1.5 px-3 pt-2">
                                Daftar Akun Terdaftar ({operators.length})
                              </span>

                              {isLoadingOperators ? (
                                <p className="text-xs text-slate-500 text-center py-10">Memuat data operator...</p>
                              ) : operators.length === 0 ? (
                                <div className="text-center py-10 border border-dashed border-white/5 rounded-xl m-2 bg-white/2">
                                  <p className="text-xs text-slate-500">Belum ada akun operator yang terdaftar.</p>
                                  <p className="text-[10px] text-slate-600 mt-1">Gunakan formulir di sebelah kiri untuk mendaftarkan akun operator baru.</p>
                                </div>
                              ) : (
                                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1.5 m-2">
                                  {operators.map((op) => {
                                    const lockedProjName = op.projectId === 'all' 
                                      ? 'Semua Jalur (Akses Global)' 
                                      : projects.find(p => p.id === op.projectId)?.name || `ID: ${op.projectId}`;
                                    
                                    return (
                                      <div key={op.id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 text-xs hover:bg-white/8 transition-all">
                                        <div className="space-y-1 flex-1 min-w-0 pr-4">
                                          <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-slate-200 font-mono text-[11px] truncate block">{op.username}</span>
                                            <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                                              op.role === 'ADMIN' 
                                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                : op.role === 'QC'
                                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                              {op.role}
                                            </span>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="font-semibold text-slate-300">{op.name}</p>
                                            <p className="text-[10px] text-slate-400">
                                              Sandi: <span className="font-mono text-amber-300 font-bold bg-white/5 px-1 rounded">{op.password}</span>
                                            </p>
                                            <p className="text-[9px] text-slate-500 truncate">
                                              Akses: <span className="font-bold text-slate-400">{lockedProjName}</span>
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteOperator(op.username)}
                                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/15 hover:border-rose-500/25 rounded-lg cursor-pointer transition-all shrink-0"
                                          title="Hapus Akun Operator"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Footer Global VSS Corporate - Hanya Tampil di Halaman Login Saja */}
      {(!user || !token) && (
        <footer className="w-full border-t border-white/10 bg-slate-950/80 backdrop-blur-md py-3.5 px-4 sm:px-8 mt-auto z-10">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">PT. Ventura Skala Simetris</span>
              <span className="text-slate-600">•</span>
              <span className="text-[11px] text-slate-400 font-mono">Sistem Informasi Pertanahan & GIS Transmisi</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Bantuan Admin:</span>
              {/* WhatsApp Icon Button (Direct Click without displaying number) */}
              <a
                href="https://wa.me/6281225085742?text=Halo%20Admin%20Ventura,%20saya%20membutuhkan%20informasi%20bantuan%20terkait%20Sistem%20Informasi%20Pertanahan%20VSS."
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Hubungi Admin via WhatsApp"
                aria-label="Hubungi Admin via WhatsApp"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </a>

              {/* Email Icon Button (Direct Click without displaying email address) */}
              <a
                href="mailto:agungpambudi763@gmail.com?subject=Pertanyaan%20Sistem%20Informasi%20Pertanahan%20VSS"
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-white/10 flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Kirim Email ke Admin"
                aria-label="Kirim Email ke Admin"
              >
                <Mail className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </footer>
      )}
      {/* Cache vs Spreadsheet Comparison Modal for Admin */}
      <CacheDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        spreadsheetRecords={spreadsheetRecordsForDiff.length > 0 ? spreadsheetRecordsForDiff : records}
        cachedRecords={cachedRecordsForDiff}
        projectName={projects.find(p => p.id === activeProjectId)?.name}
        onApplySpreadsheet={handleApplySpreadsheetData}
        onApplyCache={handleApplyCacheData}
        isApplying={isApplyingDiffDecision}
      />
    </div>
  );
}
