import { redirect } from "next/navigation";

export default async function ShareIndexPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/share/${token}/schedule`);
}
