"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { login, type AuthFormState } from "../actions";

export function LoginForm({ next, linkExpired }: { next?: string; linkExpired: boolean }) {
  const [state, action] = useActionState<AuthFormState, FormData>(login, {
    error: linkExpired ? "That link has expired or was already used. Please try again." : undefined,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Log in</CardTitle>
        <CardDescription>Welcome back. Log in to your workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage error={state.error} message={state.message} />
          {next && <input type="hidden" name="next" value={next} />}
          <Field
            // Remount when the echoed value changes (Base UI inputs don't allow
            // changing defaultValue after mount).
            key={state.values?.email ?? ""}
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            required
            errors={state.fieldErrors?.email}
          />
          <div className="grid gap-1.5">
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              errors={state.fieldErrors?.password}
            />
            <Link
              href="/forgot-password"
              className="justify-self-end text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">No account yet? Ask your admin for an invite.</p>
        </form>
      </CardContent>
    </Card>
  );
}
