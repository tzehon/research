import { v4 as uuidv4 } from 'uuid';

// Sample data for e-commerce dataset
const REGIONS = ['NA', 'EU', 'APAC', 'LATAM'];

const COUNTRIES = {
  NA: ['United States', 'Canada', 'Mexico'],
  EU: ['United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Sweden', 'Poland'],
  APAC: ['Japan', 'Australia', 'Singapore', 'South Korea', 'India', 'China', 'Thailand', 'Malaysia'],
  LATAM: ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Mexico']
};

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_METHODS = ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'crypto'];
const CURRENCIES = { NA: 'USD', EU: 'EUR', APAC: 'USD', LATAM: 'USD' };

const PRODUCT_CATEGORIES = [
  'Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books',
  'Toys', 'Beauty', 'Automotive', 'Food & Beverage', 'Office',
  'Health', 'Pet Supplies', 'Jewelry', 'Music', 'Movies',
  'Software', 'Video Games', 'Baby', 'Industrial', 'Arts & Crafts'
];

const PRODUCTS = [
  { name: 'Wireless Headphones', category: 'Electronics', price: 79.99 },
  { name: 'Laptop Stand', category: 'Office', price: 49.99 },
  { name: 'Running Shoes', category: 'Sports', price: 129.99 },
  { name: 'Coffee Maker', category: 'Home & Garden', price: 89.99 },
  { name: 'Yoga Mat', category: 'Sports', price: 29.99 },
  { name: 'Bluetooth Speaker', category: 'Electronics', price: 59.99 },
  { name: 'Winter Jacket', category: 'Clothing', price: 199.99 },
  { name: 'Book: Programming Guide', category: 'Books', price: 39.99 },
  { name: 'Smart Watch', category: 'Electronics', price: 299.99 },
  { name: 'Desk Lamp', category: 'Office', price: 34.99 },
  { name: 'Plant Pot Set', category: 'Home & Garden', price: 24.99 },
  { name: 'Gaming Mouse', category: 'Electronics', price: 69.99 },
  { name: 'Sunglasses', category: 'Clothing', price: 149.99 },
  { name: 'Protein Powder', category: 'Health', price: 44.99 },
  { name: 'Dog Food', category: 'Pet Supplies', price: 54.99 }
];

// Pre-generate customer IDs for reuse (simulates repeat customers)
let customerPool = [];

/**
 * Generate e-commerce order documents
 */
export function generateEcommerceData(count, offset = 0) {
  const documents = [];

  // Initialize customer pool on first call
  if (customerPool.length === 0) {
    // Create ~30% of count as unique customers (rest are repeat)
    const uniqueCustomers = Math.floor(count * 0.3);
    for (let i = 0; i < Math.max(1000, uniqueCustomers); i++) {
      customerPool.push(uuidv4());
    }
  }

  for (let i = 0; i < count; i++) {
    const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    const countries = COUNTRIES[region];
    const country = countries[Math.floor(Math.random() * countries.length)];

    // Pick a customer (weighted towards repeat customers)
    const customerId = customerPool[Math.floor(Math.random() * customerPool.length)];

    // Generate order items
    const numItems = Math.floor(Math.random() * 4) + 1;
    const lineItems = [];
    let totalAmount = 0;

    for (let j = 0; j < numItems; j++) {
      const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;
      const itemTotal = product.price * quantity;
      totalAmount += itemTotal;

      lineItems.push({
        sku: `SKU-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        name: product.name,
        category: product.category,
        quantity,
        price: product.price,
        total: Math.round(itemTotal * 100) / 100
      });
    }

    // Generate timestamps (spread over last 90 days)
    const daysAgo = Math.floor(Math.random() * 90);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // Status progression based on age
    let status;
    if (daysAgo < 1) {
      status = Math.random() > 0.5 ? 'pending' : 'processing';
    } else if (daysAgo < 3) {
      status = Math.random() > 0.3 ? 'processing' : 'shipped';
    } else if (daysAgo < 7) {
      status = Math.random() > 0.2 ? 'shipped' : 'delivered';
    } else {
      const rand = Math.random();
      if (rand > 0.95) status = 'cancelled';
      else if (rand > 0.1) status = 'delivered';
      else status = 'shipped';
    }

    const order = {
      orderId: uuidv4(),
      customerId,
      customerEmail: `user${customerId.substring(0, 8)}@example.com`,
      region,
      country,
      productCategory: lineItems[0].category,
      lineItems,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currency: CURRENCIES[region],
      status,
      paymentMethod: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
      shippingAddress: {
        street: `${Math.floor(Math.random() * 9999) + 1} Main Street`,
        city: `City ${Math.floor(Math.random() * 100)}`,
        state: `State ${Math.floor(Math.random() * 50)}`,
        country,
        postalCode: String(Math.floor(Math.random() * 90000) + 10000)
      },
      createdAt,
      updatedAt: status === 'pending' ? createdAt : new Date(createdAt.getTime() + Math.random() * 48 * 60 * 60 * 1000),
      ...(status === 'delivered' && {
        deliveredAt: new Date(createdAt.getTime() + (Math.random() * 7 + 2) * 24 * 60 * 60 * 1000)
      })
    };

    documents.push(order);
  }

  return documents;
}

export default { generateEcommerceData };
