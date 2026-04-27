import NavCard from "@/components/NavCard";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <NavCard />
      <AdminPanel />
    </main>
  );
}
