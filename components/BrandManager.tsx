"use client";

import { useState, type FormEvent } from "react";

import BrandCard from "./BrandCard";

type Brand = {
  id: string;
  name: string;
};

export default function BrandManager() {
  const [name, setName] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBrands((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        name: trimmed,
      },
    ]);
    setName("");
  };

  const canSave = name.trim().length > 0;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="brand-name" className="sr-only">
          Brand-Name
        </label>
        <input
          id="brand-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Brand-Name eingeben …"
          className="flex-1 rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black placeholder:text-black/40 outline-none transition focus:border-black/60 focus:ring-2 focus:ring-black/10"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-xl bg-black px-5 py-3 text-base font-medium text-white transition enabled:hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Speichern
        </button>
      </form>

      {brands.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {brands.map((brand) => (
            <BrandCard key={brand.id} name={brand.name} />
          ))}
        </div>
      )}
    </section>
  );
}
