"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPassword, type AuthFormState } from "../actions";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPassword, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage error={state.error} />
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            errors={state.fieldErrors?.password}
          />
          <Field
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            errors={state.fieldErrors?.confirmPassword}
          />
          <SubmitButton pendingText="Saving…">Save password</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
