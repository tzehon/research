import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { COLORS } from '../utils/constants.js';

const BREAKDOWN_COLORS = {
  wtCache: '#016BF8',
  connectionOverhead: '#00ED64',
  aggBuffers: '#FFC010',
  internalOverhead: '#889397',
  tcmalloc: '#6B7280',
  fsCache: '#023430',
};

const BREAKDOWN_LABELS = {
  wtCache: 'WiredTiger Cache',
  connectionOverhead: 'Connection Overhead',
  aggBuffers: 'Aggregation Buffers',
  internalOverhead: 'Internal + Overhead',
  tcmalloc: 'TCMalloc',
  fsCache: 'FS Cache Headroom',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-1 rounded bg-mongo-forest text-gray-400 hover:text-mongo-green transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function SizingResults({ result }) {
  if (!result) return null;

  const breakdownData = Object.entries(result.breakdown)
    .filter(([key]) => key !== 'total')
    .map(([key, value]) => ({
      name: BREAKDOWN_LABELS[key] || key,
      value: +value.toFixed(2),
      color: BREAKDOWN_COLORS[key] || COLORS.gray,
    }));

  return (
    <div className="space-y-4">
      {/* Two Key Numbers */}
      <div className="card border-mongo-green border-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <p className="text-sm text-gray-400 mb-1">Set cacheSizeGB to:</p>
            <p className="text-5xl font-bold text-mongo-blue">{result.cacheSizeGB} GB</p>
            <p className="text-xs text-gray-500 mt-2">Performance lever</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400 mb-1">Set container limit to:</p>
            <p className="text-5xl font-bold text-mongo-green">{result.containerLimitGB} GB</p>
            <p className="text-xs text-gray-500 mt-2">Licensing lever (RAM Pool)</p>
          </div>
        </div>
        {result.deploymentTarget === 'ea' ? (
          <p className="text-xs text-gray-500 mt-4 text-center">
            cacheSizeGB goes in your MCK custom resource (spec.mongod.storage.wiredTiger.engineConfig.cacheSizeGB).{' '}
            Container limit goes in your MCK custom resource (spec.statefulSet.spec.template.spec.containers.resources.limits.memory).
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-4 text-center">
            On Atlas, WiredTiger cache size is managed automatically based on your tier.
            The sizing calculation helps you choose the right tier.
          </p>
        )}
      </div>

      {/* Memory Breakdown Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-mongo-white mb-3">Per-Node Memory Breakdown</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdownData} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" stroke={COLORS.gray} fontSize={11} tickFormatter={v => `${v} GB`} />
              <YAxis type="category" dataKey="name" stroke={COLORS.gray} fontSize={11} width={115} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.dark, border: `1px solid ${COLORS.forest}`, borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} GB`]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {breakdownData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-center">
          <span className="text-sm font-semibold text-mongo-white">
            Total Container Memory: {result.breakdown.total} GB
          </span>
        </div>
      </div>

      {/* RAM Pool Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-mongo-white mb-3">
          {result.deploymentTarget === 'atlas' ? 'RAM Consumption Summary' : 'RAM Pool Summary'}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mongo-forest text-left">
                <th className="py-2 text-gray-400">Component</th>
                <th className="py-2 text-gray-400 text-right">Per Node</th>
                <th className="py-2 text-gray-400 text-right">Nodes</th>
                <th className="py-2 text-gray-400 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-mongo-forest/50">
                <td className="py-2 text-mongo-white">Data-bearing (Primary/Secondary)</td>
                <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.dataBearing.perNode} GB</td>
                <td className="py-2 text-right text-gray-400">{result.ramPoolTable.dataBearing.nodes}</td>
                <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.dataBearing.subtotal} GB</td>
              </tr>
              {result.ramPoolTable.mongos && (
                <>
                  <tr className="border-b border-mongo-forest/50">
                    <td className="py-2 text-mongo-white">mongos</td>
                    <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.mongos.perNode} GB</td>
                    <td className="py-2 text-right text-gray-400">{result.ramPoolTable.mongos.nodes}</td>
                    <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.mongos.subtotal} GB</td>
                  </tr>
                  <tr className="border-b border-mongo-forest/50">
                    <td className="py-2 text-mongo-white">Config Servers</td>
                    <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.configServers.perNode} GB</td>
                    <td className="py-2 text-right text-gray-400">{result.ramPoolTable.configServers.nodes}</td>
                    <td className="py-2 text-right text-mongo-white">{result.ramPoolTable.configServers.subtotal} GB</td>
                  </tr>
                </>
              )}
              <tr className="font-bold">
                <td className="py-2 text-mongo-green" colSpan={3}>Total RAM Pool</td>
                <td className="py-2 text-right text-mongo-green">{result.ramPoolTable.total} GB</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison */}
      {result.comparison && (
        <div className="card border-mongo-amber border">
          <h3 className="text-lg font-semibold text-mongo-white mb-3">Current vs Recommended</h3>
          {result.deploymentTarget === 'ea' ? (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-400">Current RAM Pool</p>
                <p className="text-2xl font-bold text-mongo-amber">{result.comparison.current.ramPool} GB</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Recommended RAM Pool</p>
                <p className="text-2xl font-bold text-mongo-green">{result.comparison.recommended.ramPool} GB</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">
                  {result.comparison.savingsGB > 0 ? 'Savings' : 'Additional Needed'}
                </p>
                <p className={`text-2xl font-bold ${result.comparison.savingsGB > 0 ? 'text-mongo-green' : 'text-mongo-red'}`}>
                  {Math.abs(result.comparison.savingsGB)} GB ({Math.abs(result.comparison.savingsPercent)}%)
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-400">Current Tier</p>
                <p className="text-2xl font-bold text-mongo-amber">{result.comparison.current.tier} ({result.comparison.current.ram} GB)</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Recommended Tier</p>
                <p className="text-2xl font-bold text-mongo-green">{result.comparison.recommended.tier} ({result.comparison.recommended.ram} GB)</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Atlas Tiers */}
      {result.atlasTiers && (
        <div className="card">
          <h3 className="text-lg font-semibold text-mongo-white mb-3">Atlas Tier Recommendation</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mongo-forest text-left">
                  <th className="py-2 text-gray-400">Tier</th>
                  <th className="py-2 text-gray-400 text-right">RAM</th>
                  <th className="py-2 text-gray-400 text-right">WT Cache</th>
                  <th className="py-2 text-gray-400 text-center">Fits Working Set?</th>
                  <th className="py-2 text-gray-400 text-right">Headroom</th>
                </tr>
              </thead>
              <tbody>
                {result.atlasTiers.filter(t => t.ram <= result.containerLimitGB * 2 || t.recommended).map((t, i) => (
                  <tr
                    key={i}
                    className={`border-b border-mongo-forest/50 ${t.recommended ? 'bg-mongo-forest/30' : ''}`}
                  >
                    <td className={`py-2 ${t.recommended ? 'text-mongo-green font-bold' : 'text-mongo-white'}`}>
                      {t.tier} {t.recommended && '(recommended)'}
                    </td>
                    <td className="py-2 text-right text-mongo-white">{t.ram} GB</td>
                    <td className="py-2 text-right text-mongo-white">{t.wtCache} GB</td>
                    <td className="py-2 text-center">
                      {t.fitsWorkingSet ? (
                        <span className="text-mongo-green">Yes</span>
                      ) : (
                        <span className="text-mongo-red">No</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-gray-400">{t.fitsWorkingSet ? `${t.headroom}%` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            On Atlas, cache size is managed automatically based on your tier. Choose the first tier that fits your working set with adequate headroom.
          </p>
        </div>
      )}

      {/* YAML Output */}
      {result.yaml && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-mongo-white">MCK Custom Resource YAML</h3>
            <CopyButton text={result.yaml} />
          </div>
          <pre className="bg-mongo-dark p-4 rounded-lg text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre">
            {result.yaml}
          </pre>
          <p className="text-xs text-gray-500 mt-3">
            If not using MCK, set <code className="text-mongo-green">--wiredTigerCacheSizeGB {result.cacheSizeGB}</code> in
            your mongod startup flags or <code className="text-mongo-green">storage.wiredTiger.engineConfig.cacheSizeGB: {result.cacheSizeGB}</code> in mongod.conf.
          </p>
        </div>
      )}
    </div>
  );
}
