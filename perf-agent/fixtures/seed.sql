CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, category text NOT NULL, price_cents int NOT NULL);
CREATE TABLE inventory (product_id int PRIMARY KEY REFERENCES products(id), stock int NOT NULL);
\i /demo-fixtures/data.sql
-- Models a warehouse's fixed round-trip cost, identical for all revisions and both test instances.
-- MATERIALIZED forces exactly one delay per query, independent of row count.
CREATE VIEW warehouse_stock AS WITH round_trip AS MATERIALIZED (SELECT pg_sleep(0.012)) SELECT inventory.* FROM inventory CROSS JOIN round_trip;
CREATE USER storefront WITH PASSWORD 'local-readonly';
GRANT CONNECT ON DATABASE storefront TO storefront;
GRANT USAGE ON SCHEMA public TO storefront;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO storefront;
