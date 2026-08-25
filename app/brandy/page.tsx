import BrandManager from "@/components/BrandManager";
import Greeting from "@/components/Greeting";
import Title from "@/components/Title";

export default function BrandyPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6">
        <Title text="Brandy" />
        <Greeting />
      </header>
      <BrandManager />
    </main>
  );
}
