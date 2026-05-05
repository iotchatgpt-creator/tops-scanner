import { openDB, DBSchema, IDBPDatabase } from 'idb';

// ── Types ──

export type ScanMethod = 'CAMERA' | 'MANUAL' | 'RFID';

export type MetroStatus =
  | 'Available'       // In clean buffer, ready to allocate
  | 'Allocated'       // Assigned to an order, not yet picked up
  | 'Pickup'          // Being loaded onto transport
  | 'InTransit'       // On the way to destination
  | 'AtStorage'       // Delivered to storage location
  | 'Soiled'          // Marked as soiled at location
  | 'SoiledTransit'   // Soiled textile heading to dock/plant
  | 'AtPlant'         // At the laundry plant for cleaning
  | 'Cleaning';       // Being cleaned, will return to buffer

export type OrderStatus = 'Draft' | 'Allocated' | 'Pickup' | 'InTransit' | 'Delivered';

export type LocationType = 'Buffer' | 'Storage' | 'Dock' | 'Plant' | 'StagingArea';

export interface Metro {
  id: string;            // Barcode/RFID value e.g. MTR-001
  type: 'Clean' | 'Soiled';
  status: MetroStatus;
  locationId: string;
  orderId: string | null;
  contents: string;      // e.g. "100 Towels", "50 Bed Sheets"
  lastScannedAt: string;
  lastScanMethod: ScanMethod;
  createdAt: string;
}

export interface OrderTextileProduct {
  id: string; // Maps to orderTextileProductId
  textileProductId: string;
  plantId: number;
  quantity: number;
  shippedQuantity: number;
  processingPriceAmount: number;
}

export interface Order {
  id: string; // Maps to orderId
  description: string;
  status: OrderStatus;
  locationId: string; // Maps to locationId (TextileOrder)
  orderTypeId: number;
  locationDropZoneId: string | null;
  wbsElementId: string | null;
  orderDateTime: string;
  orderDueDate: string;
  orderProcessingTotalPriceAmount: number;
  orderCostCenterCode: string;
  plantCode: string;
  metroIds: string[];
  items: OrderTextileProduct[]; // Represents the items being ordered
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  area: string;
  locationTypeId: number;
  isDepartment: boolean;
  costCenterId: number | null;
  plantId: number | null;
}

export interface GarmentProcessingPrice {
  id: string; // garmentProcessingPriceId
  garmentProcessingTypeId: number;
  textileProductId: string;
  plantId: number;
  effectiveDate: string;
  amount: number;
}

export interface ScanEvent {
  id: string;            // auto-generated
  metroId: string;
  action: string;        // e.g. "Scanned", "Allocated", "Pickup", "Delivered"
  locationId: string;
  method: ScanMethod;
  timestamp: string;
  userId: string;        // mock user
  notes: string;
}

/** Maps a physical UHF tag (EPC hex, etc.) to a logical metro id (e.g. MTR-001). */
export interface RfidAlias {
  tagId: string;
  metroId: string;
  createdAt: string;
}

// ── DB Schema ──

interface ScannerDB extends DBSchema {
  metros: { key: string; value: Metro };
  orders: { key: string; value: Order };
  locations: { key: string; value: Location };
  garmentProcessingPrices: { key: string; value: GarmentProcessingPrice };
  scanEvents: { key: string; value: ScanEvent; indexes: { 'by-metro': string; 'by-timestamp': string } };
  rfidAliases: { key: string; value: RfidAlias };
}

let dbPromise: Promise<IDBPDatabase<ScannerDB>>;

/** Trim control chars; normalize line endings from Bluetooth HID wedges. */
export const normalizeRfidInput = (raw: string): string =>
  raw.replace(/\u0000/g, '').trim().replace(/[\r\n\u001d\u001e]+$/, '');

/** Metro IDs that match seeded barcodes (MTR-001 …); used for labels and barcode-camera mode. */
export const METRO_BARCODE_ID_PATTERN = /^MTR-\d+$/i;

export function isMetroIdBarcode(value: string): boolean {
  return METRO_BARCODE_ID_PATTERN.test(normalizeRfidInput(value));
}

