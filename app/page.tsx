import BrandManager from "@/components/BrandManager";
import NavCard from "@/components/NavCard";
import Title from "@/components/Title";

export default function Home() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-start gap-12 py-16">
      <NavCard />
      <Title text="Brandsystem" />
      <BrandManager />
    </main>
  );
}
