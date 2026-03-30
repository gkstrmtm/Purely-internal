import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalAppSettingsBusinessPage() {
  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Business</h1>
      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        Business settings are coming soon.
      </div>
    </div>
  );
}
