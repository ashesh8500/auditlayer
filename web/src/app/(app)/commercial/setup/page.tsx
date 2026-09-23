import {requireProfile} from "@/lib/auth";
import {CommercialBrandSetup} from "@/components/commercial-brand-setup";

export default async function CommercialSetupPage() {
  await requireProfile();
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-semibold">Set Up a Brand</h1>
    <CommercialBrandSetup />
  </main>;
}
