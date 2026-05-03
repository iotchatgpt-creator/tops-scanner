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

export interface Order {
  id: string;
  description: string;
  status: OrderStatus;
  destinationLocationId: string;
  metroIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  area: string;         // e.g. "Building A", "Warehouse"
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

// ── DB Schema ──

interface ScannerDB extends DBSchema {
  metros: { key: string; value: Metro };
  orders: { key: string; value: Order };
  locations: { key: string; value: Location };
  scanEvents: { key: string; value: ScanEvent; indexes: { 'by-metro': string; 'by-timestamp': string } };
}

let dbPromise: Promise<IDBPDatabase<ScannerDB>>;

// ── Seed Data ──

const SEED_LOCATIONS: Location[] = [
  { id: 'LOC-BUF-01', name: 'Clean Buffer Storage', type: 'Buffer', area: 'Warehouse A' },
  { id: 'LOC-BUF-02', name: 'Clean Buffer Storage B', type: 'Buffer', area: 'Warehouse B' },
  { id: 'LOC-STR-01', name: 'Guest Room Storage A', type: 'Storage', area: 'Resort Building 1' },
  { id: 'LOC-STR-02', name: 'Guest Room Storage B', type: 'Storage', area: 'Resort Building 2' },
  { id: 'LOC-STR-03', name: 'Pool & Spa Storage', type: 'Storage', area: 'Recreation Center' },
  { id: 'LOC-DOC-01', name: 'Soiled Textile Dock', type: 'Dock', area: 'Warehouse A' },
  { id: 'LOC-DOC-02', name: 'Loading Dock', type: 'Dock', area: 'Warehouse A' },
  { id: 'LOC-PLT-01', name: 'Central Laundry Plant', type: 'Plant', area: 'Off-site Facility' },
  { id: 'LOC-STG-01', name: 'Clean Metro Staging', type: 'StagingArea', area: 'Warehouse A' },
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
  { id: 'ORD-001', description: 'Building 1 Weekly Linen Restock', status: 'InTransit', destinationLocationId: 'LOC-STR-01', metroIds: ['MTR-003', 'MTR-004'], createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 1800000).toISOString() },
  { id: 'ORD-002', description: 'Recreation Center Towel Supply', status: 'Delivered', destinationLocationId: 'LOC-STR-03', metroIds: ['MTR-005'], createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() },
];

// ── DB Init ──

export const initDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>('TOPSScannerDB', 1, {
      upgrade(db) {
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
        // Scan Events
        if (!db.objectStoreNames.contains('scanEvents')) {
          const store = db.createObjectStore('scanEvents', { keyPath: 'id' });
          store.createIndex('by-metro', 'metroId');
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });

    // Seed on first load
    const db = await dbPromise;
    const metroCount = await db.count('metros');
    if (metroCount === 0) {
      const tx = db.transaction(['metros', 'orders', 'locations', 'scanEvents'], 'readwrite');
      for (const loc of SEED_LOCATIONS) await tx.objectStore('locations').put(loc);
      for (const metro of SEED_METROS) await tx.objectStore('metros').put(metro);
      for (const order of SEED_ORDERS) await tx.objectStore('orders').put(order);
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

export const findMetroByCode = async (code: string): Promise<Metro | undefined> => {
  const db = await initDB();
  // Try exact match first
  let metro = await db.get('metros', code);
  if (metro) return metro;
  // Try case-insensitive search
  const all = await db.getAll('metros');
  return all.find(m => m.id.toLowerCase() === code.toLowerCase());
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
    destinationLocationId,
    metroIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('orders', order);
  return order;
};

export const allocateMetroToOrder = async (orderId: string, metroId: string): Promise<boolean> => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  const metro = await db.get('metros', metroId);
  if (!order || !metro) return false;
  if (metro.status !== 'Available') return false;

  // Update metro
  metro.status = 'Allocated';
  metro.orderId = orderId;
  metro.lastScannedAt = new Date().toISOString();
  await db.put('metros', metro);

  // Update order
  if (!order.metroIds.includes(metroId)) {
    order.metroIds.push(metroId);
  }
  if (order.status === 'Draft') order.status = 'Allocated';
  order.updatedAt = new Date().toISOString();
  await db.put('orders', order);

  // Record event
  await db.put('scanEvents', {
    id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    metroId,
    action: `Allocated to order ${orderId}`,
    locationId: metro.locationId,
    method: 'MANUAL',
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
  order.updatedAt = new Date().toISOString();
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

export const getDashboardStats = async () => {
  const metros = await getAllMetros();
  return {
    totalMetros: metros.length,
    cleanAvailable: metros.filter(m => m.type === 'Clean' && m.status === 'Available').length,
    allocated: metros.filter(m => m.status === 'Allocated').length,
    inTransit: metros.filter(m => ['InTransit', 'SoiledTransit', 'Pickup'].includes(m.status)).length,
    atStorage: metros.filter(m => m.status === 'AtStorage').length,
    soiled: metros.filter(m => m.type === 'Soiled').length,
    atPlant: metros.filter(m => ['AtPlant', 'Cleaning'].includes(m.status)).length,
  };
};

// ── Reset ──

export const resetDatabase = async () => {
  const db = await initDB();
  await db.clear('metros');
  await db.clear('orders');
  await db.clear('locations');
  await db.clear('scanEvents');
  // Re-seed
  const tx = db.transaction(['metros', 'orders', 'locations', 'scanEvents'], 'readwrite');
  for (const loc of SEED_LOCATIONS) await tx.objectStore('locations').put(loc);
  for (const metro of SEED_METROS) await tx.objectStore('metros').put(metro);
  for (const order of SEED_ORDERS) await tx.objectStore('orders').put(order);
  await tx.done;
};
