import { Client } from 'pg'

const connectionString = 'postgresql://postgres:a0l0FfQShpCIIzLb@db.zqxkhdfofovullcjypto.supabase.co:5432/postgres'

const MASTER_SQL = `
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. TABLES & SEQUENCES
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  address TEXT,
  phone TEXT,
  gstin TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  logo_url TEXT,
  signature_url TEXT,
  terms_and_conditions_text TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.numbering_sequences (
  doc_type TEXT NOT NULL,
  fy_label TEXT NOT NULL,
  last_number INTEGER DEFAULT 0,
  PRIMARY KEY (doc_type, fy_label)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_operation_idempotency_key UNIQUE (operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  duration_terms INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.course_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  term_no INTEGER NOT NULL,
  term_label TEXT NOT NULL,
  term_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_term_id UUID REFERENCES public.course_terms(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

CREATE SEQUENCE IF NOT EXISTS public.student_admission_seq START 1;

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dob DATE,
  phone TEXT NOT NULL,
  email TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  address TEXT,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'enquiry' CHECK (status IN ('enquiry', 'enrolled', 'active', 'completed', 'dropped')),
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE RESTRICT NOT NULL,
  batch_year INTEGER NOT NULL,
  current_term INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  date_of_joining DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.faculty_salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
  basic NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  hra NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pt_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tds_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_no TEXT NOT NULL UNIQUE,
  faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  salary_structure_snapshot JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  CONSTRAINT unique_faculty_month_year UNIQUE (faculty_id, month, year)
);

CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no TEXT UNIQUE NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  lead_name TEXT,
  lead_phone TEXT,
  lead_email TEXT,
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'converted')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  terms_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT UNIQUE NOT NULL,
  fy_label TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  course_term_id UUID REFERENCES public.course_terms(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  previous_outstanding NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  scholarship_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  coupon_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'cancelled')),
  notes TEXT,
  student_name TEXT,
  student_admission_no TEXT,
  student_phone TEXT,
  student_email TEXT,
  course_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  receipt_no TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT DEFAULT 'bank_transfer' CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer', 'cheque')),
  payment_type TEXT NOT NULL DEFAULT 'payment' CHECK (payment_type IN ('payment', 'refund')),
  reference_no TEXT,
  notes TEXT,
  student_name TEXT,
  student_admission_no TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

-- 3. VIEWS
CREATE OR REPLACE VIEW public.invoice_balances AS
SELECT 
  i.id AS invoice_id,
  i.grand_total,
  COALESCE(SUM(p.amount), 0)::NUMERIC(12,2) AS amount_paid,
  (i.grand_total - COALESCE(SUM(p.amount), 0))::NUMERIC(12,2) AS balance_due,
  CASE 
    WHEN i.status = 'draft' THEN 'draft'
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN (i.grand_total - COALESCE(SUM(p.amount), 0)) <= 0 THEN 'paid'
    WHEN COALESCE(SUM(p.amount), 0) > 0 
         AND (i.grand_total - COALESCE(SUM(p.amount), 0)) > 0 
         AND i.due_date >= CURRENT_DATE THEN 'partial'
    WHEN (i.grand_total - COALESCE(SUM(p.amount), 0)) > 0 
         AND i.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'sent'
  END AS computed_status
FROM public.invoices i
LEFT JOIN public.payments p ON p.invoice_id = i.id
GROUP BY i.id, i.grand_total, i.status, i.due_date;

-- 4. STORED PROCEDURES & TRIGGERS
CREATE OR REPLACE FUNCTION public.get_next_document_number(
  p_doc_type TEXT,
  p_fy_label TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_next_num INTEGER;
BEGIN
  INSERT INTO public.numbering_sequences (doc_type, fy_label, last_number)
  VALUES (p_doc_type, p_fy_label, 1)
  ON CONFLICT (doc_type, fy_label)
  DO UPDATE SET last_number = numbering_sequences.last_number + 1
  RETURNING last_number INTO v_next_num;

  RETURN v_next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_next_document_number(TEXT, TEXT) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.generate_admission_no()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT;
  next_val BIGINT;
BEGIN
  IF NEW.admission_no IS NULL OR NEW.admission_no = '' THEN
    current_year := TO_CHAR(COALESCE(NEW.admission_date, CURRENT_DATE), 'YYYY');
    next_val := nextval('public.student_admission_seq');
    NEW.admission_no := 'AV-' || current_year || '-' || LPAD(next_val::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_admission_no ON public.students;
CREATE TRIGGER trigger_generate_admission_no
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.generate_admission_no();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', NULL, to_jsonb(NEW), v_user_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_user_id);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NULL, v_user_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_quotations_trigger ON public.quotations;
CREATE TRIGGER audit_quotations_trigger AFTER INSERT OR UPDATE OR DELETE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_invoices_trigger ON public.invoices;
CREATE TRIGGER audit_invoices_trigger AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_payments_trigger ON public.payments;
CREATE TRIGGER audit_payments_trigger AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_payslips_trigger ON public.payslips;
CREATE TRIGGER audit_payslips_trigger AFTER INSERT OR UPDATE OR DELETE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_invoice RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.status = 'cancelled' THEN RAISE EXCEPTION 'Invoice is already cancelled'; END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE payments.invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'Cannot cancel an invoice that already has payments recorded against it';
  END IF;

  UPDATE public.invoices
  SET status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || 'Cancelled: ' || COALESCE(p_reason, 'No reason given')
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT p_invoice_id, 'cancelled'::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_student_id uuid,
  p_enrollment_id uuid,
  p_course_term_id uuid,
  p_quotation_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_scholarship_amount numeric DEFAULT 0,
  p_coupon_amount numeric DEFAULT 0,
  p_gst_percent numeric DEFAULT 18,
  p_notes text DEFAULT NULL::text,
  p_save_as_draft boolean DEFAULT false,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_manual_invoice_no text DEFAULT NULL::text
)
RETURNS TABLE(
  invoice_id uuid,
  invoice_no text,
  subtotal numeric,
  previous_outstanding numeric,
  gst_amount numeric,
  grand_total numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_subtotal NUMERIC(12,2) := 0;
  v_taxable NUMERIC(12,2);
  v_gst_amount NUMERIC(12,2);
  v_previous_outstanding NUMERIC(12,2);
  v_grand_total NUMERIC(12,2);
  v_fy_label TEXT;
  v_seq INTEGER;
  v_invoice_no TEXT;
  v_new_invoice_id UUID;
  v_status TEXT;
  v_item JSONB;
  v_reserved BOOLEAN := false;
  v_cached JSONB;
  v_parsed_seq INTEGER;
  v_student_name TEXT;
  v_student_admission_no TEXT;
  v_student_phone TEXT;
  v_student_email TEXT;
  v_course_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (operation, idempotency_key, result)
    VALUES ('create_invoice', p_idempotency_key, NULL)
    ON CONFLICT (operation, idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_reserved = ROW_COUNT;
    IF NOT v_reserved THEN
      SELECT result INTO v_cached FROM public.idempotency_keys
        WHERE operation = 'create_invoice' AND idempotency_key = p_idempotency_key;
      IF v_cached IS NULL THEN
        RAISE EXCEPTION 'A duplicate request is already in progress — please wait and retry';
      END IF;
      RETURN QUERY SELECT (v_cached->>'invoice_id')::UUID, v_cached->>'invoice_no',
        (v_cached->>'subtotal')::NUMERIC, (v_cached->>'previous_outstanding')::NUMERIC,
        (v_cached->>'gst_amount')::NUMERIC, (v_cached->>'grand_total')::NUMERIC, v_cached->>'status';
      RETURN;
    END IF;
  END IF;

  SELECT name, admission_no, phone, email INTO v_student_name, v_student_admission_no, v_student_phone, v_student_email
    FROM public.students WHERE id = p_student_id;
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'Invalid student';
  END IF;

  IF p_enrollment_id IS NOT NULL THEN
    SELECT c.name INTO v_course_name
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.id = p_enrollment_id AND e.student_id = p_student_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected enrollment does not belong to this student';
    END IF;
  END IF;

  IF p_course_term_id IS NOT NULL AND p_enrollment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.course_terms ct
    JOIN public.enrollments e ON e.course_id = ct.course_id
    WHERE ct.id = p_course_term_id AND e.id = p_enrollment_id
  ) THEN
    RAISE EXCEPTION 'The selected term does not belong to this enrollment''s course';
  END IF;

  IF p_enrollment_id IS NOT NULL AND p_course_term_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.enrollment_id = p_enrollment_id
      AND inv.course_term_id = p_course_term_id
      AND inv.status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'An invoice already exists for this term on this enrollment. Cancel it first if you need to reissue.';
  END IF;

  IF p_quotation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotations WHERE id = p_quotation_id
  ) THEN
    RAISE EXCEPTION 'Invalid quotation';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invoice must contain at least one line item';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'quantity')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be greater than zero';
    END IF;
    IF (v_item->>'unit_price')::NUMERIC < 0 THEN
      RAISE EXCEPTION 'Item unit price cannot be negative';
    END IF;
    v_subtotal := v_subtotal + ((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC);
  END LOOP;

  v_taxable := v_subtotal - (COALESCE(p_discount_amount, 0) + COALESCE(p_scholarship_amount, 0) + COALESCE(p_coupon_amount, 0));
  IF v_taxable < 0 THEN
    RAISE EXCEPTION 'Total discounts cannot exceed line items subtotal';
  END IF;

  v_gst_amount := ROUND(v_taxable * (COALESCE(p_gst_percent, 18) / 100.0), 2);

  SELECT COALESCE(SUM(balance_due), 0) INTO v_previous_outstanding
  FROM public.invoice_balances ib
  JOIN public.invoices inv ON inv.id = ib.invoice_id
  WHERE inv.student_id = p_student_id AND inv.status != 'cancelled';

  v_grand_total := v_taxable + v_gst_amount + v_previous_outstanding;

  IF EXTRACT(MONTH FROM p_invoice_date) >= 4 THEN
    v_fy_label := TO_CHAR(p_invoice_date, 'YY') || '-' || TO_CHAR(p_invoice_date + INTERVAL '1 year', 'YY');
  ELSE
    v_fy_label := TO_CHAR(p_invoice_date - INTERVAL '1 year', 'YY') || '-' || TO_CHAR(p_invoice_date, 'YY');
  END IF;

  IF p_manual_invoice_no IS NOT NULL AND TRIM(p_manual_invoice_no) <> '' THEN
    v_invoice_no := TRIM(p_manual_invoice_no);
    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_no = v_invoice_no) THEN
      RAISE EXCEPTION 'Invoice number % already exists', v_invoice_no;
    END IF;

    IF v_invoice_no ~ ('^INV-' || v_fy_label || '-\d{4}$') THEN
      v_parsed_seq := NULLIF(SUBSTRING(v_invoice_no FROM '^INV-' || v_fy_label || '-(\d{4})$'), '')::INTEGER;
      IF v_parsed_seq IS NOT NULL THEN
        INSERT INTO public.numbering_sequences (doc_type, fy_label, last_number)
        VALUES ('invoice', v_fy_label, v_parsed_seq)
        ON CONFLICT (doc_type, fy_label)
        DO UPDATE SET last_number = GREATEST(numbering_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END IF;
  ELSE
    v_seq := public.get_next_document_number('invoice', v_fy_label);
    v_invoice_no := 'INV-' || v_fy_label || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;

  IF p_save_as_draft THEN
    v_status := 'draft';
  ELSE
    v_status := 'sent';
  END IF;

  INSERT INTO public.invoices (
    invoice_no, fy_label, student_id, enrollment_id, course_term_id, quotation_id,
    invoice_date, due_date, previous_outstanding, subtotal, discount_amount,
    scholarship_amount, coupon_amount, gst_percent, gst_amount, grand_total,
    status, notes, student_name, student_admission_no, student_phone, student_email, course_name, created_by
  ) VALUES (
    v_invoice_no, v_fy_label, p_student_id, p_enrollment_id, p_course_term_id, p_quotation_id,
    p_invoice_date, p_due_date, v_previous_outstanding, v_subtotal, p_discount_amount,
    p_scholarship_amount, p_coupon_amount, p_gst_percent, v_gst_amount, v_grand_total,
    v_status, p_notes, v_student_name, v_student_admission_no, v_student_phone, v_student_email, v_course_name, auth.uid()
  ) RETURNING id INTO v_new_invoice_id;

  INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total)
  SELECT 
    v_new_invoice_id,
    (item->>'description')::TEXT,
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    ROUND((item->>'quantity')::NUMERIC * (item->>'unit_price')::NUMERIC, 2)
  FROM jsonb_array_elements(p_items) AS item;

  IF p_quotation_id IS NOT NULL THEN
    UPDATE public.quotations SET status = 'converted' WHERE id = p_quotation_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_keys SET result = jsonb_build_object(
      'invoice_id', v_new_invoice_id, 'invoice_no', v_invoice_no,
      'subtotal', v_subtotal, 'previous_outstanding', v_previous_outstanding,
      'gst_amount', v_gst_amount, 'grand_total', v_grand_total, 'status', v_status
    ) WHERE operation = 'create_invoice' AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN QUERY SELECT v_new_invoice_id, v_invoice_no, v_subtotal, v_previous_outstanding, v_gst_amount, v_grand_total, v_status;
END;
$function$;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON public.students(admission_no);
CREATE INDEX IF NOT EXISTS idx_students_name_trgm ON public.students USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_phone ON public.students(phone);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_no ON public.invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_enrollment_id ON public.invoices(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_course_term_id ON public.invoices(course_term_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id ON public.invoices(quotation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_dates ON public.invoices(invoice_date, due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_receipt_no ON public.payments(receipt_no);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_payment_mode ON public.payments(payment_mode);

CREATE INDEX IF NOT EXISTS idx_quotations_quote_no ON public.quotations(quote_no);
CREATE INDEX IF NOT EXISTS idx_quotations_student_id ON public.quotations(student_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON public.quotations(quote_date);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON public.enrollments(course_id);

CREATE INDEX IF NOT EXISTS idx_salary_struct_faculty_date ON public.faculty_salary_structures(faculty_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_payslips_faculty_id ON public.payslips(faculty_id);
CREATE INDEX IF NOT EXISTS idx_payslips_faculty_month_year ON public.payslips(faculty_id, month, year);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numbering_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access users') THEN
    CREATE POLICY "Auth full access users" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access company_settings') THEN
    CREATE POLICY "Auth full access company_settings" ON public.company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access numbering_sequences') THEN
    CREATE POLICY "Auth full access numbering_sequences" ON public.numbering_sequences FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access audit_logs') THEN
    CREATE POLICY "Auth full access audit_logs" ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access idempotency_keys') THEN
    CREATE POLICY "Auth full access idempotency_keys" ON public.idempotency_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access courses') THEN
    CREATE POLICY "Auth full access courses" ON public.courses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access course_terms') THEN
    CREATE POLICY "Auth full access course_terms" ON public.course_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access fee_heads') THEN
    CREATE POLICY "Auth full access fee_heads" ON public.fee_heads FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access students') THEN
    CREATE POLICY "Auth full access students" ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access enrollments') THEN
    CREATE POLICY "Auth full access enrollments" ON public.enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access faculty') THEN
    CREATE POLICY "Auth full access faculty" ON public.faculty FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access faculty_salary_structures') THEN
    CREATE POLICY "Auth full access faculty_salary_structures" ON public.faculty_salary_structures FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access payslips') THEN
    CREATE POLICY "Auth full access payslips" ON public.payslips FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access quotations') THEN
    CREATE POLICY "Auth full access quotations" ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access quotation_items') THEN
    CREATE POLICY "Auth full access quotation_items" ON public.quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access invoices') THEN
    CREATE POLICY "Auth full access invoices" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access invoice_items') THEN
    CREATE POLICY "Auth full access invoice_items" ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth full access payments') THEN
    CREATE POLICY "Auth full access payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7. INITIAL SEED DATA
INSERT INTO public.company_settings (
  name, address, phone, gstin, bank_name, bank_account_name, bank_account_number, bank_ifsc, terms_and_conditions_text
) VALUES (
  'Aviora Aviation Academy Pvt. Ltd.',
  'Hangar 4, International Flight Training Terminal, Bangalore Aerospace Park, Karnataka 562149',
  '+91 80 4912 8800',
  '29AABCA1234F1Z8',
  'HDFC Bank Ltd.',
  'Aviora Aviation Academy Private Limited',
  '50200088991122',
  'HDFC0001234',
  '1. All aviation flight training fees are subject to DGCA regulations.\n2. Invoices must be cleared before starting flight simulator & solo flight sorties.\n3. Late payments will attract an administrative fee of 2% per month.'
) ON CONFLICT DO NOTHING;
`

async function executeMigration() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('Connecting to target database (zqxkhdfofovullcjypto)...')
    await client.connect()
    console.log('Connected successfully.')

    console.log('Executing master replication DDL...')
    await client.query(MASTER_SQL)
    console.log('DDL execution completed successfully!')

    console.log('\n--- VERIFYING REPLICATED DATABASE STRUCTURE ---')

    // 1. Verify tables
    const tableRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;")
    console.log('Tables created (' + tableRes.rows.length + '):', tableRes.rows.map(r => r.table_name).join(', '))

    // 2. Verify view
    const viewRes = await client.query("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name;")
    console.log('Views created (' + viewRes.rows.length + '):', viewRes.rows.map(r => r.table_name).join(', '))

    // 3. Verify functions
    const funcRes = await client.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;")
    console.log('Functions created (' + funcRes.rows.length + '):', funcRes.rows.map(r => r.routine_name).join(', '))

    // 4. Verify company settings seed
    const seedRes = await client.query('SELECT name, phone, gstin FROM public.company_settings;')
    console.log('Company settings seed record:', seedRes.rows)

  } catch (err) {
    console.error('Migration execution failed:', err)
  } finally {
    await client.end()
  }
}

executeMigration()
