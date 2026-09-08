import 'dotenv/config';
import { Client } from '@neondatabase/serverless';

// Tables carrying businessId directly (spec §3.1).
const DIRECT_TABLES = [
  'Product',
  'Customer',
  'Order',
  'Payment',
  'Expense',
  'StockMovement',
  'StockReception',
  'StockCount',
  'CashRegister',
  'CashMovement',
  'Category',
  'ProductCode',
  'DailyStats',
  'Notification',
];

async function applyDirectPolicy(client: Client, table: string) {
  await client.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON "${table}";`);
  await client.query(`
    CREATE POLICY tenant_isolation ON "${table}"
      USING ("businessId" = current_setting('app.business_id', true));
  `);
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL manquant dans .env — requis pour appliquer la RLS.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const table of DIRECT_TABLES) {
      await applyDirectPolicy(client, table);
      console.log(`RLS appliquée : ${table}`);
    }

    // OrderItem — via Order (pas de businessId propre)
    await client.query(`ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;`);
    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON "OrderItem";`);
    await client.query(`
      CREATE POLICY tenant_isolation ON "OrderItem"
        USING (EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o.id = "OrderItem"."orderId"
            AND o."businessId" = current_setting('app.business_id', true)
        ));
    `);
    console.log('RLS appliquée : OrderItem (via Order)');

    // ProductImage — via Product (pas de businessId propre)
    await client.query(`ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE "ProductImage" FORCE ROW LEVEL SECURITY;`);
    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON "ProductImage";`);
    await client.query(`
      CREATE POLICY tenant_isolation ON "ProductImage"
        USING (EXISTS (
          SELECT 1 FROM "Product" p
          WHERE p.id = "ProductImage"."productId"
            AND p."businessId" = current_setting('app.business_id', true)
        ));
    `);
    console.log('RLS appliquée : ProductImage (via Product)');

    console.log('RLS appliquée sur toutes les tables.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Échec application RLS:', err);
  process.exit(1);
});
