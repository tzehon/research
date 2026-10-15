BEGIN;
TRUNCATE inventory, products;
INSERT INTO products SELECT n, (ARRAY['Alpine','Terra','Drift','Ember','Linen','Cedar'])[(n-1)%6+1] || ' ' || (ARRAY['Lamp','Vase','Chair','Throw'])[(n-1)/6%4+1], (ARRAY['Lighting','Objects','Furniture','Textiles'])[(n-1)/6%4+1], 1800+n*375 FROM generate_series(1,48) n;
INSERT INTO inventory SELECT n, (n*7)%31 FROM generate_series(1,48) n;
COMMIT;
