"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function bootstrapDemoProjects() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.schema("core_pm").rpc("join_demo_org_projects");
  if (error) {
    console.warn("join_demo_org_projects:", error.message);
  }
}

export async function login(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?error=" + encodeURIComponent("Konfigurasi Supabase tidak lengkap"));
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  await bootstrapDemoProjects();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login?error=" + encodeURIComponent("Konfigurasi Supabase tidak lengkap"));
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${site}/auth/callback?next=/`,
    },
  });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  if (data.session) {
    await bootstrapDemoProjects();
    revalidatePath("/", "layout");
    redirect("/");
  }

  redirect(
    "/login?message=" +
      encodeURIComponent(
        "Jika konfirmasi email aktif, cek inbox lalu klik tautan verifikasi."
      )
  );
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function joinDemoProjectsAction() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/?joinError=" + encodeURIComponent("Supabase tidak dikonfigurasi"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.schema("core_pm").rpc("join_demo_org_projects");
  if (error) {
    redirect("/?joinError=" + encodeURIComponent(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/");
}
