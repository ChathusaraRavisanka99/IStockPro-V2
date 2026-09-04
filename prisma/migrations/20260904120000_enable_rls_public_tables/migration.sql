-- Enables Row Level Security on every table in the public schema, with no
-- policies attached. Supabase auto-exposes public.* tables through PostgREST
-- to the anon/authenticated roles; with RLS off, anyone holding the project's
-- anon key can read/write these tables directly, bypassing this app's own
-- NextAuth/RBAC checks entirely (which only gate access through the Next.js
-- server, not the database itself).
--
-- This app never queries Postgres through PostgREST/the Supabase client SDK —
-- all data access goes through Prisma, connected as the `postgres` role, which
-- owns every table and bypasses RLS by default. So RLS-with-no-policies is a
-- deny-all for PostgREST while leaving the app itself completely unaffected.
ALTER TABLE public."Accessory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LotPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Phone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PhoneModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PhoneVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Quotation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuotationItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReturnInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaxPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaxPaymentReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
