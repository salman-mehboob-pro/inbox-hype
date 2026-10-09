import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { welcome } = await searchParams;
  return <ResetForm welcome={welcome === "1"} />;
}
