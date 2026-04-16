import Link from "next/link";
import { login, signup } from "@/app/auth/actions";
import {
  shouldShowSignupForm,
  signupRestrictionDescription,
} from "@/lib/pilot-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const message = q.message ? decodeURIComponent(q.message) : null;
  const mode = q.mode === "signup" ? "signup" : "login";
  const showSignup = shouldShowSignupForm();
  const signupNote = signupRestrictionDescription();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f4f5] px-4 py-12 dark:bg-[#1f2024]">
      <div className="mb-5 flex items-center gap-2 text-foreground">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
          ◫
        </div>
        <p className="text-xl font-semibold">Spatial PM</p>
      </div>
      <Card className="w-full max-w-sm rounded-3xl">
        <CardContent className="p-7">
        <h1 className="text-center text-2xl font-semibold text-foreground">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {mode === "signup"
            ? "Enter your email below to create your account"
            : "Login with your email and password"}
        </p>

        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {message}
          </p>
        )}

        {mode === "login" ? (
          <form action={login} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="m@example.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="login-password">Password</Label>
                <span className="text-sm text-muted-foreground">Forgot your password?</span>
              </div>
              <Input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="h-11 w-full text-base">
              Login
            </Button>
          </form>
        ) : (
          <>
            {!showSignup && (
              <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                {signupNote ??
                  "Pendaftaran akun baru dinonaktifkan. Hubungi admin untuk akses."}
              </p>
            )}
            {showSignup && (
              <form action={signup} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-fullname">Full Name</Label>
                  <Input
                    id="signup-fullname"
                    name="full_name"
                    type="text"
                    autoComplete="name"
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="m@example.com"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <Input
                      id="signup-confirm-password"
                      name="confirm_password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Must be at least 8 characters long.</p>
                <Button type="submit" className="h-11 w-full text-base">
                  Create Account
                </Button>
              </form>
            )}
          </>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
          <Link
            href={mode === "signup" ? "/login" : "/login?mode=signup"}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {mode === "signup" ? "Sign in" : "Sign up"}
          </Link>
        </p>
        </CardContent>
      </Card>
    </div>
  );
}
