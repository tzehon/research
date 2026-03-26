import { Router } from 'express';
import { getClient, getUri } from '../services/mongoClient.js';

const router = Router();

router.get('/info', async (req, res) => {
  const client = getClient();
  const uri = getUri();
  if (!client) {
    return res.status(400).json({ error: 'Not connected to MongoDB' });
  }

  try {
    const admin = client.db('admin');
    const [serverStatus, buildInfo, hostInfo] = await Promise.all([
      admin.command({ serverStatus: 1 }),
      admin.command({ buildInfo: 1 }),
      admin.command({ hostInfo: 1 }).catch(() => null),
    ]);

    // Check for Atlas (SRV connection or presence of Atlas-specific fields)
    const isAtlas = uri.includes('mongodb+srv://') || uri.includes('.mongodb.net');

    // Get replica set info
    let replSetInfo = null;
    try {
      replSetInfo = await admin.command({ replSetGetStatus: 1 });
    } catch (e) {
      // might not have permission or not a replica set
    }

    // Get database stats for ram_pool_demo if it exists
    let demoDbStats = null;
    try {
      demoDbStats = await client.db('ram_pool_demo').stats();
    } catch (e) { /* might not exist yet */ }

    // Get collection stats
    let collections = [];
    try {
      const db = client.db('ram_pool_demo');
      const colls = await db.listCollections().toArray();
      for (const coll of colls) {
        try {
          const stats = await db.command({ collStats: coll.name });
          collections.push({
            name: coll.name,
            count: stats.count,
            sizeGB: +(stats.size / (1024 * 1024 * 1024)).toFixed(3),
            storageSizeGB: +(stats.storageSize / (1024 * 1024 * 1024)).toFixed(3),
            avgObjSize: stats.avgObjSize || 0,
            indexCount: stats.nindexes || 0,
          });
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* ignore */ }

    const cache = serverStatus.wiredTiger?.cache || {};

    res.json({
      isAtlas,
      version: buildInfo.version,
      host: serverStatus.host,
      uptime: serverStatus.uptime,
      replicaSet: replSetInfo?.set || null,
      members: replSetInfo?.members?.length || null,
      totalMemoryGB: hostInfo?.system?.memSizeMB ? +(hostInfo.system.memSizeMB / 1024).toFixed(1) : null,
      wtCacheMaxGB: +(cache['maximum bytes configured'] / (1024 * 1024 * 1024)).toFixed(2),
      demoDb: demoDbStats ? {
        collections: demoDbStats.collections,
        dataSizeGB: +(demoDbStats.dataSize / (1024 * 1024 * 1024)).toFixed(3),
        storageSizeGB: +(demoDbStats.storageSize / (1024 * 1024 * 1024)).toFixed(3),
      } : null,
      collections,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
