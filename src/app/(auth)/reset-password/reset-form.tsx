"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPassword, type AuthFormState } from "../actions";

// welcome: the person came from an invite link and sets their first password.
export function ResetForm({ welcome }: { welcome: boolean }) {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPassword, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{welcome ? "Welcome to InboxHype" : "Set a new password"}</CardTitle>
        <CardDescription>
          {welcome
            ? "Choose a password for your account. You will use it with your email to log in."
            : "Choose a new password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage error={state.error} />
          <Field
            label={welcome ? "Password" : "New password"}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            errors={state.fieldErrors?.password}
          />
          <Field
            label={welcome ? "Confirm password" : "Confirm new password"}
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
