import AccountPanel from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-start justify-start gap-8 py-16">
      <AccountPanel />
    </main>
  );
}