/**
 * Resolves a camera/QR payload to a lookup key: plain MTR-###, or deep links with ?metro=
 * (same pattern as NFC URL tags in the README).
 */
export function parseMetroIdFromScanPayload(raw: string): string {
  const n = normalizeRfidInput(raw);
  if (!n) return '';
  if (METRO_BARCODE_ID_PATTERN.test(n)) return n;
  try {
    const u = new URL(n);
    const m = u.searchParams.get('metro');
    if (m && METRO_BARCODE_ID_PATTERN.test(normalizeRfidInput(m))) {
      return normalizeRfidInput(m);
    }
  } catch {
    // Not an absolute URL — try MTR-### anywhere in the string (e.g. partial URLs)
  }
  const embedded = n.match(/MTR-\d+/i);
  if (embedded) return embedded[0];
  return n;
}

/** Canonical key for alias storage (uppercase hex EPCs; otherwise trimmed as-is). */
export const canonicalRfidTag = (raw: string): string => {
  const n = normalizeRfidInput(raw);
  if (/^[0-9A-Fa-f]+$/.test(n) && n.length >= 8) return n.toUpperCase();
  return n;
};

// ── Seed Data ──

const SEED_LOCATIONS: Location[] = [
  { id: 'LOC-BUF-01', name: 'Clean Buffer Storage', type: 'Buffer', area: 'Warehouse A', locationTypeId: 2, isDepartment: false, costCenterId: null, plantId: 100 },
  { id: 'LOC-BUF-02', name: 'Clean Buffer Storage B', type: 'Buffer', area: 'Warehouse B', locationTypeId: 2, isDepartment: false, costCenterId: null, plantId: 100 },
  { id: 'LOC-STR-01', name: 'Guest Room Storage A', type: 'Storage', area: 'Resort Building 1', locationTypeId: 3, isDepartment: true, costCenterId: 501, plantId: 100 },
  { id: 'LOC-STR-02', name: 'Guest Room Storage B', type: 'Storage', area: 'Resort Building 2', locationTypeId: 3, isDepartment: true, costCenterId: 502, plantId: 100 },
  { id: 'LOC-STR-03', name: 'Pool & Spa Storage', type: 'Storage', area: 'Recreation Center', locationTypeId: 3, isDepartment: true, costCenterId: 503, plantId: 100 },
  { id: 'LOC-DOC-01', name: 'Soiled Textile Dock', type: 'Dock', area: 'Warehouse A', locationTypeId: 4, isDepartment: false, costCenterId: null, plantId: 100 },
  { id: 'LOC-DOC-02', name: 'Loading Dock', type: 'Dock', area: 'Warehouse A', locationTypeId: 4, isDepartment: false, costCenterId: null, plantId: 100 },
  { id: 'LOC-PLT-01', name: 'Central Laundry Plant', type: 'Plant', area: 'Off-site Facility', locationTypeId: 1, isDepartment: false, costCenterId: null, plantId: 100 },
  { id: 'LOC-STG-01', name: 'Clean Metro Staging', type: 'StagingArea', area: 'Warehouse A', locationTypeId: 5, isDepartment: false, costCenterId: null, plantId: 100 },
];

