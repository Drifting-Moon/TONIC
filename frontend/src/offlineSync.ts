import { openDB } from 'idb';
import axios from 'axios';

const SYNC_STORE_NAME = 'offline-ingest-store';
const DB_NAME = 'communitypulse-db';

export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

// Save a report offline
export async function saveOfflineReport(payload: { text?: string, imageBase64?: string }) {
  const db = await initDB();
  await db.add(SYNC_STORE_NAME, {
    ...payload,
    timestamp: Date.now()
  });
  console.log("Saved report offline! It will sync when connection is restored.");
}

// Background Sync Loop
export async function syncOfflineReports(apiBaseUrl: string, onSyncStart?: (count: number) => void): Promise<number> {
  if (!navigator.onLine) return 0;
  
  const db = await initDB();
  const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
  const store = tx.objectStore(SYNC_STORE_NAME);
  const reports = await store.getAll();
  
  if (reports.length === 0) return 0;
  
  if (onSyncStart) onSyncStart(reports.length);
  console.log(`Syncing ${reports.length} offline reports...`);
  
  let synced = 0;
  for (const report of reports) {
    try {
      const payload: any = {};
      if (report.text) payload.text = report.text;
      
      await axios.post(`${apiBaseUrl}/ingest`, payload);
      
      await store.delete(report.id);
      synced++;
      
      // Delay to avoid bombarding the AI API (stay under RPM limits)
      if (synced < reports.length) {
        console.log("Waiting 30s before next sync to honor API rate limits...");
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } catch (e) {
      console.error(`Failed to sync report ${report.id}`, e);
    }
  }
  return synced;
}
