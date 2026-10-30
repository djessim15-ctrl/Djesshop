import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, isSameOrigin } from '@/lib/admin';
import { getSupabaseAuth } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'L’administration n’est pas encore configurée.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (email !== adminEmail || !password || password.length > 1024) {
      return NextResponse.json({ error: 'Identifiants incorrects.' }, { status: 401 });
    }
    // Supabase Auth enforces its own login abuse protections.
    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });
    if (error || !data.session || data.user?.email?.toLowerCase() !== adminEmail) {
      return NextResponse.json({ error: 'Identifiants incorrects.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, data.session.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/',
      maxAge: Math.min(data.session.expires_in, 3600),
    });
    return response;
  } catch (error) {
    console.error('Admin login failed:', error);
    return NextResponse.json({ error: 'Connexion impossible. Réessayez plus tard.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
