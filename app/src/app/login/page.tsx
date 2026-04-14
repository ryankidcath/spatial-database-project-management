import Link from "next/link";
import { login, signup } from "@/app/auth/actions";
import {
  shouldShowSignupForm,
  signupRestrictionDescription,
} from "@/lib/pilot-config";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const message = q.message ? decodeURIComponent(q.message) : null;
  const showSignup = shouldShowSignupForm();
  const signupNote = signupRestrictionDescription();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-slate-900">
          Masuk — Spatial PM
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Akun Supabase Auth (email + sandi). Setelah migration{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">0005</code>, data
          workspace hanya untuk pengguna yang login.
        </p>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
            {message}
          </p>
        )}

        <form action={login} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-medium text-slate-600"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-slate-600"
            >
              Sandi
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Masuk
          </button>
        </form>

        <div className="my-6 border-t border-slate-100" />

        {showSignup ? (
          <>
            <p className="text-center text-xs font-medium text-slate-500">
              Belum punya akun?
            </p>
            {signupNote ? (
              <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-700">
                {signupNote}
              </p>
            ) : null}
            <form action={signup} className="mt-3 space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-slate-600"
                >
                  Email (daftar)
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-slate-600"
                >
                  Sandi (daftar)
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={6}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md border border-slate-300 bg-white py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Daftar
              </button>
            </form>
          </>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-700">
            {signupNote ??
              "Pendaftaran akun baru dinonaktifkan. Hubungi admin untuk akses."}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="text-blue-600 hover:underline">
            Kembali
          </Link>{" "}
          (perlu login)
        </p>
      </div>
    </div>
  );
}
