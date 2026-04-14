"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSignupMode,
  isEmailAllowedForSignup,
} from "@/lib/pilot-config";

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

  const mode = getSignupMode();
  if (mode === "closed") {
    redirect(
      "/login?error=" +
        encodeURIComponent("Pendaftaran akun baru dinonaktifkan. Hubungi admin.")
    );
  }
  if (!isEmailAllowedForSignup(email)) {
    redirect(
      "/login?error=" +
        encodeURIComponent(
          "Alamat email ini tidak diizinkan untuk pendaftaran (kebijakan pilot)."
        )
    );
  }

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

export async function createOrganizationProjectAction(formData: FormData) {
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

  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const organizationSlug = String(formData.get("organization_slug") ?? "").trim();
  const projectName = String(formData.get("project_name") ?? "").trim();
  const projectKey = String(formData.get("project_key") ?? "").trim();
  const projectDescription = String(formData.get("project_description") ?? "").trim();

  if (!organizationName || !projectName) {
    redirect(
      "/?joinError=" +
        encodeURIComponent("Nama organisasi dan nama project wajib diisi")
    );
  }

  const { error } = await supabase.schema("core_pm").rpc(
    "create_organization_project_bootstrap",
    {
      p_org_name: organizationName,
      p_org_slug: organizationSlug || null,
      p_project_name: projectName,
      p_project_key: projectKey || null,
      p_project_description: projectDescription || null,
    }
  );

  if (error) {
    redirect("/?joinError=" + encodeURIComponent(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/");
}
