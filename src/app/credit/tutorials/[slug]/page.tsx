import { PortalTutorialDetailPageContent } from "@/app/portal/tutorials/TutorialDetailPageContent";

export default function CreditTutorialDetailPage(props: { params: Promise<{ slug: string }> }) {
  return <PortalTutorialDetailPageContent {...props} variantOverride="credit" />;
}