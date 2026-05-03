import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Radio, QrCode, Wifi, CheckCircle, XCircle,
  ArrowLeft, Loader2, Plus, Trash2, Search, RefreshCw, Package, X, ScanBarcode
} from 'lucide-react';
import {
  type Order, type ScanMethod,
  getAllOrders, createOrder, deleteOrder, addBarcodeToOrder,
  removeBarcodeFromOrder, addRfidToOrder, searchOrdersByBarcode,
  getNextOrderId, resetDatabase, getAssetDetails, checkDuplicateScan, recordScan
} from './db';

// ─── Types ───
type MainTab = 'scanner' | 'orders';
type ScanMode = 'barcode' | 'qrcode' | 'nfc' | 'rfid';
type ScanResult = { success: boolean; message: string; asset?: any; matchedOrders?: Order[] };

function App() {
  const [mainTab, setMainTab] = useState<MainTab>('scanner');
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrderId, setNewOrderId] = useState('');
  const [newOrderDesc, setNewOrderDesc] = useState('');
  const [scanForOrderId, setScanForOrderId] = useState<string | null>(null);
  const [rfidForOrderId, setRfidForOrderId] = useState<string | null>(null);
  const [rfidInput, setRfidInput] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const rfidInputRef = useRef<HTMLInputElement>(null);

  // Load orders
  const loadOrders = useCallback(async () => {
    const all = await getAllOrders();
    setOrders(all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Scanner lifecycle
  useEffect(() => {
    if (mainTab === 'scanner' && (scanMode === 'barcode' || scanMode === 'qrcode') && !scanResult) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [mainTab, scanMode, scanResult]);

  // Focus RFID input
  useEffect(() => {
    if (rfidForOrderId && rfidInputRef.current) {
      rfidInputRef.current.focus();
    }
  }, [rfidForOrderId]);

  // ─── Scanner ───
  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          try { await scannerRef.current.stop(); } catch (_e) { /* ignore */ }
        }
        try { scannerRef.current.clear(); } catch (_e) { /* ignore */ }
      }
      scannerRef.current = new Html5Qrcode('reader');
      setIsScanning(true);

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      const onSuccess = (decodedText: string) => {
        stopScanner();
        handleScannerSearch(decodedText, 'CAMERA');
      };
      const onFailure = () => {};

      try {
        await scannerRef.current.start({ facingMode: 'environment' }, config, onSuccess, onFailure);
      } catch (_err) {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          await scannerRef.current.start(cameras[0].id, config, onSuccess, onFailure);
        } else {
          throw new Error('No cameras found on device');
        }
      }
    } catch (err: any) {
      console.error('Error starting scanner', err);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      if (scannerRef.current.isScanning) {
        try { await scannerRef.current.stop(); } catch (_e) { /* ignore */ }
      }
      try { scannerRef.current.clear(); } catch (_e) { /* ignore */ }
      scannerRef.current = null;
      setIsScanning(false);
    }
  };

  // ─── Search/Scan handler ───
  const handleScannerSearch = async (code: string, method: ScanMethod) => {
    if (!code.trim()) return;
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const matchedOrders = await searchOrdersByBarcode(code);
      const asset = await getAssetDetails(code);
      const isDuplicate = await checkDuplicateScan(code);

      if (matchedOrders.length > 0) {
        await recordScan(code, method);
        setScanResult({
          success: true,
          message: `Found ${matchedOrders.length} matching order(s)`,
          matchedOrders
        });
      } else if (asset) {
        if (isDuplicate) {
          setScanResult({ success: false, message: 'Asset already scanned' });
        } else {
          await recordScan(code, method);
          setScanResult({ success: true, message: 'Asset found', asset });
        }
      } else {
        setScanResult({ success: false, message: `No orders or assets found for "${code}"` });
      }
    } catch (_err) {
      setScanResult({ success: false, message: 'System error during lookup' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setManualCode('');
  };

  // ─── Order actions ───
  const handleCreateOrder = async () => {
    if (!newOrderId.trim()) return;
    await createOrder(newOrderId.trim(), newOrderDesc.trim());
    setNewOrderId('');
    setNewOrderDesc('');
    await loadOrders();
  };

  const handleCreateByScan = () => {
    setScanForOrderId('__new__');
  };

  const handleSuggestNext = async () => {
    const next = await getNextOrderId();
    setNewOrderId(next);
  };

  const handleDeleteOrder = async (id: string) => {
    await deleteOrder(id);
    await loadOrders();
  };

  const handleScanForOrder = async (orderId: string) => {
    setScanForOrderId(orderId);
  };

  const handleBarcodeScannedForOrder = async (orderId: string, barcode: string) => {
    if (!barcode.trim()) return;
    await addBarcodeToOrder(orderId, barcode.trim());
    setScanForOrderId(null);
    await loadOrders();
  };

  const handleRemoveBarcode = async (orderId: string, barcode: string) => {
    await removeBarcodeFromOrder(orderId, barcode);
    await loadOrders();
  };

  const handleRfidForOrder = (orderId: string) => {
    setRfidForOrderId(orderId);
    setRfidInput('');
  };

  const handleRfidSubmit = async () => {
    if (!rfidForOrderId || !rfidInput.trim()) return;
    await addRfidToOrder(rfidForOrderId, rfidInput.trim());
    setRfidForOrderId(null);
    setRfidInput('');
    await loadOrders();
  };

  const handleReset = async () => {
    if (confirm('Reset all scan data and orders to defaults?')) {
      await resetDatabase();
      await loadOrders();
    }
  };

  const scanModeLabel = scanMode === 'barcode' ? 'Barcode' : scanMode === 'qrcode' ? 'QR Code' : scanMode === 'nfc' ? 'NFC' : 'RFID';
  const isCameraMode = scanMode === 'barcode' || scanMode === 'qrcode';

  return (
    <div>
      {/* Header */}
      <div className="top-header">
        <h1>TOPS Scanner</h1>
      </div>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <a href="#">Home</a>
        <span className="sep">&gt;</span>
        <span className="current">Warehouse scanner</span>
      </div>

      <div className="page-container">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h2>Warehouse scanner</h2>
            <p>Scanner tab: read a barcode and see any matching order. Orders tab: create, refresh, and manage barcodes.</p>
          </div>
          <div className="page-header-actions">
            <a className="btn-link" href="#" onClick={(e) => { e.preventDefault(); alert('Help: Use the Scanner tab to scan barcodes/QR codes with your camera or enter them manually. The Orders tab lets you manage orders and assign barcodes.'); }}>Help</a>
            <button className="btn btn-outline btn-sm" onClick={handleReset}>Reset</button>
          </div>
        </div>

        {/* Primary tabs */}
        <div className="primary-tabs">
          <button className={`primary-tab ${mainTab === 'scanner' ? 'active' : ''}`} onClick={() => setMainTab('scanner')}>
            <ScanBarcode size={16} /> Scanner
          </button>
          <button className={`primary-tab ${mainTab === 'orders' ? 'active' : ''}`} onClick={() => setMainTab('orders')}>
            <Package size={16} /> Orders
          </button>
        </div>

        {/* ══════ SCANNER TAB ══════ */}
        {mainTab === 'scanner' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {/* Scan method tabs */}
            <div className="card">
              <div className="scan-tabs">
                <button className={`scan-tab ${scanMode === 'barcode' ? 'active' : ''}`} onClick={() => setScanMode('barcode')}>
                  <ScanBarcode size={15} /> Barcode
                </button>
                <button className={`scan-tab ${scanMode === 'qrcode' ? 'active' : ''}`} onClick={() => setScanMode('qrcode')}>
                  <QrCode size={15} /> QR Code
                </button>
                <button className={`scan-tab ${scanMode === 'nfc' ? 'active' : ''}`} onClick={() => setScanMode('nfc')}>
                  <Wifi size={15} /> NFC
                </button>
                <button className={`scan-tab ${scanMode === 'rfid' ? 'active' : ''}`} onClick={() => setScanMode('rfid')}>
                  <Radio size={15} /> RFID
                </button>
              </div>

              <div className="scanner-status">
                <span>{scanModeLabel} Scanner</span>
                <span className={`status-dot ${isCameraMode && isScanning ? '' : 'inactive'}`}>
                  {isCameraMode && isScanning ? 'Active' : scanMode === 'nfc' ? 'Waiting' : scanMode === 'rfid' ? 'Ready' : 'Idle'}
                </span>
              </div>
            </div>

            {/* Scanner section */}
            <div className="card">
              <h3 className="section-title">Scanner</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                After you scan, we check the value against the service and list any order that contains that barcode, with number and description.
              </p>

              {isCameraMode && !scanResult && (
                <>
                  <div className="scanner-container">
                    <div id="reader"></div>
                    {!isScanning && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', textAlign: 'center' }}>
                        <Loader2 className="animate-spin" size={28} />
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Starting camera…</div>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-success mt-1" onClick={() => startScanner()} disabled={isScanning}>
                    <Camera size={16} /> Scan
                  </button>
                </>
              )}

              {(scanMode === 'nfc') && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Wifi size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p>NFC scanning requires a compatible device.</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Hold your NFC tag near the device reader, or enter the tag value manually below.</p>
                </div>
              )}

              {(scanMode === 'rfid') && !scanResult && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Radio size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p>RFID Sled (Keyboard Wedge Mode)</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>The RFID reader will type the tag value into the field below. Ensure the sled is paired.</p>
                </div>
              )}
            </div>

            {/* Manual entry */}
            <div className="card">
              <h3 className="section-title">Or enter a {scanModeLabel.toLowerCase()}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Type a value, or use Scan above to use the camera.
              </p>
              <label className="form-label">{scanModeLabel} value</label>
              <div className="search-row">
                <input
                  className="input-field"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder={scanMode === 'rfid' ? 'Waiting for RFID input…' : `e.g. ASSET-123`}
                  autoFocus={scanMode === 'rfid' || scanMode === 'nfc'}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScannerSearch(manualCode, scanMode === 'rfid' ? 'RFID' : 'MANUAL'); }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleScannerSearch(manualCode, scanMode === 'rfid' ? 'RFID' : 'MANUAL')}
                  disabled={isLoading || !manualCode.trim()}
                >
                  {isLoading ? <Loader2 className="animate-spin" size={16} /> : <><Search size={16} /> Search</>}
                </button>
              </div>

              {/* Search results inline */}
              {scanResult && (
                <div className="search-results mt-1">
                  <AnimatePresence>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="result-header" style={{ marginTop: '1rem' }}>
                        <div className={`result-icon ${scanResult.success ? 'success' : 'error'}`}>
                          {scanResult.success ? <CheckCircle size={24} /> : <XCircle size={24} />}
                        </div>
                        <div>
                          <div className="result-title">{scanResult.message}</div>
                          <div className="result-subtitle">
                            {scanResult.success ? 'Data verified successfully.' : 'No match found. Try another value.'}
                          </div>
                        </div>
                      </div>

                      {scanResult.matchedOrders && scanResult.matchedOrders.map(order => (
                        <div key={order.id} className="order-item" style={{ marginBottom: '0.5rem' }}>
                          <div className="order-info">
                            <div className="order-label">Order #</div>
                            <div className="order-id">
                              {order.id}
                              <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
                            </div>
                            <div className="order-label" style={{ marginTop: '0.25rem' }}>Description</div>
                            <div className="order-desc">{order.description || '—'}</div>
                          </div>
                        </div>
                      ))}

                      {scanResult.asset && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <div className="detail-row"><span className="detail-label">Code</span><span className="detail-value">{scanResult.asset.code}</span></div>
                          <div className="detail-row"><span className="detail-label">Name</span><span className="detail-value">{scanResult.asset.name}</span></div>
                          <div className="detail-row"><span className="detail-label">Category</span><span className="detail-value">{scanResult.asset.category}</span></div>
                          <div className="detail-row"><span className="detail-label">Status</span><span className="detail-value">{scanResult.asset.status}</span></div>
                        </div>
                      )}

                      <button className="btn btn-outline mt-1" onClick={resetScanner}>
                        <ArrowLeft size={14} /> Scan Another
                      </button>
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ══════ ORDERS TAB ══════ */}
        {mainTab === 'orders' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {/* New order form */}
            <div className="card">
              <h3 className="section-title">New order</h3>
              <div className="input-row">
                <div className="field">
                  <label className="form-label">Order ID (required)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      className="input-field"
                      type="text"
                      value={newOrderId}
                      onChange={(e) => setNewOrderId(e.target.value)}
                      placeholder="e.g. ORD-001"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateOrder(); }}
                    />
                    <button className="btn btn-outline btn-sm" onClick={handleSuggestNext}>Suggest next</button>
                  </div>
                </div>
                <div className="field">
                  <label className="form-label">Description (optional)</label>
                  <input
                    className="input-field"
                    type="text"
                    value={newOrderDesc}
                    onChange={(e) => setNewOrderDesc(e.target.value)}
                    placeholder="Optional description"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateOrder(); }}
                  />
                </div>
              </div>
              <div className="btn-group mt-1">
                <button className="btn btn-success" onClick={handleCreateOrder} disabled={!newOrderId.trim()}>
                  <Plus size={16} /> Create order
                </button>
                <button className="btn btn-outline-primary" onClick={handleCreateByScan}>
                  <ScanBarcode size={16} /> Create by scan
                </button>
                <button className="btn btn-outline" onClick={loadOrders}>
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>
            </div>

            {/* All orders */}
            <h3 className="section-title">All orders</h3>
            {orders.length === 0 && (
              <div className="empty-msg">
                <Package size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p>No orders yet. Create one above.</p>
              </div>
            )}
            {orders.map(order => (
              <div key={order.id} className="order-item">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1 }}>
                  <Package size={22} style={{ color: 'var(--text-muted)', marginTop: '0.15rem', flexShrink: 0 }} />
                  <div className="order-info">
                    <div className="order-label">Order #</div>
                    <div className="order-id">
                      {order.id}
                      <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
                    </div>
                    <div className="order-label" style={{ marginTop: '0.25rem' }}>Description</div>
                    <div className="order-desc">{order.description || '—'}</div>
                    <div className="order-date">{new Date(order.createdAt).toLocaleString()}</div>

                    {order.barcodes.length > 0 ? (
                      <div className="barcode-tags">
                        {order.barcodes.map(bc => (
                          <span key={bc} className="barcode-tag">
                            {bc}
                            <button onClick={() => handleRemoveBarcode(order.id, bc)} title="Remove barcode">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="no-barcodes">No barcodes</div>
                    )}

                    {order.rfidTags && order.rfidTags.length > 0 && (
                      <div className="barcode-tags" style={{ marginTop: '0.25rem' }}>
                        {order.rfidTags.map(tag => (
                          <span key={tag} className="barcode-tag" style={{ background: '#e0e7ff', borderColor: '#a5b4fc', color: '#3730a3' }}>
                            RFID: {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="order-actions">
                  <button className="btn btn-success btn-sm" onClick={() => handleScanForOrder(order.id)} title="Scan barcode for this order">
                    <Camera size={14} /> Scan
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleRfidForOrder(order.id)} title="Add RFID tag">
                    <Radio size={14} /> RFID
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrder(order.id)} title="Delete order">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Scan for Order modal ── */}
      {scanForOrderId && (
        <ScanForOrderModal
          orderId={scanForOrderId}
          onClose={() => setScanForOrderId(null)}
          onScanned={async (barcode) => {
            if (scanForOrderId === '__new__') {
              const nextId = await getNextOrderId();
              await createOrder(nextId, '');
              await addBarcodeToOrder(nextId, barcode);
            } else {
              await handleBarcodeScannedForOrder(scanForOrderId, barcode);
            }
            setScanForOrderId(null);
            await loadOrders();
          }}
        />
      )}

      {/* ── RFID for Order modal ── */}
      {rfidForOrderId && (
        <div className="modal-overlay" onClick={() => setRfidForOrderId(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Add RFID Tag to {rfidForOrderId}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Point the RFID sled at the tag, or type the tag ID manually.
            </p>
            <label className="form-label">RFID Tag Value</label>
            <div className="search-row">
              <input
                ref={rfidInputRef}
                className="input-field"
                type="text"
                value={rfidInput}
                onChange={(e) => setRfidInput(e.target.value)}
                placeholder="Waiting for RFID input…"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleRfidSubmit(); }}
              />
              <button className="btn btn-primary" onClick={handleRfidSubmit} disabled={!rfidInput.trim()}>
                Add
              </button>
            </div>
            <button className="btn btn-outline mt-1" style={{ width: '100%' }} onClick={() => setRfidForOrderId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scan for Order Modal (camera-based) ───
function ScanForOrderModal({ orderId, onClose, onScanned }: {
  orderId: string;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}) {
  const [manualVal, setManualVal] = useState('');
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    startScan();
    return () => { stopScan(); };
  }, []);

  const startScan = async () => {
    try {
      scanRef.current = new Html5Qrcode('order-reader');
      setScanning(true);
      const config = { fps: 10, qrbox: { width: 220, height: 220 } };
      try {
        await scanRef.current.start({ facingMode: 'environment' }, config, (text) => { stopScan(); onScanned(text); }, () => {});
      } catch (_e) {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length > 0) {
          await scanRef.current.start(cameras[0].id, config, (text) => { stopScan(); onScanned(text); }, () => {});
        }
      }
    } catch (err) {
      console.error('Order scanner error', err);
      setScanning(false);
    }
  };

  const stopScan = async () => {
    if (scanRef.current) {
      if (scanRef.current.isScanning) { try { await scanRef.current.stop(); } catch (_e) { /* ignore */ } }
      try { scanRef.current.clear(); } catch (_e) { /* ignore */ }
      scanRef.current = null;
      setScanning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => { stopScan(); onClose(); }}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <h3>Scan barcode for {orderId === '__new__' ? 'new order' : orderId}</h3>
        <div className="scanner-container" style={{ minHeight: '200px', marginBottom: '1rem' }}>
          <div id="order-reader"></div>
          {!scanning && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', textAlign: 'center' }}>
              <Loader2 className="animate-spin" size={24} />
            </div>
          )}
        </div>
        <label className="form-label">Or enter manually</label>
        <div className="search-row">
          <input
            className="input-field"
            type="text"
            value={manualVal}
            onChange={(e) => setManualVal(e.target.value)}
            placeholder="Type barcode value…"
            onKeyDown={(e) => { if (e.key === 'Enter' && manualVal.trim()) { stopScan(); onScanned(manualVal.trim()); } }}
          />
          <button className="btn btn-primary" onClick={() => { stopScan(); onScanned(manualVal.trim()); }} disabled={!manualVal.trim()}>
            Add
          </button>
        </div>
        <button className="btn btn-outline mt-1" style={{ width: '100%' }} onClick={() => { stopScan(); onClose(); }}>Cancel</button>
      </div>
    </div>
  );
}

export default App;
