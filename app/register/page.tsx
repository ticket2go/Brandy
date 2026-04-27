import NavCard from "@/components/NavCard";
import RegisterForm from "@/components/RegisterForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-start justify-start gap-8 py-16">
      <NavCard />
      <section className="mx-auto w-full max-w-md px-6">
        <h1 className="text-4xl font-bold tracking-tight text-black">
          Registrieren
        </h1>
        <p className="mt-3 text-sm text-black/60">
          Lege dir einen Account an. Falls du bereits den Slug einer
          Organisation kennst, kannst du dich direkt zuordnen lassen –
          ansonsten kann ein Admin oder der Verwalter dich später aufnehmen.
        </p>

        <RegisterForm />
      </section>
    </main>
  );
}
