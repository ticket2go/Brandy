import NavCard from "@/components/NavCard";

export default function AccountPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-start justify-start gap-8 py-16">
      <NavCard />
      <section className="mx-auto w-full max-w-5xl px-6">
        <h1 className="text-4xl font-bold tracking-tight text-black">Account</h1>
        <p className="mt-4 text-sm text-black/60">
          Das Accountmanagement folgt in einem der nächsten Schritte.
        </p>
      </section>
    </main>
  );
}
