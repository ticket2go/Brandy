import NavCard from "@/components/NavCard";
import OrganizationMembersPanel from "@/components/OrganizationMembersPanel";

export const dynamic = "force-dynamic";

export default function OrganizationMembersPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <NavCard />
      <OrganizationMembersPanel organizationId={params.id} />
    </main>
  );
}
