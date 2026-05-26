import { redirect } from "next/navigation";

export default async function LegacyKnowledgePageDetailPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;

  redirect(`/portal/knowledge/pages/${pageId}`);
}
