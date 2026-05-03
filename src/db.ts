import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type ScanMethod = 'CAMERA' | 'MANUAL' | 'RFID';

export interface Order {
  id: string;
  description: string;
  status: 'Pending' | 'Received' | 'Shipped' | 'Completed';
  createdAt: string;
  barcodes: string[];
  rfidTags: string[];
}

interface ScannerDB extends DBSchema {
  scans: {
    key: string;
    value: {
      code: string;
      scannedAt: string;
      method: ScanMethod;
    };
  };
  assets: {
    key: string;
    value: {
      code: string;
      name: string;
      category: string;
      description: string;
      status: string;
    };
  };
  orders: {
    key: string;
    value: Order;
  };
}

let dbPromise: Promise<IDBPDatabase<ScannerDB>>;

export const initDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<ScannerDB>('ScannerDatabase', 2, {
      upgrade(db, oldVersion) {
        // Create scans store if not exists
        if (!db.objectStoreNames.contains('scans')) {
          db.createObjectStore('scans', { keyPath: 'code' });
        }

        // Create assets store if not exists
        if (!db.objectStoreNames.contains('assets')) {
          const assetStore = db.createObjectStore('assets', { keyPath: 'code' });

          // Seed mock data
          const mockAssets = [
            { code: 'ASSET-123', name: 'High-Value Container A', category: 'Logistics', description: 'Contains electronics', status: 'ACTIVE' },
            { code: '987654321', name: 'Medical Supply Crate', category: 'Healthcare', description: 'Urgent delivery required', status: 'IN TRANSIT' },
            { code: 'RFID-ABC', name: 'Pallet of Goods', category: 'General', description: 'Standard warehouse pallet', status: 'STORED' }
          ];

          mockAssets.forEach(asset => {
            assetStore.put(asset);
          });
        }

        // Create orders store (new in v2)
        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'id' });

          // Seed sample orders
          const sampleOrders: Order[] = [
            {
              id: 'ORD-001',
              description: '100 towels',
              status: 'Pending',
              createdAt: new Date().toISOString(),
              barcodes: [],
              rfidTags: []
            },
            {
              id: 'ORD-002',
              description: 'Electronics shipment',
              status: 'Received',
              createdAt: new Date(Date.now() - 86400000).toISOString(),
              barcodes: ['C6B'],
              rfidTags: []
            }
          ];

          sampleOrders.forEach(order => {
            orderStore.put(order);
          });
        }
      },
    });
  }
  return dbPromise;
};

// ── Scan operations ──

export const checkDuplicateScan = async (code: string) => {
  const db = await initDB();
  const existing = await db.get('scans', code);
  return !!existing;
};

export const getAssetDetails = async (code: string) => {
  const db = await initDB();
  return await db.get('assets', code);
};

export const recordScan = async (code: string, method: ScanMethod) => {
  const db = await initDB();
  await db.put('scans', {
    code,
    scannedAt: new Date().toISOString(),
    method
  });
};

// ── Order operations ──

export const getAllOrders = async (): Promise<Order[]> => {
  const db = await initDB();
  return await db.getAll('orders');
};

export const getOrder = async (id: string): Promise<Order | undefined> => {
  const db = await initDB();
  return await db.get('orders', id);
};

export const createOrder = async (id: string, description: string): Promise<Order> => {
  const db = await initDB();
  const order: Order = {
    id,
    description,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    barcodes: [],
    rfidTags: []
  };
  await db.put('orders', order);
  return order;
};

export const deleteOrder = async (id: string) => {
  const db = await initDB();
  await db.delete('orders', id);
};

export const addBarcodeToOrder = async (orderId: string, barcode: string) => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  if (order) {
    if (!order.barcodes.includes(barcode)) {
      order.barcodes.push(barcode);
      await db.put('orders', order);
    }
    return order;
  }
  return null;
};

export const removeBarcodeFromOrder = async (orderId: string, barcode: string) => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  if (order) {
    order.barcodes = order.barcodes.filter(b => b !== barcode);
    await db.put('orders', order);
    return order;
  }
  return null;
};

export const addRfidToOrder = async (orderId: string, rfidTag: string) => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  if (order) {
    if (!order.rfidTags.includes(rfidTag)) {
      order.rfidTags.push(rfidTag);
      await db.put('orders', order);
    }
    return order;
  }
  return null;
};

export const removeRfidFromOrder = async (orderId: string, rfidTag: string) => {
  const db = await initDB();
  const order = await db.get('orders', orderId);
  if (order) {
    order.rfidTags = order.rfidTags.filter(t => t !== rfidTag);
    await db.put('orders', order);
    return order;
  }
  return null;
};

export const searchOrdersByBarcode = async (barcode: string): Promise<Order[]> => {
  const db = await initDB();
  const allOrders = await db.getAll('orders');
  return allOrders.filter(order =>
    order.barcodes.some(b => b.toLowerCase().includes(barcode.toLowerCase())) ||
    order.id.toLowerCase().includes(barcode.toLowerCase())
  );
};

export const getNextOrderId = async (): Promise<string> => {
  const db = await initDB();
  const allOrders = await db.getAll('orders');
  let maxNum = 0;
  allOrders.forEach(order => {
    const match = order.id.match(/ORD-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `ORD-${String(maxNum + 1).padStart(3, '0')}`;
};

export const resetDatabase = async () => {
  const db = await initDB();
  await db.clear('scans');
  await db.clear('orders');

  // Re-seed orders
  const sampleOrders: Order[] = [
    {
      id: 'ORD-001',
      description: '100 towels',
      status: 'Pending',
      createdAt: new Date().toISOString(),
      barcodes: [],
      rfidTags: []
    },
    {
      id: 'ORD-002',
      description: 'Electronics shipment',
      status: 'Received',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      barcodes: ['C6B'],
      rfidTags: []
    }
  ];

  for (const order of sampleOrders) {
    await db.put('orders', order);
  }
};
