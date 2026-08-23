# IStockPro-v2

Phone resale business management system built with Next.js 14, Prisma, NextAuth, and Tailwind.

## Stack

- Next.js 14 App Router + TypeScript
- Prisma ORM + Postgres
- NextAuth credentials with role-aware session (admin / manager / staff)
- Tailwind CSS design tokens
- Recharts, @react-pdf/renderer, @zxing/browser, papaparse/xlsx, Supabase SDK

## Local setup

1. Install dependencies:

	npm install

2. Copy env:

	Copy .env.example to .env and set values.

3. Start local Postgres:

	docker compose up -d

4. Run migration and seed:

	npm run prisma:migrate
	npm run db:seed

5. Start app:

	npm run dev

6. Sign in:

- URL: /login
- Username: admin
- Password: admin123

## Current status

Phase 1 scaffold has been initialized:

- Prisma schema for core entities and relationships
- Seed user + sample catalog data
- NextAuth credentials login with role in JWT/session
- Route skeletons for all core modules with TODO markers
- Shared UI primitives: Card, StatCard, PageHeader, PrimaryButton, DataTableShell

## Notes

- Role enforcement must happen in server-side data access code.
- Audit logging should be written for every price edit, void action, and user-role change.
- Use Prisma migrations for schema changes.
