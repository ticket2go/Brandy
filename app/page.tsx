import BrandManager from "@/components/BrandManager";
import Title from "@/components/Title";

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-start gap-12 py-16">
      <Title text="Brandsystem" />
      <BrandManager />
    </main>
  );
}
