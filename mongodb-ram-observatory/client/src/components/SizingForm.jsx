import React, { useState } from 'react';

const FIELD_HELP = {
  deploymentTarget: {
    title: 'Deployment Target',
    description: 'Determines the output format. EA on OpenShift produces MCK custom resource YAML with cacheSizeGB and container memory limits. Atlas produces a tier recommendation table.',
  },
  workingSetGB: {
    title: 'Working Set Size',
    description: 'The amount of data your application actively reads and writes. Check the Observatory\'s "Cache Fill Ratio" — the bytes shown is your current working set. You can also click "Use Observed Values" to auto-fill this from live metrics.',
  },
  maxConnections: {
    title: 'Max Connections',
    description: 'Peak concurrent connections to this mongod. Each connection uses ~1 MB of RAM. Check your connection pool settings: total = (app pods) x maxPoolSize. Use "Use Observed Values" to auto-fill from live connections.',
  },
  numReplicaSets: {
    title: 'Number of Replica Sets',
    description: 'How many replica sets in your deployment. Each replica set has 3 data-bearing nodes (PSS). The total RAM Pool = per-node memory x 3 x number of replica sets.',
  },
  headroomPercent: {
    title: 'Working Set Headroom',
    description: 'Extra cache budget on top of the working set for dirty pages and MVCC (multi-version concurrency control) overhead. 20% is a safe default. Increase if you have heavy write workloads.',
  },
  aggMemoryGB: {
    title: 'Aggregation Memory',
    description: 'RAM budget for concurrent aggregation pipelines ($group, $sort, $lookup). Each pipeline can use up to 100 MB by default. Estimate based on how many concurrent pipelines run at peak.',
  },
  internalOverheadGB: {
    title: 'Internal Overhead',
    description: 'Memory for WiredTiger metadata, query plan cache, oplog buffer, and other internal structures. 1 GB is a safe default for most workloads.',
  },
  tcmallocPercent: {
    title: 'TCMalloc Overhead',
    description: 'MongoDB uses TCMalloc for memory allocation, which holds freed memory in thread-local caches rather than returning it to the OS. 10-15% overhead is typical.',
  },
  fsCachePercent: {
    title: 'Filesystem Cache Headroom',
    description: 'Percentage of total container memory left for the OS page/filesystem cache. This helps with compressed data reads and journal writes. 25% is recommended. The formula: container limit = mongod process total / (1 - this %).',
  },
  mongosInstances: {
    title: 'mongos Instances',
    description: 'Number of mongos routers for sharded clusters. Set to 0 for replica sets. Each mongos typically needs 2-4 GB RAM.',
  },
  currentContainerGB: {
    title: 'Current Container Size',
    description: 'Your current resources.limits.memory value. Enter this to see a side-by-side comparison of current vs recommended sizing and potential RAM Pool savings.',
  },
  currentTier: {
    title: 'Current Atlas Tier',
    description: 'Your current Atlas tier. Enter this to see a comparison of current vs recommended tier.',
  },
};

function Tooltip({ field }) {
  const help = FIELD_HELP[field];
  if (!help) return null;

  return (
    <span className="relative inline-block ml-1 group">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-mongo-forest text-gray-400 text-[10px] cursor-help font-bold hover:bg-mongo-green hover:text-mongo-dark transition-colors">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-4 py-3 bg-mongo-dark border border-mongo-forest rounded-lg text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
        <span className="block font-semibold text-mongo-white mb-1">{help.title}</span>
        {help.description}
      </span>
    </span>
  );
}

