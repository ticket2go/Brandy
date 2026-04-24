import NavCard from "@/components/NavCard";
import BrandDetail from "@/components/BrandDetail";

type BrandPageProps = {
  params: { slug: string };
};

export default function BrandPage({ params }: BrandPageProps) {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-start justify-start gap-8 py-16">
      <NavCard />
      <BrandDetail slug={params.slug} />
    </main>
  );
}
