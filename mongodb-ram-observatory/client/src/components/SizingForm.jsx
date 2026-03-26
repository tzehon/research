import React from 'react';

export default function SizingForm({ inputs, onChange, onCalculate, onUseObserved, hasObserved }) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Deployment Target */}
        <div>
          <label className="label">Deployment Target</label>
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

        {/* Working Set Size */}
        <div>
          <label className="label">Working Set Size (GB)</label>
          <input
            type="number"
            value={inputs.workingSetGB}
            onChange={e => update('workingSetGB', parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
            step={0.5}
          />
        </div>

        {/* Headroom */}
        <div>
          <label className="label">Working Set Headroom: {inputs.headroomPercent}%</label>
          <input
            type="range"
            value={inputs.headroomPercent}
            onChange={e => update('headroomPercent', parseInt(e.target.value))}
            className="w-full accent-mongo-green"
            min={0}
            max={50}
            step={5}
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>0%</span><span>50%</span>
          </div>
        </div>

        {/* Max Connections */}
        <div>
          <label className="label">Max Connections</label>
          <input
            type="number"
            value={inputs.maxConnections}
            onChange={e => update('maxConnections', parseInt(e.target.value) || 0)}
            className="input-field"
            min={1}
            step={50}
          />
        </div>

        {/* Aggregation Memory */}
        <div>
          <label className="label">Aggregation Memory (GB)</label>
          <input
            type="number"
            value={inputs.aggMemoryGB}
            onChange={e => update('aggMemoryGB', parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
            step={0.25}
          />
        </div>

        {/* Internal Overhead */}
        <div>
          <label className="label">Internal Overhead (GB)</label>
          <input
            type="number"
            value={inputs.internalOverheadGB}
            onChange={e => update('internalOverheadGB', parseFloat(e.target.value) || 0)}
            className="input-field"
            min={0}
            step={0.25}
          />
        </div>

        {/* TCMalloc */}
        <div>
          <label className="label">TCMalloc Overhead: {inputs.tcmallocPercent}%</label>
          <input
            type="range"
            value={inputs.tcmallocPercent}
            onChange={e => update('tcmallocPercent', parseInt(e.target.value))}
            className="w-full accent-mongo-green"
            min={5}
            max={25}
            step={1}
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>5%</span><span>25%</span>
          </div>
        </div>

        {/* FS Cache */}
        <div>
          <label className="label">FS Cache Headroom: {inputs.fsCachePercent}%</label>
          <input
            type="range"
            value={inputs.fsCachePercent}
            onChange={e => update('fsCachePercent', parseInt(e.target.value))}
            className="w-full accent-mongo-green"
            min={10}
            max={40}
            step={5}
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>10%</span><span>40%</span>
          </div>
        </div>

        {/* Number of Replica Sets */}
        <div>
          <label className="label">Number of Replica Sets</label>
          <input
            type="number"
            value={inputs.numReplicaSets}
            onChange={e => update('numReplicaSets', parseInt(e.target.value) || 1)}
            className="input-field"
            min={1}
            max={50}
          />
        </div>

        {/* mongos */}
        <div>
          <label className="label">mongos Instances</label>
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
              min={1}
              step={1}
            />
          </div>
        )}

        {/* Current container (for comparison) */}
        {inputs.deploymentTarget === 'ea' && (
          <div>
            <label className="label">Current Container Size (GB, optional)</label>
            <input
              type="number"
              value={inputs.currentContainerGB || ''}
              onChange={e => update('currentContainerGB', parseFloat(e.target.value) || null)}
              className="input-field"
              min={0}
              step={1}
              placeholder="For comparison"
            />
          </div>
        )}

        {inputs.deploymentTarget === 'atlas' && (
          <div>
            <label className="label">Current Atlas Tier (optional)</label>
            <select
              value={inputs.currentTier || ''}
              onChange={e => update('currentTier', e.target.value || null)}
              className="input-field"
            >
              <option value="">Select for comparison</option>
              <option value="M10">M10</option>
              <option value="M20">M20</option>
              <option value="M30">M30</option>
              <option value="M40">M40</option>
              <option value="M50">M50</option>
              <option value="M60">M60</option>
              <option value="M80">M80</option>
              <option value="M140">M140</option>
              <option value="M200">M200</option>
              <option value="M300">M300</option>
              <option value="M400">M400</option>
              <option value="M700">M700</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onCalculate} className="btn-primary text-lg px-6 py-3">
          Calculate Sizing
        </button>
      </div>
    </div>
  );
}
