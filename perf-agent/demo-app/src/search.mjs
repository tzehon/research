export async function search(db, term = '') {
  const products = await db.query(
    'SELECT id, name, category, price_cents FROM products WHERE name ILIKE $1 ORDER BY id LIMIT 24',
    [`%${term}%`]
  );
  const stocks = await db.query(
    'SELECT product_id, stock FROM warehouse_stock WHERE product_id = ANY($1::int[])',
    [products.rows.map((p) => p.id)]
  );
  const byId = new Map(stocks.rows.map((s) => [s.product_id, s.stock]));
  return products.rows.map((p) => ({ ...p, stock: byId.get(p.id) ?? 0 }));
}
