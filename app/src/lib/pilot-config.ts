/** Kebijakan pilot / go-live — dibaca di server (login, signup action). */

export type SignupMode = "open" | "closed" | "email_domain";

function normalizeSignupMode(raw: string | undefined): SignupMode {
  const v = raw?.trim().toLowerCase();
  if (v === "closed" || v === "off" || v === "false" || v === "0") {
    return "closed";
  }
  if (v === "email_domain" || v === "domain") {
    return "email_domain";
  }
  return "open";
}

/** `AUTH_SIGNUP_MODE`: `open` (default) | `closed` | `email_domain` */
export function getSignupMode(): SignupMode {
  return normalizeSignupMode(process.env.AUTH_SIGNUP_MODE);
}

/** Suffix email yang diizinkan jika mode `email_domain`, mis. `@perusahaan.id` */
export function getAllowedSignupEmailDomain(): string {
  const d = process.env.AUTH_SIGNUP_ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase() ?? "";
  if (!d) return "";
  return d.startsWith("@") ? d : `@${d}`;
}

export function isEmailAllowedForSignup(email: string): boolean {
  const mode = getSignupMode();
  if (mode === "open") return true;
  if (mode === "closed") return false;
  const domain = getAllowedSignupEmailDomain();
  if (!domain) return false;
  return email.trim().toLowerCase().endsWith(domain);
}

export function shouldShowSignupForm(): boolean {
  return getSignupMode() !== "closed";
}

export function signupRestrictionDescription(): string | null {
  const mode = getSignupMode();
  if (mode === "closed") {
    return "Pendaftaran akun baru dinonaktifkan. Gunakan akun yang sudah diundang atau hubungi admin.";
  }
  if (mode === "email_domain") {
    const d = getAllowedSignupEmailDomain();
    if (!d) {
      return "Pendaftaran dibatasi domain; admin perlu mengisi AUTH_SIGNUP_ALLOWED_EMAIL_DOMAIN.";
    }
    return `Pendaftaran hanya untuk alamat email yang berakhiran ${d}.`;
  }
  return null;
}
