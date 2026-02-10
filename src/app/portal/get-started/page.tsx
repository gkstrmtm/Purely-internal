"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";

export default function PortalGetStartedPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/client-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body?.error ?? "Unable to create account");
      return;
    }

    const loginRes = await fetch("/portal/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!loginRes.ok) {
      router.push("/login");
      return;
    }

    router.push("/portal/app");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <p className="mt-6 text-base text-zinc-600">Create your client portal account.</p>

          <form className="mt-6 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="text-base font-medium">Name</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-base font-medium">Email</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-base font-medium">Password</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Already have an account?{" "}
            <a className="font-medium text-brand-ink hover:underline" href="/login">
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