const SEED_METROS: Metro[] = [
  { id: 'MTR-001', type: 'Clean', status: 'Available', locationId: 'LOC-BUF-01', orderId: null, contents: '100 Towels', lastScannedAt: new Date().toISOString(), lastScanMethod: 'MANUAL', createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'MTR-002', type: 'Clean', status: 'Available', locationId: 'LOC-BUF-01', orderId: null, contents: '50 Bed Sheets', lastScannedAt: new Date().toISOString(), lastScanMethod: 'MANUAL', createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'MTR-003', type: 'Clean', status: 'Allocated', locationId: 'LOC-BUF-01', orderId: 'ORD-001', contents: '80 Pillowcases', lastScannedAt: new Date(Date.now() - 3600000).toISOString(), lastScanMethod: 'RFID', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'MTR-004', type: 'Clean', status: 'InTransit', locationId: 'LOC-DOC-02', orderId: 'ORD-001', contents: '60 Bath Mats', lastScannedAt: new Date(Date.now() - 1800000).toISOString(), lastScanMethod: 'CAMERA', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'MTR-005', type: 'Clean', status: 'AtStorage', locationId: 'LOC-STR-01', orderId: 'ORD-002', contents: '120 Hand Towels', lastScannedAt: new Date(Date.now() - 86400000).toISOString(), lastScanMethod: 'CAMERA', createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
  { id: 'MTR-006', type: 'Soiled', status: 'Soiled', locationId: 'LOC-STR-02', orderId: null, contents: '90 Towels (used)', lastScannedAt: new Date(Date.now() - 7200000).toISOString(), lastScanMethod: 'RFID', createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
  { id: 'MTR-007', type: 'Soiled', status: 'SoiledTransit', locationId: 'LOC-DOC-01', orderId: null, contents: '70 Bed Sheets (used)', lastScannedAt: new Date(Date.now() - 3600000).toISOString(), lastScanMethod: 'CAMERA', createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
  { id: 'MTR-008', type: 'Soiled', status: 'AtPlant', locationId: 'LOC-PLT-01', orderId: null, contents: '110 Mixed Linens', lastScannedAt: new Date(Date.now() - 43200000).toISOString(), lastScanMethod: 'RFID', createdAt: new Date(Date.now() - 20 * 86400000).toISOString() },
  { id: 'MTR-009', type: 'Clean', status: 'Available', locationId: 'LOC-BUF-02', orderId: null, contents: '40 Robes', lastScannedAt: new Date().toISOString(), lastScanMethod: 'MANUAL', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'MTR-010', type: 'Clean', status: 'Available', locationId: 'LOC-STG-01', orderId: null, contents: '200 Washcloths', lastScannedAt: new Date().toISOString(), lastScanMethod: 'MANUAL', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

const SEED_ORDERS: Order[] = [
  { id: 'ORD-001', description: 'Building 1 Weekly Linen Restock', status: 'InTransit', locationId: 'LOC-STR-01', orderTypeId: 1, locationDropZoneId: 'DZ-01', wbsElementId: 'WBS-100', orderDateTime: new Date(Date.now() - 2 * 86400000).toISOString(), orderDueDate: new Date(Date.now() - 1800000).toISOString(), orderProcessingTotalPriceAmount: 150.00, orderCostCenterCode: 'CC-501', plantCode: 'PLT-100', metroIds: ['MTR-003', 'MTR-004'], items: [{ id: 'OTP-1', textileProductId: 'PROD-TOWEL', plantId: 100, quantity: 150, shippedQuantity: 150, processingPriceAmount: 22.5 }] },
  { id: 'ORD-002', description: 'Recreation Center Towel Supply', status: 'Delivered', locationId: 'LOC-STR-03', orderTypeId: 1, locationDropZoneId: 'DZ-02', wbsElementId: 'WBS-101', orderDateTime: new Date(Date.now() - 5 * 86400000).toISOString(), orderDueDate: new Date(Date.now() - 86400000).toISOString(), orderProcessingTotalPriceAmount: 45.50, orderCostCenterCode: 'CC-503', plantCode: 'PLT-100', metroIds: ['MTR-005'], items: [{ id: 'OTP-2', textileProductId: 'PROD-SHEET', plantId: 100, quantity: 50, shippedQuantity: 50, processingPriceAmount: 12.5 }] },
];

const SEED_PAYOUTS: GarmentProcessingPrice[] = [
  { id: 'PRC-001', garmentProcessingTypeId: 1, textileProductId: 'PROD-TOWEL', plantId: 100, effectiveDate: new Date('2025-01-01').toISOString(), amount: 0.15 },
  { id: 'PRC-002', garmentProcessingTypeId: 2, textileProductId: 'PROD-SHEET', plantId: 100, effectiveDate: new Date('2025-01-01').toISOString(), amount: 0.25 },
];

// ── DB Init ──

export const initDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>('TOPSScannerDB', 2, {
      upgrade(db, oldVersion) {
        // Metros
        if (!db.objectStoreNames.contains('metros')) {
          db.createObjectStore('metros', { keyPath: 'id' });
        }
        // Orders
        if (!db.objectStoreNames.contains('orders')) {
          db.createObjectStore('orders', { keyPath: 'id' });
        }
        // Locations
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations', { keyPath: 'id' });
        }
        // Payouts
        if (!db.objectStoreNames.contains('garmentProcessingPrices')) {
          db.createObjectStore('garmentProcessingPrices', { keyPath: 'id' });
        }
        // Scan Events
        if (!db.objectStoreNames.contains('scanEvents')) {
          const store = db.createObjectStore('scanEvents', { keyPath: 'id' });
          store.createIndex('by-metro', 'metroId');
          store.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('rfidAliases')) {
          db.createObjectStore('rfidAliases', { keyPath: 'tagId' });
        }
      },
    });

    // Seed on first load
    const db = await dbPromise;
    const metroCount = await db.count('metros');
    if (metroCount === 0) {
      const tx = db.transaction(['metros', 'orders', 'locations', 'garmentProcessingPrices', 'scanEvents'], 'readwrite');
      for (const loc of SEED_LOCATIONS) await tx.objectStore('locations').put(loc);
      for (const metro of SEED_METROS) await tx.objectStore('metros').put(metro);
      for (const order of SEED_ORDERS) await tx.objectStore('orders').put(order);
      for (const price of SEED_PAYOUTS) await tx.objectStore('garmentProcessingPrices').put(price);
      // Seed a few scan events
      const events: ScanEvent[] = [
        { id: 'EVT-001', metroId: 'MTR-004', action: 'Pickup - Loaded for transit', locationId: 'LOC-DOC-02', method: 'CAMERA', timestamp: new Date(Date.now() - 1800000).toISOString(), userId: 'operator1', notes: 'Loaded onto truck' },
        { id: 'EVT-002', metroId: 'MTR-005', action: 'Delivered to storage', locationId: 'LOC-STR-01', method: 'CAMERA', timestamp: new Date(Date.now() - 86400000).toISOString(), userId: 'operator2', notes: '' },
        { id: 'EVT-003', metroId: 'MTR-006', action: 'Marked soiled', locationId: 'LOC-STR-02', method: 'RFID', timestamp: new Date(Date.now() - 7200000).toISOString(), userId: 'operator1', notes: 'End of week collection' },
      ];
      for (const evt of events) await tx.objectStore('scanEvents').put(evt);
      await tx.done;
    }
  }
  return dbPromise;
};

// ── Metro Operations ──

export const getAllMetros = async (): Promise<Metro[]> => {
  const db = await initDB();
  return db.getAll('metros');
};

export const getMetro = async (id: string): Promise<Metro | undefined> => {
  const db = await initDB();
  return db.get('metros', id);
};

export const getRfidAliasMetroId = async (rawTag: string): Promise<string | undefined> => {
  const db = await initDB();
  const key = canonicalRfidTag(rawTag);
  const row = await db.get('rfidAliases', key);
  return row?.metroId;
};

export const setRfidAlias = async (rawTag: string, metroId: string): Promise<void> => {
  const db = await initDB();
  const tagId = canonicalRfidTag(rawTag);
  await db.put('rfidAliases', {
    tagId,
    metroId,
    createdAt: new Date().toISOString(),
  });
};

export const getAllRfidAliases = async (): Promise<RfidAlias[]> => {
  const db = await initDB();
  if (!db.objectStoreNames.contains('rfidAliases')) return [];
  return db.getAll('rfidAliases');
};

export const findMetroByCode = async (code: string): Promise<Metro | undefined> => {
  const db = await initDB();
  const normalized = normalizeRfidInput(code);
  const viaAlias = await getRfidAliasMetroId(normalized);
  const lookupId = viaAlias ?? normalized;
  let metro = await db.get('metros', lookupId);
  if (metro) return metro;
  const all = await db.getAll('metros');
  return all.find(m => m.id.toLowerCase() === lookupId.toLowerCase());
};

export const updateMetroStatus = async (
  metroId: string,
  status: MetroStatus,
  locationId: string,
  type: 'Clean' | 'Soiled',
  orderId: string | null,
  method: ScanMethod,
  action: string,
  notes: string = ''
): Promise<Metro | null> => {
  const db = await initDB();
  const metro = await db.get('metros', metroId);
  if (!metro) return null;

  metro.status = status;
  metro.locationId = locationId;
  metro.type = type;
  metro.orderId = orderId;
  metro.lastScannedAt = new Date().toISOString();
  metro.lastScanMethod = method;
  await db.put('metros', metro);

  // Record scan event
  const event: ScanEvent = {
    id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    metroId,
    action,
    locationId,
    method,
    timestamp: new Date().toISOString(),
    userId: 'current-user',
    notes,
  };
  await db.put('scanEvents', event);

  return metro;
};

export const createMetro = async (id: string, contents: string, locationId: string): Promise<Metro> => {
  const db = await initDB();
  const metro: Metro = {
    id,
    type: 'Clean',
    status: 'Available',
    locationId,
    orderId: null,
    contents,
    lastScannedAt: new Date().toISOString(),
    lastScanMethod: 'MANUAL',
    createdAt: new Date().toISOString(),
  };
  await db.put('metros', metro);
  return metro;
};

// ── Order Operations ──

export const getAllOrders = async (): Promise<Order[]> => {
  const db = await initDB();
  return db.getAll('orders');
};

export const getOrder = async (id: string): Promise<Order | undefined> => {
  const db = await initDB();
  return db.get('orders', id);
};

export const createOrder = async (id: string, description: string, destinationLocationId: string): Promise<Order> => {
  const db = await initDB();
  const order: Order = {
    id,
    description,
    status: 'Draft',
    locationId: destinationLocationId,
    orderTypeId: 1,
    locationDropZoneId: null,
    wbsElementId: null,
    metroIds: [],
    orderDateTime: new Date().toISOString(),
    orderDueDate: new Date().toISOString(),
    orderProcessingTotalPriceAmount: 0.0,
    orderCostCenterCode: 'UNKNOWN',
    plantCode: 'UNKNOWN',
    items: []
  };
  await db.put('orders', order);
  return order;
};

export const allocateMetroToOrder = async (
  orderId: string,
  metroId: string,
  method: ScanMethod = 'MANUAL',
): Promise<boolean> => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  const metro = await db.get('metros', metroId);
  if (!order || !metro) return false;
  if (metro.status !== 'Available') return false;

  // Update metro
  metro.status = 'Allocated';
  metro.orderId = orderId;
  metro.lastScannedAt = new Date().toISOString();
  metro.lastScanMethod = method;
  await db.put('metros', metro);

  // Update order
  if (!order.metroIds.includes(metroId)) {
    order.metroIds.push(metroId);
  }
  if (order.status === 'Draft') order.status = 'Allocated';
  order.orderDueDate = new Date().toISOString();
  await db.put('orders', order);

  // Record event
  await db.put('scanEvents', {
    id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    metroId,
    action: `Allocated to order ${orderId}`,
    locationId: metro.locationId,
    method,
    timestamp: new Date().toISOString(),
    userId: 'current-user',
    notes: '',
  });

  return true;
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<Order | null> => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  if (!order) return null;
  order.status = status;
  order.orderDueDate = new Date().toISOString();
  await db.put('orders', order);
  return order;
};

export const deleteOrder = async (id: string) => {
  const db = await initDB();
  const order = await db.get('orders', id);
  if (order) {
    // Release allocated metros
    for (const mId of order.metroIds) {
      const m = await db.get('metros', mId);
      if (m && (m.status === 'Allocated')) {
        m.status = 'Available';
        m.orderId = null;
        await db.put('metros', m);
      }
    }
    await db.delete('orders', id);
  }
};

export const getNextOrderId = async (): Promise<string> => {
  const db = await initDB();
  const all = await db.getAll('orders');
  let max = 0;
  all.forEach(o => {
    const m = o.id.match(/ORD-(\d+)/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  return `ORD-${String(max + 1).padStart(3, '0')}`;
};

// ── Location Operations ──

export const getAllLocations = async (): Promise<Location[]> => {
  const db = await initDB();
  return db.getAll('locations');
};

export const getLocation = async (id: string): Promise<Location | undefined> => {
  const db = await initDB();
  return db.get('locations', id);
};

// ── Scan Events ──

export const getMetroScanHistory = async (metroId: string): Promise<ScanEvent[]> => {
  const db = await initDB();
  const all = await db.getAllFromIndex('scanEvents', 'by-metro', metroId);
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const getAllScanEvents = async (): Promise<ScanEvent[]> => {
  const db = await initDB();
  const all = await db.getAll('scanEvents');
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const getAllGarmentProcessingPrices = async (): Promise<GarmentProcessingPrice[]> => {
  const db = await initDB();
  return await db.getAll('garmentProcessingPrices');
};

// ── Inventory Helpers ──

export interface InventorySummary {
  locationId: string;
  locationName: string;
  locationType: LocationType;
  area: string;
  cleanCount: number;
  soiledCount: number;
  allocatedCount: number;
  inTransitCount: number;
  totalCount: number;
}

export const getInventorySummary = async (): Promise<InventorySummary[]> => {
  const db = await initDB();
  const locations = await db.getAll('locations');
  const metros = await db.getAll('metros');

  return locations.map(loc => {
    const locMetros = metros.filter(m => m.locationId === loc.id);
    return {
      locationId: loc.id,
      locationName: loc.name,
      locationType: loc.type,
      area: loc.area,
      cleanCount: locMetros.filter(m => m.type === 'Clean' && ['Available', 'AtStorage'].includes(m.status)).length,
      soiledCount: locMetros.filter(m => m.type === 'Soiled').length,
      allocatedCount: locMetros.filter(m => m.status === 'Allocated').length,
      inTransitCount: locMetros.filter(m => ['InTransit', 'SoiledTransit', 'Pickup'].includes(m.status)).length,
      totalCount: locMetros.length,
    };
  });
};

/** Dashboard stat buckets — must stay aligned with `getDashboardStats` filters. */
export type MetroDashboardBucket =
  | 'all'
  | 'cleanAvailable'
  | 'allocated'
  | 'inTransit'
  | 'atStorage'
  | 'soiled'
  | 'atPlant';

export const metroMatchesDashboardBucket = (m: Metro, b: MetroDashboardBucket): boolean => {
  switch (b) {
    case 'all':
      return true;
    case 'cleanAvailable':
      return m.type === 'Clean' && m.status === 'Available';
    case 'allocated':
      return m.status === 'Allocated';
    case 'inTransit':
      return ['InTransit', 'SoiledTransit', 'Pickup'].includes(m.status);
    case 'atStorage':
      return m.status === 'AtStorage';
    case 'soiled':
      return m.type === 'Soiled';
    case 'atPlant':
      return ['AtPlant', 'Cleaning'].includes(m.status);
    default:
      return true;
  }
};

export const getDashboardStats = async () => {
  const metros = await getAllMetros();
  return {
    totalMetros: metros.length,
    cleanAvailable: metros.filter(m => metroMatchesDashboardBucket(m, 'cleanAvailable')).length,
    allocated: metros.filter(m => metroMatchesDashboardBucket(m, 'allocated')).length,
    inTransit: metros.filter(m => metroMatchesDashboardBucket(m, 'inTransit')).length,
    atStorage: metros.filter(m => metroMatchesDashboardBucket(m, 'atStorage')).length,
    soiled: metros.filter(m => metroMatchesDashboardBucket(m, 'soiled')).length,
    atPlant: metros.filter(m => metroMatchesDashboardBucket(m, 'atPlant')).length,
  };
};

// ── Reset ──

export const resetDatabase = async () => {
  const db = await initDB();
  await db.clear('metros');
  await db.clear('orders');
  await db.clear('locations');
  await db.clear('garmentProcessingPrices');
  await db.clear('scanEvents');
  if (db.objectStoreNames.contains('rfidAliases')) {
    await db.clear('rfidAliases');
  }
  // Re-seed
  const tx = db.transaction(['metros', 'orders', 'locations', 'garmentProcessingPrices', 'scanEvents'], 'readwrite');
  for (const loc of SEED_LOCATIONS) await tx.objectStore('locations').put(loc);
  for (const metro of SEED_METROS) await tx.objectStore('metros').put(metro);
  for (const order of SEED_ORDERS) await tx.objectStore('orders').put(order);
  for (const price of SEED_PAYOUTS) await tx.objectStore('garmentProcessingPrices').put(price);
  await tx.done;
};
