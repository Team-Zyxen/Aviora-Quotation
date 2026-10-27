import { Client } from 'pg'

const connectionString = 'postgresql://postgres.yrncaebimjmwhqltroqi:NGF4pXvZ8NxnpMft@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'

async function run() {
  const client = new Client({ connectionString })
  try {
    await client.connect()
    console.log('Connected to PostgreSQL database.')

    await client.query(`
      ALTER TABLE public.company_invoices 
        ADD COLUMN IF NOT EXISTS converted_currency TEXT,
        ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT 1.000000,
        ADD COLUMN IF NOT EXISTS exchange_rate_date DATE DEFAULT CURRENT_DATE,
        ADD COLUMN IF NOT EXISTS converted_subtotal NUMERIC(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS converted_discount_amount NUMERIC(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS converted_gst_amount NUMERIC(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS converted_grand_total NUMERIC(12,2) DEFAULT 0.00;

      ALTER TABLE public.company_invoice_items
        ADD COLUMN IF NOT EXISTS converted_unit_price NUMERIC(12,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS converted_line_total NUMERIC(12,2) DEFAULT 0.00;
    `)
    console.log('Columns added successfully.')

    await client.query(`
      UPDATE public.company_invoices
      SET 
        converted_currency = CASE WHEN currency = 'INR' THEN 'USD' ELSE 'INR' END,
        exchange_rate = CASE 
          WHEN currency = 'USD' THEN 95.180000
          WHEN currency = 'NZD' THEN 54.070000
          WHEN currency = 'PHP' THEN 1.488500
          ELSE 0.010506
        END,
        exchange_rate_date = invoice_date,
        converted_subtotal = ROUND(subtotal * CASE 
          WHEN currency = 'USD' THEN 95.180000
          WHEN currency = 'NZD' THEN 54.070000
          WHEN currency = 'PHP' THEN 1.488500
          ELSE 0.010506
        END, 2),
        converted_discount_amount = ROUND(discount_amount * CASE 
          WHEN currency = 'USD' THEN 95.180000
          WHEN currency = 'NZD' THEN 54.070000
          WHEN currency = 'PHP' THEN 1.488500
          ELSE 0.010506
        END, 2),
        converted_gst_amount = ROUND(gst_amount * CASE 
          WHEN currency = 'USD' THEN 95.180000
          WHEN currency = 'NZD' THEN 54.070000
          WHEN currency = 'PHP' THEN 1.488500
          ELSE 0.010506
        END, 2),
        converted_grand_total = ROUND(grand_total * CASE 
          WHEN currency = 'USD' THEN 95.180000
          WHEN currency = 'NZD' THEN 54.070000
          WHEN currency = 'PHP' THEN 1.488500
          ELSE 0.010506
        END, 2)
      WHERE converted_currency IS NULL OR converted_grand_total = 0;
    `)
    console.log('Existing invoices backfilled.')

    await client.query(`
      UPDATE public.company_invoice_items items
      SET 
        converted_unit_price = ROUND(items.unit_price * inv.exchange_rate, 2),
        converted_line_total = ROUND(items.line_total * inv.exchange_rate, 2)
      FROM public.company_invoices inv
      WHERE items.company_invoice_id = inv.id
        AND (items.converted_line_total IS NULL OR items.converted_line_total = 0);
    `)
    console.log('Existing items backfilled.')

    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'company_invoices' 
      ORDER BY ordinal_position;
    `)
    console.log('Columns:', cols.rows.map(r => r.column_name))

    const check = await client.query(`
      SELECT invoice_no, currency, converted_currency, exchange_rate, grand_total, converted_grand_total 
      FROM company_invoices 
      LIMIT 5;
    `)
    console.log('Sample rows:', check.rows)
  } catch (err) {
    console.error('Migration error:', err)
  } finally {
    await client.end()
  }
}

run()
