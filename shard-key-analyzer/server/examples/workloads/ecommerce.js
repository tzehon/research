/**
 * E-commerce workload patterns
 * These patterns simulate realistic e-commerce application query patterns
 * with a mix of reads and writes that clearly favor customerId as the shard key.
 */

export const ecommerceWorkload = {
  name: 'E-commerce',
  description: 'Simulates an e-commerce order management system with customer-centric reads and writes',
  patterns: [
    {
      name: 'Get customer orders',
      description: 'Look up all orders for a specific customer (order history page)',
      weight: 25,
      type: 'read',
      operation: 'find',
      filter: { customerId: '{{customerId}}' },
      options: { sort: { createdAt: -1 }, limit: 20 },
      notes: 'Most common query - customers viewing their order history'
    },
    {
      name: 'Place new order',
      description: 'Customer places a new order',
      weight: 15,
      type: 'write',
      operation: 'insert',
      document: {
        orderId: '{{newOrderId}}',
        customerId: '{{customerId}}',
        region: '{{region}}',
        totalAmount: '{{amount}}',
        status: 'pending',
        createdAt: '{{now}}'
      },
      notes: 'New order creation - always includes customerId'
    },
    {
      name: 'Get order details',
      description: 'Look up a specific order by its ID (tracking page)',
      weight: 10,
      type: 'read',
      operation: 'find',
      filter: { orderId: '{{orderId}}' },
      notes: 'Order detail page, tracking links - no customerId in filter'
    },
    {
      name: 'Update order status',
      description: 'Fulfillment system updates order status (shipped, delivered)',
      weight: 10,
      type: 'write',
      operation: 'update',
      filter: { orderId: '{{orderId}}' },
      update: {
        $set: {
          status: '{{status}}',
          updatedAt: '{{now}}'
        }
      },
      notes: 'Fulfillment workflow - targets orderId only'
    },
    {
      name: 'Customer updates order',
      description: 'Customer modifies shipping address or notes on their order',
      weight: 15,
      type: 'write',
      operation: 'update',
      filter: { customerId: '{{customerId}}', orderId: '{{orderId}}' },
      update: {
        $set: {
          'shippingAddress.street': '{{address}}',
          updatedAt: '{{now}}'
        }
      },
      notes: 'Customer self-service - includes customerId in filter'
    },
    {
      name: 'Cancel customer order',
      description: 'Customer cancels a pending order',
      weight: 10,
      type: 'write',
      operation: 'update',
      filter: { customerId: '{{customerId}}', status: 'pending' },
      update: {
        $set: {
          status: 'cancelled',
          updatedAt: '{{now}}'
        }
      },
      notes: 'Cancellation - targets customerId'
    },
    {
      name: 'Customer spending summary',
      description: 'Aggregate total spending for a customer (dashboard widget)',
      weight: 10,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { customerId: '{{customerId}}' } },
        { $group: { _id: '$customerId', totalSpent: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } }
      ],
      notes: 'Customer dashboard - targeted to a single customer'
    },
    {
      name: 'Regional sales report',
      description: 'Calculate total sales by region (admin dashboard)',
      weight: 5,
      type: 'read',
      operation: 'aggregate',
      pipeline: [
        { $match: { region: '{{region}}', createdAt: { $gte: '{{dateFrom}}' } } },
        { $group: { _id: '$region', totalSales: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } }
      ],
      notes: 'Admin reporting - scatter-gather is acceptable for infrequent analytics'
    }
  ]
};

/**
 * Analysis notes for e-commerce workload
 *
 * Query targeting breakdown:
 *   customerId in filter: 25% + 15% (insert) + 15% + 10% + 10% = 75%
 *   orderId in filter:    10% + 10% + 15% = 35%
 *   region in filter:     5%
 *
 * Read/write split: 50% reads / 50% writes
 */
export const ecommerceAnalysis = {
  bestCandidates: [
    {
      key: { customerId: 1 },
      reasoning: [
        '75% of all operations (reads + writes) include customerId',
        'High cardinality - thousands of distinct customers',
        'Non-monotonic - customer IDs are random UUIDs',
        'Good write distribution - new orders spread evenly across customers',
        'Co-locates all of a customer\'s orders on the same shard (data locality)'
      ]
    },
    {
      key: { customerId: 1, createdAt: 1 },
      reasoning: [
        'Supports customer lookups with efficient date-range ordering',
        'Enables efficient "recent orders for customer X" queries',
        'Good compound key but slightly more complex than customerId alone'
      ]
    }
  ],
  worstCandidates: [
    {
      key: { orderId: 1 },
      reasoning: [
        'Only 35% of queries include orderId in the filter',
        'Unique per order so no co-location benefit (each order isolated)',
        'Customer order history queries (25%) would scatter-gather across all shards',
        'Customer writes (25%) would also scatter-gather'
      ]
    },
    {
      key: { region: 1 },
      reasoning: [
        'Only 4 distinct values - severe cardinality limitation',
        'Maximum 4 chunks limits horizontal scaling',
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
        'Monotonically increasing - all inserts go to the max-key shard',
        'Creates severe write hotspot',
        'Causes chunk imbalance over time'
      ]
    }
  ]
};

export default { ecommerceWorkload, ecommerceAnalysis };
