import React from 'react';

export default function RamPoolSummary({ result }) {
  if (!result) return null;

  return (
    <div className="card text-center">
      <p className="text-sm text-gray-400 mb-1">Total RAM Pool Required</p>
      <p className="text-6xl font-bold text-mongo-green">{result.ramPoolTable.total} GB</p>
      <p className="text-sm text-gray-500 mt-2">
        across {result.ramPoolTable.dataBearing.nodes} data-bearing node{result.ramPoolTable.dataBearing.nodes !== 1 ? 's' : ''}
        {result.ramPoolTable.mongos && ` + ${result.ramPoolTable.mongos.nodes} mongos`}
      </p>
    </div>
  );
}
