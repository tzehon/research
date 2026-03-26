const ATLAS_TIERS = [
  { tier: 'M10', ram: 2, wtCache: 0.75, vcpu: 2 },
  { tier: 'M20', ram: 4, wtCache: 1.5, vcpu: 2 },
  { tier: 'M30', ram: 8, wtCache: 3.5, vcpu: 2 },
  { tier: 'M40', ram: 16, wtCache: 7.5, vcpu: 4 },
  { tier: 'M50', ram: 32, wtCache: 15.5, vcpu: 8 },
  { tier: 'M60', ram: 64, wtCache: 31.5, vcpu: 16 },
  { tier: 'M80', ram: 128, wtCache: 63, vcpu: 32 },
  { tier: 'M140', ram: 192, wtCache: 95, vcpu: 48 },
  { tier: 'M200', ram: 256, wtCache: 127, vcpu: 64 },
  { tier: 'M300', ram: 384, wtCache: 191, vcpu: 96 },
  { tier: 'M400', ram: 488, wtCache: 243, vcpu: 64 },
  { tier: 'M700', ram: 768, wtCache: 383, vcpu: 96 },
];

export function calculateSizing(inputs) {
  const {
    workingSetGB = 4,
    headroomPercent = 20,
    maxConnections = 200,
    aggMemoryGB = 0.5,
    internalOverheadGB = 1.0,
    tcmallocPercent = 12,
    fsCachePercent = 25,
    topology = 'pss',
    numReplicaSets = 1,
    mongosInstances = 0,
    mongosMemoryGB = 4,
    deploymentTarget = 'ea',
    currentContainerGB = null,
    currentTier = null,
  } = inputs;

  // Step 1: cacheSizeGB
  const cacheSizeGB = +(workingSetGB * (1 + headroomPercent / 100)).toFixed(1);

  // Step 2: Connection overhead (~1 MB per connection)
  const connectionOverheadGB = +(maxConnections / 1024).toFixed(2);

  // Step 3: Subtotal before TCMalloc
  const subtotalBeforeTcmalloc = cacheSizeGB + connectionOverheadGB + aggMemoryGB + internalOverheadGB;

  // Step 4: TCMalloc overhead
  const tcmallocOverheadGB = +(subtotalBeforeTcmalloc * tcmallocPercent / 100).toFixed(2);
  const mongodProcessTotal = +(subtotalBeforeTcmalloc + tcmallocOverheadGB).toFixed(2);

  // Step 5: Container limit (solve for total including FS cache)
  const containerLimitGB = +(mongodProcessTotal / (1 - fsCachePercent / 100)).toFixed(1);
  const fsCacheGB = +(containerLimitGB - mongodProcessTotal).toFixed(2);

  // Memory breakdown
  const breakdown = {
    wtCache: cacheSizeGB,
    connectionOverhead: connectionOverheadGB,
    aggBuffers: aggMemoryGB,
    internalOverhead: internalOverheadGB,
    tcmalloc: tcmallocOverheadGB,
    fsCache: fsCacheGB,
    total: containerLimitGB,
  };

  // Topology nodes
  let dataBearingNodes;
  let analyticsNodes = 0;
  switch (topology) {
    case 'pss_analytics':
      dataBearingNodes = 3;
      analyticsNodes = 1;
      break;
    case 'pss_hidden':
      dataBearingNodes = 3;
      analyticsNodes = 1;
      break;
    default: // pss
      dataBearingNodes = 3;
  }

  // RAM Pool calculation
  const perReplicaSet = (dataBearingNodes + analyticsNodes) * containerLimitGB;
  const mongosTotal = mongosInstances * mongosMemoryGB;
  const configServerTotal = mongosInstances > 0 ? 3 * 4 : 0; // 3 config servers × 4 GB each
  const totalRamPool = +(perReplicaSet * numReplicaSets + mongosTotal + configServerTotal).toFixed(1);

  const ramPoolTable = {
    dataBearing: { perNode: containerLimitGB, nodes: dataBearingNodes * numReplicaSets, subtotal: +(dataBearingNodes * containerLimitGB * numReplicaSets).toFixed(1) },
  };

  if (analyticsNodes > 0) {
    ramPoolTable.analytics = { perNode: containerLimitGB, nodes: analyticsNodes * numReplicaSets, subtotal: +(analyticsNodes * containerLimitGB * numReplicaSets).toFixed(1) };
  }

  if (mongosInstances > 0) {
    ramPoolTable.mongos = { perNode: mongosMemoryGB, nodes: mongosInstances, subtotal: mongosTotal };
    ramPoolTable.configServers = { perNode: 4, nodes: 3, subtotal: configServerTotal };
  }

  ramPoolTable.total = totalRamPool;

  // Comparison
  let comparison = null;
  if (deploymentTarget === 'ea' && currentContainerGB) {
    const currentRamPool = currentContainerGB * (dataBearingNodes + analyticsNodes) * numReplicaSets + mongosTotal + configServerTotal;
    comparison = {
      current: { containerGB: currentContainerGB, ramPool: +currentRamPool.toFixed(1) },
      recommended: { containerGB: containerLimitGB, ramPool: totalRamPool },
      savingsGB: +(currentRamPool - totalRamPool).toFixed(1),
      savingsPercent: +((1 - totalRamPool / currentRamPool) * 100).toFixed(1),
    };
  }

  // Atlas tier recommendation
  let atlasTiers = null;
  if (deploymentTarget === 'atlas') {
    atlasTiers = ATLAS_TIERS.map(t => ({
      ...t,
      fitsWorkingSet: t.wtCache >= workingSetGB,
      headroom: workingSetGB > 0 ? +((t.wtCache / workingSetGB - 1) * 100).toFixed(0) : 0,
      recommended: false,
    }));

    // Find first tier that fits with adequate headroom
    const recommended = atlasTiers.find(t => t.wtCache >= cacheSizeGB);
    if (recommended) {
      recommended.recommended = true;
    }

    // Atlas comparison
    if (currentTier) {
      const currentTierInfo = ATLAS_TIERS.find(t => t.tier === currentTier);
      if (currentTierInfo) {
        comparison = {
          current: { tier: currentTier, ram: currentTierInfo.ram },
          recommended: { tier: recommended?.tier || 'N/A', ram: recommended?.ram || 0 },
        };
      }
    }
  }

  // MCK YAML
  let yaml = null;
  if (deploymentTarget === 'ea') {
    yaml = `# MCK (MongoDB Controllers for Kubernetes) — recommended sizing
# Apply to your MongoDB custom resource
apiVersion: mongodb.com/v1
kind: MongoDB
metadata:
  name: my-replica-set
spec:
  members: ${dataBearingNodes}
  type: ReplicaSet
  mongod:
    storage:
      wiredTiger:
        engineConfig:
          cacheSizeGB: ${cacheSizeGB}          # Performance lever — set explicitly
  statefulSet:
    spec:
      template:
        spec:
          containers:
            - name: mongod
              resources:
                requests:
                  memory: "${containerLimitGB}Gi"   # Guaranteed QoS — set equal to limits
                  cpu: "2"
                limits:
                  memory: "${containerLimitGB}Gi"   # Licensing lever — this is your RAM Pool
                  cpu: "4"`;
  }

  return {
    cacheSizeGB,
    containerLimitGB,
    breakdown,
    ramPoolTable,
    comparison,
    atlasTiers,
    yaml,
    deploymentTarget,
  };
}
