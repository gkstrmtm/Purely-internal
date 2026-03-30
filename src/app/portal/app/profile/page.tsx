import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { requirePortalUserForService } from "@/lib/portalAuth";

export default async function PortalAppProfilePage() {
  await requirePortalUserForService("profile", "view");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Profile</h1>
      <p className="mt-2 text-sm text-zinc-600">Account details and security.</p>
      <div className="mt-6">
        <PortalProfileClient embedded mode="profile" />
      </div>
    </div>
  );
}
