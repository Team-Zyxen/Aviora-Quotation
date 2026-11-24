-- ==============================================================================
-- 0016: Add bank_branch to company_settings and company_invoices
-- Allows branch location to be customized in Company & Document Details
-- and preserved on company invoices and company settings.
-- ==============================================================================

-- 1. Add bank_branch to company_settings if not present
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS bank_branch TEXT DEFAULT 'Aerocity Corporate Branch';

-- Populate existing rows where bank_branch is null
UPDATE public.company_settings 
SET bank_branch = 'Aerocity Corporate Branch' 
WHERE bank_branch IS NULL;

-- 2. Add bank_branch to company_invoices if not present
ALTER TABLE public.company_invoices 
ADD COLUMN IF NOT EXISTS bank_branch TEXT;
