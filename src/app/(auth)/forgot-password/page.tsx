"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPassword, type AuthFormState } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPassword, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage error={state.error} message={state.message} />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            errors={state.fieldErrors?.email}
          />
          <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
          <Link
            href="/login"
            className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
