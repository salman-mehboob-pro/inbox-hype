"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signup, type AuthFormState } from "../actions";

export default function SignupPage() {
  const [state, action] = useActionState<AuthFormState, FormData>(signup, {});

  if (state.message) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Check your email</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>Start sending cold email from your own inboxes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage error={state.error} />
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
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            errors={state.fieldErrors?.password}
          />
          <Field
            key={`ws-${state.values?.workspaceName ?? ""}`}
            label="Workspace name (optional)"
            name="workspaceName"
            placeholder="e.g. Buildberg"
            maxLength={100}
            defaultValue={state.values?.workspaceName}
            errors={state.fieldErrors?.workspaceName}
          />
          <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
