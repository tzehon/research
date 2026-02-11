/**
 * E-commerce workload patterns
 * These patterns simulate realistic e-commerce application query patterns
 */

export const ecommerceWorkload = {
  name: 'E-commerce',
  description: 'Simulates an e-commerce order management system',
  patterns: [
    {
      name: 'Find orders by customer',
      description: 'Look up all orders for a specific customer',
      weight: 35,
      type: 'read',
      operation: 'find',
      filter: { customerId: '{{customerId}}' },
      options: { sort: { createdAt: -1 }, limit: 20 },
      notes: 'Most common query - customers viewing their order history'
    },
    {
      name: 'Find order by ID',
      description: 'Look up a specific order by its ID',
      weight: 20,
      type: 'read',
      operation: 'find',
      filter: { orderId: '{{orderId}}' },
      notes: 'Order detail page, tracking links'
    },
    {
      name: 'Find orders by region and date',
      description: 'Regional reporting queries',
      weight: 15,
      type: 'read',
      operation: 'find',
      filter: {
        region: '{{region}}',
        createdAt: { $gte: '{{dateFrom}}' }
      },
      options: { sort: { createdAt: -1 }, limit: 100 },
      notes: 'Regional dashboards, analytics'
    },
    {
      name: 'Update order status',
      description: 'Update the status of an order',
      weight: 20,
      type: 'write',
      operation: 'update',
      filter: { orderId: '{{orderId}}' },
      update: {
        $set: {
          status: '{{status}}',
          updatedAt: '{{now}}'
        }
      },
      notes: 'Order processing workflow'
    },
    {
      name: 'Regional sales aggregate',
      description: 'Calculate total sales by region',
      weight: 10,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { region: '{{region}}', createdAt: { $gte: '{{dateFrom}}' } } },
        { $group: { _id: '$region', totalSales: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } }
      ],
      notes: 'Business reporting, KPI dashboards'
    }
  ]
};

/**
 * Analysis notes for e-commerce workload
 */
export const ecommerceAnalysis = {
  bestCandidates: [
    {
      key: { customerId: 1 },
      reasoning: [
        '35% of reads filter by customerId (customer order history)',
        'High cardinality - many distinct customers',
        'Non-monotonic - customer IDs are random UUIDs',
        'Good write distribution - orders spread across customers'
      ]
    },
    {
      key: { customerId: 1, createdAt: 1 },
      reasoning: [
        'Supports both customer lookups and date-range queries',
        'Enables efficient date-sorted results within a customer',
        'Compound key maintains query targeting while improving range queries'
      ]
    },
    {
      key: { orderId: 1 },
      reasoning: [
        'Unique - perfect cardinality',
        'Non-monotonic (UUID)',
        'However, only 20% of queries filter by orderId',
        'Most queries would scatter-gather'
      ]
    }
  ],
  worstCandidates: [
    {
      key: { region: 1 },
      reasoning: [
        'Only 4 distinct values - severe cardinality issue',
        'Maximum 4 chunks limits scaling',
        'Regional hotspots during business hours'
      ]
    },
    {
      key: { status: 1 },
      reasoning: [
        'Only 5 distinct values',
        'Most orders are "delivered" - massive hotspot',
        'Almost no queries filter by status alone'
      ]
    },
    {
      key: { createdAt: 1 },
      reasoning: [
        'Monotonically increasing - all inserts go to one shard',
        'Creates write hotspot on the max shard',
        'Causes chunk imbalance over time'
      ]
    }
  ]
};

export default { ecommerceWorkload, ecommerceAnalysis };