export default function SizingForm({ inputs, onChange, onCalculate, onUseObserved, hasObserved }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (field, value) => {
    onChange({ ...inputs, [field]: value });
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-mongo-white">Sizing Inputs</h3>
        {hasObserved && (
          <button
            onClick={onUseObserved}
            className="btn-secondary text-sm"
          >
            Use Observed Values
          </button>
        )}
      </div>

      {/* Essential fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="label">Deployment Target <Tooltip field="deploymentTarget" /></label>
          <div className="flex gap-2">
            <button
              onClick={() => update('deploymentTarget', 'ea')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                inputs.deploymentTarget === 'ea'
                  ? 'border-mongo-green text-mongo-green bg-mongo-forest'
                  : 'border-mongo-forest text-gray-400 hover:border-gray-500'
              }`}
            >
              EA on OpenShift
            </button>
            <button
              onClick={() => update('deploymentTarget', 'atlas')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                inputs.deploymentTarget === 'atlas'
                  ? 'border-mongo-green text-mongo-green bg-mongo-forest'
                  : 'border-mongo-forest text-gray-400 hover:border-gray-500'
              }`}
            >
              Atlas
            </button>
          </div>
        </div>

        <div>
          <label className="label">Working Set Size (GB) <Tooltip field="workingSetGB" /></label>
          <input
            type="number"
            value={inputs.workingSetGB}
            onChange={e => update('workingSetGB', parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
            step={0.5}
          />
        </div>

        <div>
          <label className="label">Max Connections <Tooltip field="maxConnections" /></label>
          <input
            type="number"
            value={inputs.maxConnections}
            onChange={e => update('maxConnections', parseInt(e.target.value) || 0)}
            className="input-field"
            min={1}
            step={50}
          />
        </div>

        <div>
          <label className="label">Replica Sets <Tooltip field="numReplicaSets" /></label>
          <input
            type="number"
            value={inputs.numReplicaSets}
            onChange={e => update('numReplicaSets', parseInt(e.target.value) || 1)}
            className="input-field"
            min={1}
            max={50}
          />
        </div>
      </div>

      {/* Advanced toggle */}
      <div className="mt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-gray-400 hover:text-mongo-green transition-colors flex items-center gap-1"
        >
          <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>&#9656;</span>
          Advanced settings
          <span className="text-xs text-gray-600">(headroom, TCMalloc, FS cache, mongos)</span>
        </button>
      </div>

      {/* Advanced fields */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-mongo-forest">
          <div>
            <label className="label">Working Set Headroom: {inputs.headroomPercent}% <Tooltip field="headroomPercent" /></label>
            <input
              type="range"
              value={inputs.headroomPercent}
              onChange={e => update('headroomPercent', parseInt(e.target.value))}
              className="w-full accent-mongo-green"
              min={0} max={50} step={5}
            />
            <div className="flex justify-between text-xs text-gray-600"><span>0%</span><span>50%</span></div>
          </div>

          <div>
            <label className="label">Aggregation Memory (GB) <Tooltip field="aggMemoryGB" /></label>
            <input
              type="number"
              value={inputs.aggMemoryGB}
              onChange={e => update('aggMemoryGB', parseFloat(e.target.value) || 0)}
              className="input-field"
              min={0} step={0.25}
            />
          </div>

          <div>
            <label className="label">Internal Overhead (GB) <Tooltip field="internalOverheadGB" /></label>
            <input
              type="number"
              value={inputs.internalOverheadGB}
              onChange={e => update('internalOverheadGB', parseFloat(e.target.value) || 0)}
              className="input-field"
              min={0} step={0.25}
            />
          </div>

          <div>
            <label className="label">TCMalloc Overhead: {inputs.tcmallocPercent}% <Tooltip field="tcmallocPercent" /></label>
            <input
              type="range"
              value={inputs.tcmallocPercent}
              onChange={e => update('tcmallocPercent', parseInt(e.target.value))}
              className="w-full accent-mongo-green"
              min={5} max={25} step={1}
            />
            <div className="flex justify-between text-xs text-gray-600"><span>5%</span><span>25%</span></div>
          </div>

          <div>
            <label className="label">FS Cache Headroom: {inputs.fsCachePercent}% <Tooltip field="fsCachePercent" /></label>
            <input
              type="range"
              value={inputs.fsCachePercent}
              onChange={e => update('fsCachePercent', parseInt(e.target.value))}
              className="w-full accent-mongo-green"
              min={10} max={40} step={5}
            />
            <div className="flex justify-between text-xs text-gray-600"><span>10%</span><span>40%</span></div>
          </div>

          <div>
            <label className="label">mongos Instances <Tooltip field="mongosInstances" /></label>
            <input
              type="number"
              value={inputs.mongosInstances}
              onChange={e => update('mongosInstances', parseInt(e.target.value) || 0)}
              className="input-field"
              min={0}
            />
          </div>

          {inputs.mongosInstances > 0 && (
            <div>
              <label className="label">mongos Memory (GB)</label>
              <input
                type="number"
                value={inputs.mongosMemoryGB}
                onChange={e => update('mongosMemoryGB', parseFloat(e.target.value) || 2)}
                className="input-field"
                min={1} step={1}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <button onClick={onCalculate} className="btn-primary text-lg px-6 py-3">
          Calculate Sizing
        </button>
      </div>
    </div>
  );
}
