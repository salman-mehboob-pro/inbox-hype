"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  // Non-secret values echoed back so the form keeps them after a failed submit.
  values?: { email?: string; workspaceName?: string };
};

function echo(formData: FormData): AuthFormState["values"] {
  const pick = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return { email: pick("email"), workspaceName: pick("workspaceName") };
}

const email = z.email("Enter a valid email").trim().toLowerCase();
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

const signupSchema = z.object({
  email,
  password,
  workspaceName: z.string().trim().max(100, "Max 100 characters").optional(),
});

const forgotSchema = z.object({ email });

const resetSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return { ...(await loginImpl(formData)), values: echo(formData) };
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return { ...(await signupImpl(formData)), values: echo(formData) };
}

async function loginImpl(formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first. Check your inbox for the link." };
    }
    if (error.code === "invalid_credentials") {
      return { error: "Wrong email or password." };
    }
    logger.error("login failed", { error, code: error.code });
    return { error: "Could not log in. Please try again." };
  }

  redirect(safeNextPath(parsed.data.next));
}

async function signupImpl(formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: { workspace_name: parsed.data.workspaceName || undefined },
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "An account with this email already exists. Try logging in." };
    }
    if (error.code === "weak_password") {
      return { error: error.message };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Too many emails sent. Please wait a few minutes and try again." };
    }
    logger.error("signup failed", { error, code: error.code });
    return { error: "Could not create the account. Please try again." };
  }

  // Email confirmation off -> we already have a session.
  if (data.session) redirect("/dashboard");

  return { message: "Account created. Check your email for a link to confirm it." };
}

export async function forgotPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    logger.error("password reset email failed", { error, code: error.code });
  }

  // Same message either way, so we don't reveal which emails have accounts.
  return { message: "If an account exists for this email, a reset link is on its way." };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "Choose a password different from your old one." };
    }
    logger.error("password update failed", { error, code: error.code });
    return { error: "Could not update the password. Please try again." };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
