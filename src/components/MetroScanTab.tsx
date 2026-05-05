import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type Html5QrcodeCameraScanConfig,
  type Html5QrcodeResult,
} from 'html5-qrcode';
import {
  Radio, QrCode, Search, Loader2, ArrowLeft, ScanBarcode,
  CheckCircle, XCircle, MapPin, Package, Clock, ChevronRight
} from 'lucide-react';
import {
  type Metro, type MetroStatus, type ScanMethod,
  findMetroByCode, updateMetroStatus, getMetroScanHistory, getAllLocations, getAllOrders,
  allocateMetroToOrder, getLocation, getOrder, getAllMetros, setRfidAlias,
  normalizeRfidInput, isMetroIdBarcode, parseMetroIdFromScanPayload,
  type ScanEvent, type Location, type Order,
} from '../db';
import MetroBarcode from './MetroBarcode';

/** Barcode tab matches printed metro labels — CODE128 only (see MetroBarcode). */
const BARCODE_SCAN_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.CODE_128,
];

// Which actions are available for each metro status
const STATUS_ACTIONS: Record<MetroStatus, { label: string; nextStatus: MetroStatus; nextType: 'Clean' | 'Soiled'; color: string; desc: string }[]> = {
  Available: [{ label: 'Allocate to Order', nextStatus: 'Allocated', nextType: 'Clean', color: 'btn-primary', desc: 'Assign metro to a delivery order' }],
  Allocated: [{ label: 'Pickup – Load for Transit', nextStatus: 'Pickup', nextType: 'Clean', color: 'btn-warning', desc: 'Metro is being loaded onto transport' }],
  Pickup: [{ label: 'Depart – Mark In Transit', nextStatus: 'InTransit', nextType: 'Clean', color: 'btn-warning', desc: 'Metro has left the dock' }],
  InTransit: [{ label: 'Receive at Storage Location', nextStatus: 'AtStorage', nextType: 'Clean', color: 'btn-success', desc: 'Scan metro at destination storage' }],
  AtStorage: [{ label: 'Mark as Soiled', nextStatus: 'Soiled', nextType: 'Soiled', color: 'btn-danger', desc: 'Textiles used — start soiled return flow' }],
  Soiled: [{ label: 'Pickup Soiled – Send to Dock', nextStatus: 'SoiledTransit', nextType: 'Soiled', color: 'btn-warning', desc: 'Soiled metro heading to dock' }],
  SoiledTransit: [{ label: 'Arrive at Plant', nextStatus: 'AtPlant', nextType: 'Soiled', color: 'btn-info', desc: 'Metro arrived at laundry plant' }],
  AtPlant: [{ label: 'Start Cleaning', nextStatus: 'Cleaning', nextType: 'Soiled', color: 'btn-info', desc: 'Cleaning process started' }],
  Cleaning: [{ label: 'Cleaned – Return to Buffer', nextStatus: 'Available', nextType: 'Clean', color: 'btn-success', desc: 'Metro cleaned and back in clean buffer' }],
};

