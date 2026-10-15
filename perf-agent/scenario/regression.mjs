export async function search(db, term = '') {
  const products = await db.query(
    'SELECT id, name, category, price_cents FROM products WHERE name ILIKE $1 ORDER BY id LIMIT 24',
    [`%${term}%`]
  );
  const results = [];
  for (const product of products.rows) {
    const inventory = await db.query('SELECT stock FROM warehouse_stock WHERE product_id = $1', [
      product.id,
    ]);
    results.push({ ...product, stock: inventory.rows[0]?.stock ?? 0 });
  }
  return results;
}
