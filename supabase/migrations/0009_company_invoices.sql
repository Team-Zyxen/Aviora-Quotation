-- ==============================================================================
-- 0009: Company Invoices & Company Invoice Line Items
-- Independent corporate invoicing with custom currency (INR, USD, NZD, PHP)
-- and optional GST. Completely segregated from student fee structures.
-- ==============================================================================

-- 1. Create company_invoices Table
CREATE TABLE IF NOT EXISTS public.company_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT UNIQUE NOT NULL,
  fy_label TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_phone TEXT NOT NULL,
  company_address TEXT,
  company_gstin TEXT,
  company_cin TEXT,
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'NZD', 'PHP')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  converted_currency TEXT CHECK (converted_currency IN ('INR', 'USD', 'NZD', 'PHP')),
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1.000000,
  exchange_rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  converted_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  converted_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  converted_gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  converted_grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Create company_invoice_items Table
CREATE TABLE IF NOT EXISTS public.company_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_invoice_id UUID NOT NULL REFERENCES public.company_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'INR',
  converted_unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  converted_line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for fast lookup and search
CREATE INDEX IF NOT EXISTS idx_company_invoices_invoice_no ON public.company_invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_company_invoices_company_name ON public.company_invoices(company_name);
CREATE INDEX IF NOT EXISTS idx_company_invoices_status ON public.company_invoices(status);
CREATE INDEX IF NOT EXISTS idx_company_invoices_created_at ON public.company_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invoice_items_invoice_id ON public.company_invoice_items(company_invoice_id);

-- 4. Enable Row-Level Security
ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invoice_items ENABLE ROW LEVEL SECURITY;

-- 5. Permissive policies for company_invoices
CREATE POLICY "Authenticated users have full access to company_invoices"
  ON public.company_invoices
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can view company_invoices"
  ON public.company_invoices
  FOR SELECT
  TO anon
  USING (true);

-- 6. Permissive policies for company_invoice_items
CREATE POLICY "Authenticated users have full access to company_invoice_items"
  ON public.company_invoice_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can view company_invoice_items"
  ON public.company_invoice_items
  FOR SELECT
  TO anon
  USING (true);
