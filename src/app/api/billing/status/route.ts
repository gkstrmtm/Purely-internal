import { NextResponse } from "next/server";

import { isStripeConfigured } from "@/lib/stripeFetch";

export async function GET() {
  return NextResponse.json({ configured: isStripeConfigured() });
}
