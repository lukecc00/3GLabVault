import { redirect } from "next/navigation";

export default async function LegacyKnowledgeSpaceDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  redirect(`/portal/knowledge/spaces/${spaceId}`);
}
