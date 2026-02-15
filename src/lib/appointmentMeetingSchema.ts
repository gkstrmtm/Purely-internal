import { prisma } from "@/lib/db";

export async function ensureAppointmentMeetingFieldsReady(): Promise<void> {
  // Runtime schema patching (we avoid Prisma migrations in production).
  // These are safe to run multiple times.
  const stmts = [
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingPlatform" TEXT;`,
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrl" TEXT;`,
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrlSetAt" TIMESTAMP(3);`,
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrlSetByUserId" TEXT;`,
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingReminder24hSentAt" TIMESTAMP(3);`,
    `ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingReminder1hSentAt" TIMESTAMP(3);`,
  ];

  for (const sql of stmts) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Ignore; environments may have different permissions.
    }
  }
}
