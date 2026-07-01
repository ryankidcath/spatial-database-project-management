import { WorkspaceHomeClient } from "./workspace-home-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type HomeProps = {
  searchParams: Promise<{
    joinError?: string;
    org?: string;
    project?: string;
    view?: string;
  }>;
};

/** Halaman workspace mengikuti cookie sesi; jangan cache statis antar-user. */
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: HomeProps) {
  const qp = await searchParams;
  const joinError = qp.joinError ? decodeURIComponent(qp.joinError) : null;
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Konfigurasi aplikasi belum siap</p>
          <p className="mt-2">
            Sistem belum bisa terhubung ke layanan data. Hubungi admin aplikasi
            untuk melengkapi pengaturan koneksi.
          </p>
        </div>
      </div>
    );
  }

  return <WorkspaceHomeClient joinError={joinError} />;
}
