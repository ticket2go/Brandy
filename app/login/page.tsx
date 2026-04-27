import NavCard from "@/components/NavCard";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-start justify-start gap-8 py-16">
      <NavCard />
      <section className="mx-auto w-full max-w-md px-6">
        <h1 className="text-4xl font-bold tracking-tight text-black">Login</h1>
        <p className="mt-3 text-sm text-black/60">
          Melde dich mit deinem Benutzernamen und Passwort an. Beim ersten
          Aufruf werden automatisch Demo-Accounts eingerichtet, falls sie
          noch nicht existieren:{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            admin
          </code>
          {" / "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            admin
          </code>
          ,{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            Marcel
          </code>
          {" / "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            Marcel
          </code>
          {" "}und{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            Hannes
          </code>
          {" / "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            Hannes
          </code>
          .
        </p>

        <LoginForm />
      </section>
    </main>
  );
}
