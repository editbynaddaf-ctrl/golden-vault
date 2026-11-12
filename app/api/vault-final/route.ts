import { NextResponse } from 'next/server';

// Golden Vault V3 ends immediately when the commander tests the correct key.
// The legacy Thursday final is intentionally disabled; it must not reopen play.
export const runtime = 'nodejs';

const retired = () => NextResponse.json(
  { error: 'مراسم پنجشنبه حذف شده است؛ اولین آزمایش موفق کلید، برنده را مشخص می‌کند.' },
  { status: 410, headers: { 'Cache-Control':'no-store' } }
);

export async function GET() { return retired(); }
export async function POST() { return retired(); }
