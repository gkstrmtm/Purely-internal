import { redirect } from "next/navigation";

export default function PortalPeopleRedirectPage() {
  redirect("/portal/app/people/users");
}
