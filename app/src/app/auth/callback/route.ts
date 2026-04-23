import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { writeUserAuthAuditLog } from "../../audit-log-actions";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const redirectTo = `${origin}${next.startsWith("/") ? next : "/"}`;
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    await writeUserAuthAuditLog(supabase, {
      actorUserId: user.id,
      action: "user_logged_in",
      payload: { source: "auth_callback", email: user.email ?? null },
    });
  }

  return response;
}