export default function MetroScanTab({ onDataChange, initialMetroId, onInitialConsumed }: {
  onDataChange: () => void;
  initialMetroId?: string | null;
  onInitialConsumed?: () => void;
}) {
  const [scanMode, setScanMode] = useState<'barcode' | 'qrcode' | 'rfid'>(initialMetroId ? 'rfid' : 'barcode');
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [metro, setMetro] = useState<Metro | null>(null);
  const [metroLocation, setMetroLocation] = useState<Location | null>(null);
  const [history, setHistory] = useState<ScanEvent[]>([]);
  const [error, setError] = useState('');
  const [showAllocate, setShowAllocate] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [actionLocationId, setActionLocationId] = useState('');
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraInitError, setCameraInitError] = useState('');
  const [lastRfidRaw, setLastRfidRaw] = useState<string | null>(null);
  const [pendingLinkTag, setPendingLinkTag] = useState<string | null>(null);
  const [linkTargetMetroId, setLinkTargetMetroId] = useState('');
  const [metrosForLink, setMetrosForLink] = useState<Metro[]>([]);
  const [linkedOrder, setLinkedOrder] = useState<Order | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  /** Bumped when the camera effect cleans up or mode changes, so stale async starts do not block or clobber the active session. */
  const scanSessionRef = useRef(0);
  /** Serializes camera teardown so a new Html5Qrcode never mounts while the previous stream/DOM is still releasing (fixes Barcode ↔ QR switch). */
  const stopChainRef = useRef(Promise.resolve());
  const rfidInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { getAllLocations().then(setLocations); }, []);

  useEffect(() => {
    if (!metro?.orderId) {
      setLinkedOrder(null);
      return;
    }
    void getOrder(metro.orderId).then(o => setLinkedOrder(o ?? null));
  }, [metro?.orderId]);

  useEffect(() => {
    if (!pendingLinkTag) {
      setMetrosForLink([]);
      return;
    }
    void getAllMetros().then(ms => {
      const sorted = ms.sort((a, b) => a.id.localeCompare(b.id));
      setMetrosForLink(sorted);
      setLinkTargetMetroId(prev => (prev && sorted.some(m => m.id === prev) ? prev : (sorted[0]?.id ?? '')));
    });
  }, [pendingLinkTag]);

  const isCameraMode = scanMode === 'barcode' || scanMode === 'qrcode';

  useEffect(() => {
    // Do not tie the camera to `error`: a failed lookup would unmount #reader and stop scanning,
    // so users could not retry without "Scan Another". NFC deep-link still uses RFID tab first.
    if (!isCameraMode || metro || initialMetroId) {
      setCameraInitError('');
      void stopScanner();
      return;
    }
    setCameraInitError('');
    void startScanner();
    return () => {
      scanSessionRef.current += 1;
      void stopScanner();
    };
  }, [scanMode, metro, initialMetroId]);

  const cameraErrorMessage = (e: unknown): string => {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as Error).name) : '';
    const msg = e instanceof Error ? e.message : String(e);
    const combined = `${name} ${msg}`.toLowerCase();
    if (!window.isSecureContext) {
      return 'The camera only works on HTTPS (or localhost on this same device). On your PC in the tops-scanner folder run: npm run dev — then on your phone open https://YOUR_PC_LAN_IP:5173 (not http). Accept the “not secure” certificate warning once. For a production build over HTTPS: npm run build && npm run start — then use https://YOUR_PC_LAN_IP:3000. Deploying to any real HTTPS host also fixes this.';
    }
    if (combined.includes('notallowed') || combined.includes('permission')) {
      return 'Camera permission was blocked. In your browser settings, allow camera for this site, then tap Retry.';
    }
    if (combined.includes('notfound') || combined.includes('no cameras')) {
      return 'No usable camera was found on this device.';
    }
    if (combined.includes('overconstrained') || combined.includes('constraint')) {
      return 'This device could not open the camera with the requested settings. Tap Retry to try another camera.';
    }
    return msg || 'Could not start the camera. Check permissions and that you are on HTTPS (required on phones).';
  };

  const pickPreferredCameraId = (devices: { id: string; label: string }[]): string | null => {
    if (!devices.length) return null;
    const back = devices.find(d => /back|rear|environment|wide|world/i.test(d.label));
    return (back ?? devices[0]).id;
  };

  const stopScanner = (): Promise<void> => {
    const inst = scannerRef.current;
    if (!inst) {
      setIsScanning(false);
      return stopChainRef.current;
    }
    const captured = inst;
    scannerRef.current = null;
    setIsScanning(false);
    const task = stopChainRef.current.then(async () => {
      try {
        if (captured.isScanning) await captured.stop();
      } catch (_) {}
      try {
        captured.clear();
      } catch (_) {}
    });
    stopChainRef.current = task.catch(() => {});
    return task;
  };

  const startScanner = async () => {
    await stopScanner();
    const sessionAtStart = scanSessionRef.current;
    setCameraInitError('');
    setCameraStarting(true);
    try {
      if (sessionAtStart !== scanSessionRef.current) return;
      if (!window.isSecureContext) {
        throw new Error('INSECURE_CONTEXT');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not expose the camera API (getUserMedia).');
      }

      const mode = scanMode;
      const formatsToSupport = mode === 'barcode'
        ? BARCODE_SCAN_FORMATS
        : [Html5QrcodeSupportedFormats.QR_CODE];

      // QR mode stays ZXing-only (native BarcodeDetector + teardown caused missed QR / stuck camera). Barcode mode may use native detector when available (often better on mobile).
      const instance = new Html5Qrcode('reader', {
        formatsToSupport,
        useBarCodeDetectorIfSupported: mode === 'barcode',
        verbose: false,
      });
      scannerRef.current = instance;

      const buildCameraConfig = (cam: string | { facingMode: string }): Html5QrcodeCameraScanConfig => {
        const base: Html5QrcodeCameraScanConfig = {
          fps: mode === 'barcode' ? 20 : 10,
          qrbox: (vw: number, vh: number) => {
            if (mode === 'barcode') {
              // 1D CODE128 needs enough vertical pixels across the bars; a short crop misses decodes on phones.
              const w = Math.min(vw * 0.96, 720);
              const h = Math.min(Math.max(200, Math.floor(vh * 0.46)), 400);
              return { width: w, height: h };
            }
            const edge = Math.min(vw, vh, 720);
            const box = Math.max(140, Math.floor(edge * 0.72));
            return { width: box, height: box };
          },
        };
        if (mode === 'barcode') {
          const hiRes: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
          base.videoConstraints =
            typeof cam === 'string'
              ? { deviceId: { exact: cam }, ...hiRes }
              : { facingMode: cam.facingMode, ...hiRes };
        }
        return base;
      };

      const onOk = (text: string, result: Html5QrcodeResult) => {
        const fmt = result.result.format?.format;
        if (mode === 'qrcode') {
          if (fmt !== undefined && fmt !== Html5QrcodeSupportedFormats.QR_CODE) return;
        } else {
          if (fmt === Html5QrcodeSupportedFormats.QR_CODE) return;
          // Trust decoded text for metro labels; some devices report missing/inconsistent format enums for CODE128.
          if (!isMetroIdBarcode(text)) return;
        }
        const code =
          mode === 'qrcode' ? parseMetroIdFromScanPayload(text) : normalizeRfidInput(text);
        if (!code) return;
        if (mode === 'barcode' && !isMetroIdBarcode(code)) return;
        void (async () => {
          await stopScanner();
          await lookupMetro(code, 'CAMERA');
        })();
      };

      const devices = await Html5Qrcode.getCameras();

      if (sessionAtStart !== scanSessionRef.current) {
        try { if (instance.isScanning) await instance.stop(); } catch (_) {}
        try { instance.clear(); } catch (_) {}
        if (scannerRef.current === instance) scannerRef.current = null;
        return;
      }

      const preferredId = pickPreferredCameraId(devices);
      const tryOrder: Array<string | { facingMode: string }> = preferredId
        ? [preferredId, { facingMode: 'environment' }, { facingMode: 'user' }]
        : [{ facingMode: 'environment' }, { facingMode: 'user' }];
      let lastErr: unknown;
      let started = false;
      for (const cam of tryOrder) {
        if (sessionAtStart !== scanSessionRef.current || scannerRef.current !== instance) break;
        try {
          await instance.start(cam as any, buildCameraConfig(cam), onOk, () => {});
          started = true;
          break;
        } catch (err) {
          lastErr = err;
          try {
            if (instance.isScanning) await instance.stop();
          } catch (_) {}
          try {
            instance.clear();
          } catch (_) {}
        }
      }
      if (sessionAtStart !== scanSessionRef.current) {
        try { if (instance.isScanning) await instance.stop(); } catch (_) {}
        try { instance.clear(); } catch (_) {}
        if (scannerRef.current === instance) scannerRef.current = null;
        return;
      }
      if (!started && scannerRef.current === instance) throw lastErr ?? new Error('Camera start failed');
      setIsScanning(true);
    } catch (e: unknown) {
      if (sessionAtStart === scanSessionRef.current) {
        console.error(e);
        setIsScanning(false);
        setCameraInitError(cameraErrorMessage(e));
        try {
          if (scannerRef.current?.isScanning) await scannerRef.current.stop();
        } catch (_) {}
        try {
          scannerRef.current?.clear();
        } catch (_) {}
        scannerRef.current = null;
      }
    } finally {
      setCameraStarting(false);
    }
  };

  const lookupMetroFromManualInput = (raw: string) => {
    if (scanMode === 'barcode' && !isMetroIdBarcode(raw)) {
      setError('Barcode mode only reads metro labels (e.g. MTR-001). Use QR Code for other payloads.');
      return;
    }
    const code =
      scanMode === 'qrcode' ? parseMetroIdFromScanPayload(raw) : normalizeRfidInput(raw);
    void lookupMetro(code, scanMode === 'rfid' ? 'RFID' : 'MANUAL');
  };

  const lookupMetro = useCallback(async (code: string, _method: ScanMethod) => {
    const norm = normalizeRfidInput(code);
    if (!norm) return;
    setLastRfidRaw(norm);
    setIsLoading(true);
    setError('');
    setPendingLinkTag(null);
    const found = await findMetroByCode(norm);
    if (found) {
      setMetro(found);
      const loc = await getLocation(found.locationId);
      setMetroLocation(loc || null);
      const h = await getMetroScanHistory(found.id);
      setHistory(h);
      setManualCode('');
    } else {
      setError(`Metro or tag "${norm}" not found in the system.`);
      if (_method === 'RFID' && norm.length >= 4) {
        setPendingLinkTag(norm);
      }
    }
    setIsLoading(false);
  }, []);

  const handleSaveTagLink = async () => {
    if (!pendingLinkTag || !linkTargetMetroId) return;
    await setRfidAlias(pendingLinkTag, linkTargetMetroId);
    setPendingLinkTag(null);
    setError('');
    setManualCode('');
    await lookupMetro(linkTargetMetroId, 'RFID');
  };

  // Bluetooth HID wedge: many readers send EPC without Enter; treat idle after keystrokes as end-of-scan.
  useEffect(() => {
    if (scanMode !== 'rfid' || metro || error) return;
    const v = normalizeRfidInput(manualCode);
    if (!v) return;
    const hexEPC = /^[0-9A-Fa-f]+$/.test(v) && v.length >= 8;
    const metroSku = /^MTR-\d+$/i.test(v);
    if (!hexEPC && !metroSku) return;
    const t = window.setTimeout(() => {
      void lookupMetro(v, 'RFID');
    }, 140);
    return () => window.clearTimeout(t);
  }, [manualCode, scanMode, metro, error, lookupMetro]);

  // ── NFC / RFID auto-detect: auto-lookup if metro ID came from NFC tag ──
  useEffect(() => {
    if (initialMetroId) {
      void lookupMetro(initialMetroId, 'RFID');
      if (onInitialConsumed) onInitialConsumed();
    }
  }, [initialMetroId, lookupMetro]);

  useEffect(() => {
    if (scanMode === 'rfid' && !metro && !error) {
      rfidInputRef.current?.focus();
    }
  }, [scanMode, metro, error]);

  const handleAction = async (nextStatus: MetroStatus, nextType: 'Clean' | 'Soiled', actionLabel: string) => {
    if (!metro) return;
    if (nextStatus === 'Allocated') { // Show allocate modal
      const ords = await getAllOrders();
      setOrders(ords.filter(o => o.status === 'Draft' || o.status === 'Allocated'));
      setShowAllocate(true);
      return;
    }
    const locId = actionLocationId || metro.locationId;
    await updateMetroStatus(metro.id, nextStatus, locId, nextType, metro.orderId, metro.lastScanMethod, actionLabel);
    onDataChange();
    lookupMetro(metro.id, metro.lastScanMethod);
  };

  const handleAllocateConfirm = async () => {
    if (!metro || !selectedOrderId) return;
    await allocateMetroToOrder(selectedOrderId, metro.id, scanMode === 'rfid' ? 'RFID' : 'MANUAL');
    setShowAllocate(false);
    onDataChange();
    lookupMetro(metro.id, metro.lastScanMethod);
  };

  const resetView = () => {
    setMetro(null);
    setError('');
    setManualCode('');
    setActionLocationId('');
    setCameraInitError('');
    setLastRfidRaw(null);
    setPendingLinkTag(null);
    setLinkTargetMetroId('');
  };

  const actions = metro ? (STATUS_ACTIONS[metro.status] || []) : [];

  return (
    <>
      {/* Scan mode tabs */}
      <div className="card">
        <div className="scan-tabs">
          {[
            ['barcode', ScanBarcode, 'Barcode'] as const,
            ['qrcode', QrCode, 'QR Code'] as const,
            ['rfid', Radio, 'RFID'] as const,
          ].map(([key, Icon, label]) => (
            <button key={key} className={`scan-tab ${scanMode === key ? 'active' : ''}`} onClick={() => { resetView(); setScanMode(key); }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="scanner-status">
          <span>Metro Scanner</span>
          <span className={`status-dot ${isCameraMode && isScanning ? 'active' : 'inactive'}`}>
            {isCameraMode && isScanning ? 'Active' : scanMode === 'rfid' ? 'Ready' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Camera view — keep mounted while `error` is set so retries work without "Scan Another" */}
      {!metro && isCameraMode && (
        <div className="card">
          {cameraInitError ? (
            <div style={{ padding: '1rem 1.1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#b91c1c' }}>Camera unavailable</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{cameraInitError}</div>
              <div className="btn-group">
                <button type="button" className="btn btn-primary" onClick={() => { setCameraInitError(''); void startScanner(); }}>Retry camera</button>
                <button type="button" className="btn btn-outline" onClick={() => setScanMode('rfid')}>Use manual / RFID entry</button>
              </div>
            </div>
          ) : (
            <div className="scanner-container">
              {scanMode === 'barcode' && (
                <p style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 2, margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.92)', textAlign: 'center', textShadow: '0 1px 2px rgba(0,0,0,0.75)', pointerEvents: 'none', lineHeight: 1.35 }}>
                  Metro barcodes only — <strong style={{ fontWeight: 700 }}>MTR-###</strong> (CODE128). Hold ~15–25&nbsp;cm, steady, with even light; fill the green frame with the bars.
                </p>
              )}
              <div id="reader" />
              {cameraStarting && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#fff', textAlign: 'center', zIndex: 2, pointerEvents: 'none' }}>
                  <Loader2 className="animate-spin" size={26} /><div style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>Starting camera…</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual / RFID entry */}
      {!metro && (
        <div className="card">
          <div className="card-header"><span className="card-title">{scanMode === 'rfid' ? 'RFID / keyboard wedge' : 'Enter metro ID'}</span></div>
          {scanMode === 'rfid' && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Pair your wearable reader in <strong>Bluetooth HID (keyboard)</strong> mode. Focus this page, select <strong>RFID</strong> above, then pull the trigger — the EPC appears here. First time only: if the tag is unknown, link it to a metro below, then use <strong>Allocate to Order</strong> on the metro card to attach a work order.
            </p>
          )}
          {scanMode === 'rfid' && lastRfidRaw && (
            <div style={{ fontSize: '0.8rem', marginBottom: '0.6rem', color: 'var(--text-muted)' }}>
              Last lookup: <code style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{lastRfidRaw}</code>
            </div>
          )}
          <div className="search-row">
            <input
              ref={scanMode === 'rfid' ? rfidInputRef : undefined}
              className="input-field"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder={scanMode === 'rfid' ? 'Waiting for RFID / EPC input…' : 'e.g. MTR-001'}
              autoFocus={scanMode === 'rfid'}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  lookupMetroFromManualInput(manualCode);
                }
              }}
              onPaste={e => {
                if (scanMode !== 'rfid') return;
                const text = e.clipboardData.getData('text/plain');
                const norm = normalizeRfidInput(text);
                if (norm.length >= 4) {
                  e.preventDefault();
                  setManualCode(norm);
                  window.setTimeout(() => void lookupMetro(norm, 'RFID'), 0);
                }
              }}
            />
            <button type="button" className="btn btn-primary" disabled={isLoading || !manualCode.trim()}
              onClick={() => lookupMetroFromManualInput(manualCode)}>
              {isLoading ? <Loader2 className="animate-spin" size={15} /> : <><Search size={15} /> Search</>}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <XCircle size={22} />
            </div>
            <div><div style={{ fontWeight: 700 }}>{error}</div><div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Check the metro ID and try again.</div></div>
          </div>
          {pendingLinkTag && metrosForLink.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1rem' }}>
              <div className="form-label">Link this tag to a metro (saved on this device)</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem', wordBreak: 'break-all' }}>Tag: <code>{pendingLinkTag}</code></div>
              <select className="input-field mb-1" value={linkTargetMetroId} onChange={e => setLinkTargetMetroId(e.target.value)}>
                {metrosForLink.map(m => <option key={m.id} value={m.id}>{m.id} — {m.contents}</option>)}
              </select>
              <button type="button" className="btn btn-primary" disabled={!linkTargetMetroId} onClick={() => void handleSaveTagLink()}>
                Save link &amp; open metro
              </button>
            </div>
          )}
          <button type="button" className="btn btn-outline" onClick={resetView}><ArrowLeft size={14} /> Scan Another</button>
        </div>
      )}

      {/* Metro details */}
      {metro && (
        <div className="card" style={{ padding: 0 }}>
          <div className="metro-detail">
            <div className="metro-detail-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{metro.id}</span>
                  <span className={`badge badge-${metro.status.toLowerCase()}`}>{metro.status}</span>
                  <span className={`badge badge-${metro.type.toLowerCase()}`}>{metro.type}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{metro.contents}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={resetView}><ArrowLeft size={12} /> Back</button>
            </div>

            <div className="metro-detail-body">
              <MetroBarcode metroId={metro.id} />
              <div className="detail-grid">
                <div className="detail-item"><div className="detail-label">Location</div><div className="detail-value"><MapPin size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {metroLocation?.name || metro.locationId}</div></div>
                <div className="detail-item"><div className="detail-label">Area</div><div className="detail-value">{metroLocation?.area || '—'}</div></div>
                <div className="detail-item"><div className="detail-label">Work order</div><div className="detail-value">{metro.orderId ? <><Package size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {metro.orderId}{linkedOrder?.description ? ` — ${linkedOrder.description}` : ''}</> : '— None —'}</div></div>
                <div className="detail-item"><div className="detail-label">Last Scanned</div><div className="detail-value"><Clock size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {new Date(metro.lastScannedAt).toLocaleString()}</div></div>
              </div>

              {/* Select destination location for transit actions */}
              {actions.length > 0 && ['InTransit', 'SoiledTransit', 'Cleaning'].includes(metro.status) && (
                <div className="mt-1">
                  <label className="form-label">Destination Location</label>
                  <select className="input-field" value={actionLocationId} onChange={e => setActionLocationId(e.target.value)}>
                    <option value="">Current location ({metroLocation?.name})</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.area})</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Workflow actions */}
            {actions.length > 0 && (
              <div className="metro-detail-footer">
                <div className="form-label" style={{ marginBottom: '0.5rem' }}>Next Action</div>
                <div className="btn-group">
                  {actions.map(a => (
                    <button key={a.nextStatus} className={`btn ${a.color}`}
                      onClick={() => handleAction(a.nextStatus, a.nextType, a.label)}>
                      <ChevronRight size={14} /> {a.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  {actions[0].desc}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan history timeline */}
      {metro && history.length > 0 && (
        <div className="card">
          <div className="card-title mb-1">Scan History</div>
          <div className="timeline">
            {history.slice(0, 8).map(evt => (
              <div key={evt.id} className="timeline-item">
                <div className="timeline-dot"><Clock size={12} /></div>
                <div className="timeline-content">
                  <div className="timeline-action">{evt.action}</div>
                  <div className="timeline-meta">{new Date(evt.timestamp).toLocaleString()} · {evt.method} · {evt.userId}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocate modal */}
      {showAllocate && (
        <div className="modal-overlay" onClick={() => setShowAllocate(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Allocate {metro?.id} to Order</h3>
            <label className="form-label">Select Order</label>
            <select className="input-field mb-1" value={selectedOrderId} onChange={e => setSelectedOrderId(e.target.value)}>
              <option value="">— Select —</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.description}</option>)}
            </select>
            <div className="btn-group">
              <button className="btn btn-primary" disabled={!selectedOrderId} onClick={handleAllocateConfirm}>Allocate</button>
              <button className="btn btn-outline" onClick={() => setShowAllocate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
