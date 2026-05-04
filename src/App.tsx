import { useState, useEffect } from 'react';
import { ScanBarcode, Package, MapPin, BarChart3, RotateCcw, Smartphone, DollarSign } from 'lucide-react';
import { getDashboardStats, resetDatabase } from './db';
import MetroScanTab from './components/MetroScanTab';
import InventoryTab from './components/InventoryTab';
import OrdersTab from './components/OrdersTab';
import LocationsTab from './components/LocationsTab';
import PayoutsTab from './components/PayoutsTab';

type ModuleTab = 'scan' | 'inventory' | 'orders' | 'locations' | 'payouts';

function App() {
  const [tab, setTab] = useState<ModuleTab>('scan');
  const [stats, setStats] = useState({ totalMetros: 0, cleanAvailable: 0, allocated: 0, inTransit: 0, atStorage: 0, soiled: 0, atPlant: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [nfcMetroId, setNfcMetroId] = useState<string | null>(null);
  const [nfcBanner, setNfcBanner] = useState<string | null>(null);

  const refresh = () => setRefreshKey(k => k + 1);

  // ── NFC via URL parameter detection ──
  // When an NTAG213 card is tapped on iPhone, it opens the URL written on the card.
  // e.g. https://yourapp.com/?metro=MTR-001
  // We detect this parameter and auto-lookup the metro.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metroParam = params.get('metro');
    if (metroParam) {
      setNfcMetroId(metroParam);
      setTab('scan');
      setNfcBanner(`📱 NFC tag detected: ${metroParam}`);
      // Clean URL without reloading (remove ?metro= so a refresh doesn't re-trigger)
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }, 100);
      // Auto-dismiss banner after 6 seconds
      setTimeout(() => setNfcBanner(null), 6000);
    }
  }, []);

  // ── Web NFC API for Android Chrome ──
  // On Android Chrome, we can listen for NFC tags directly without URL tricks.
  useEffect(() => {
    if ('NDEFReader' in window) {
      startWebNfc();
    }
  }, []);

  const startWebNfc = async () => {
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.addEventListener('reading', ({ message }: any) => {
        for (const record of message.records) {
          if (record.recordType === 'url' || record.recordType === 'text') {
            const decoder = new TextDecoder();
            const value = decoder.decode(record.data);
            // Check if it's a URL with ?metro= parameter
            let metroId: string | null = null;
            try {
              const url = new URL(value);
              metroId = url.searchParams.get('metro');
            } catch (_) {
              // Not a URL — treat the raw value as a metro ID
              metroId = value.trim();
            }
            if (metroId) {
              setNfcMetroId(metroId);
              setTab('scan');
              setNfcBanner(`NFC tag scanned: ${metroId}`);
              setRefreshKey(k => k + 1);
              setTimeout(() => setNfcBanner(null), 4000);
            }
          }
        }
      });
    } catch (err) {
      // Web NFC not available or permission denied — that's fine, fall back to URL mode
      console.log('Web NFC not available:', err);
    }
  };

  useEffect(() => {
    getDashboardStats().then(setStats);
  }, [refreshKey, tab]);

  const handleReset = async () => {
    if (confirm('Reset all data to demo defaults?')) {
      await resetDatabase();
      refresh();
    }
  };

  // When MetroScanTab consumes the NFC metro ID, clear it
  const handleNfcConsumed = () => setNfcMetroId(null);

  return (
    <div>
      <div className="top-header">
        <div className="brand">
          <div className="brand-icon"><ScanBarcode size={18} /></div>
          <h1><span>TOPS</span> Metro Tracker</h1>
        </div>
        <div className="header-actions">
          <button onClick={handleReset}><RotateCcw size={12} /> Reset Demo</button>
        </div>
      </div>

      {/* NFC detection banner */}
      {nfcBanner && (
        <div className="nfc-banner">
          <Smartphone size={16} />
          <span>{nfcBanner}</span>
          <button onClick={() => setNfcBanner(null)}>✕</button>
        </div>
      )}

      <div className="module-tabs">
        {([
          ['scan', ScanBarcode, 'Metro Scan'],
          ['inventory', BarChart3, 'Inventory'],
          ['orders', Package, 'Orders'],
          ['locations', MapPin, 'Locations'],
          ['payouts', DollarSign, 'Payouts'],
        ] as const).map(([key, Icon, label]) => (
          <button key={key} className={`module-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as ModuleTab)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="page">
        <div className="stats-row">
          <div className="stat-card total"><div className="stat-value">{stats.totalMetros}</div><div className="stat-label">Total Metros</div></div>
          <div className="stat-card clean"><div className="stat-value">{stats.cleanAvailable}</div><div className="stat-label">Clean Available</div></div>
          <div className="stat-card allocated"><div className="stat-value">{stats.allocated}</div><div className="stat-label">Allocated</div></div>
          <div className="stat-card transit"><div className="stat-value">{stats.inTransit}</div><div className="stat-label">In Transit</div></div>
          <div className="stat-card soiled"><div className="stat-value">{stats.soiled}</div><div className="stat-label">Soiled</div></div>
          <div className="stat-card plant"><div className="stat-value">{stats.atPlant}</div><div className="stat-label">At Plant</div></div>
        </div>

        {tab === 'scan' && (
          <MetroScanTab
            onDataChange={refresh}
            initialMetroId={nfcMetroId}
            onInitialConsumed={handleNfcConsumed}
            key={`scan-${refreshKey}`}
          />
        )}
        {tab === 'inventory' && <InventoryTab key={`inv-${refreshKey}`} />}
        {tab === 'orders' && <OrdersTab onDataChange={refresh} key={`ord-${refreshKey}`} />}
        {tab === 'locations' && <LocationsTab key={`loc-${refreshKey}`} />}
        {tab === 'payouts' && <PayoutsTab key={`pay-${refreshKey}`} />}
      </div>
    </div>
  );
}

export default App;
