/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function phoneFromIndex(i) {
  // +1 555-01xx-xxxx (fake)
  const a = String(10 + (i % 90)).padStart(2, "0");
  const b = String(1000 + (i * 37) % 9000).padStart(4, "0");
  return `+155501${a}${b}`;
}

function addMinutes(d, m) {
  return new Date(d.getTime() + m * 60_000);
}

async function main() {
  const seedDemo =
    process.env.SEED_DEMO_DATA === "1" ||
    process.env.SEED_DEMO_DATA === "true" ||
    process.env.SEED_DEMO_DATA === "yes";

  if (!seedDemo) {
    console.log("Seed skipped (set SEED_DEMO_DATA=1 to enable demo seeding).");
    return;
  }

  const inviteCode = process.env.SIGNUP_INVITE_CODE ?? "purely-dev";

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@purelyautomation.dev").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  const dialerEmail = (process.env.SEED_DIALER_EMAIL ?? "dialer@purelyautomation.dev").toLowerCase();
  const dialerPassword = process.env.SEED_DIALER_PASSWORD ?? "dialer1234";

  const closerEmail = (process.env.SEED_CLOSER_EMAIL ?? "closer@purelyautomation.dev").toLowerCase();
  const closerPassword = process.env.SEED_CLOSER_PASSWORD ?? "closer1234";

  const managerEmail = (process.env.SEED_MANAGER_EMAIL ?? "manager@purelyautomation.dev").toLowerCase();
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "manager1234";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", active: true },
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: dialerEmail },
    update: { role: "DIALER", active: true },
    create: {
      email: dialerEmail,
      name: "Demo Dialer",
      role: "DIALER",
      passwordHash: await hashPassword(dialerPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: closerEmail },
    update: { role: "CLOSER", active: true },
    create: {
      email: closerEmail,
      name: "Demo Closer",
      role: "CLOSER",
      passwordHash: await hashPassword(closerPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: managerEmail },
    update: { role: "MANAGER", active: true },
    create: {
      email: managerEmail,
      name: "Demo Manager",
      role: "MANAGER",
      passwordHash: await hashPassword(managerPassword),
    },
  });

  const dialer = await prisma.user.findUnique({ where: { email: dialerEmail } });
  const closer = await prisma.user.findUnique({ where: { email: closerEmail } });
  if (!dialer || !closer) throw new Error("Seed users missing");

  // === Leads ===
  // Create a decent pool across niches/locations so the filtering UI feels real.
  const targetLeadCount = 80;
  const existingLeads = await prisma.lead.count();
  if (existingLeads < targetLeadCount) {
    const rng = makeRng(42);
    const niches = [
      "Roofing",
      "Dental",
      "Chiropractic",
      "Med Spa",
      "HVAC",
      "Plumbing",
      "Landscaping",
      "Pest Control",
      "Home Cleaning",
      "Gym",
      "Real Estate",
      "Personal Injury Law",
    ];
    const locations = [
      "Austin, TX",
      "Phoenix, AZ",
      "Miami, FL",
      "Tampa, FL",
      "Nashville, TN",
      "Dallas, TX",
      "San Diego, CA",
      "Denver, CO",
      "Charlotte, NC",
      "Atlanta, GA",
    ];
    const prefixes = [
      "Acme",
      "Blue",
      "Summit",
      "Prime",
      "All Star",
      "Elite",
      "Evergreen",
      "Sunrise",
      "Frontier",
      "Pioneer",
      "Beacon",
      "Velocity",
    ];
    const suffixes = [
      "Co",
      "Group",
      "Pros",
      "Experts",
      "Solutions",
      "Partners",
      "Clinic",
      "Center",
      "Services",
    ];

    const createCount = targetLeadCount - existingLeads;
    const data = [];
    for (let i = 0; i < createCount; i++) {
      const niche = pick(rng, niches);
      const location = pick(rng, locations);
      const name = `${pick(rng, prefixes)} ${niche} ${pick(rng, suffixes)}`;
      const idx = existingLeads + i + 1;
      data.push({
        businessName: name,
        phone: phoneFromIndex(idx),
        website: `https://example.com/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}`,
        location,
        niche,
        status: "NEW",
      });
    }
    await prisma.lead.createMany({ data });
  }


  // === Script templates ===
  const templateCount = await prisma.script.count({ where: { ownerId: dialer.id, isTemplate: true } });
  if (templateCount === 0) {
    await prisma.script.createMany({
      data: [
        {
          ownerId: dialer.id,
          title: "Default cold-call opener",
          isTemplate: true,
          content:
            "Hey {{name}}, this is {{your_name}} — quick question.\n\nWe help {{niche}} businesses book more qualified appointments without extra admin work.\n\nAre you the person who handles growth / new customers?",
        },
        {
          ownerId: dialer.id,
          title: "Follow-up text template",
          isTemplate: true,
          content:
            "Hey {{name}}, it’s {{your_name}} — we spoke earlier.\n\nIf I could show you how we can add 10–15 qualified appointments/month for {{business_name}}, would you be open to a quick 15-minute chat this week?",
        },
      ],
    });
  }

  // === Lead assignments to dialer ===
  const activeAssignments = await prisma.leadAssignment.count({ where: { userId: dialer.id, releasedAt: null } });
  if (activeAssignments < 25) {
    const need = 25 - activeAssignments;

    // Avoid assigning leads already actively assigned to anyone.
    const activeLeadIds = await prisma.leadAssignment
      .findMany({ where: { releasedAt: null }, select: { leadId: true } })
      .then((rows) => new Set(rows.map((r) => r.leadId)));

    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ["NEW", "ASSIGNED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const toAssign = leads.filter((l) => !activeLeadIds.has(l.id)).slice(0, need);
    if (toAssign.length) {
      await prisma.$transaction(
        toAssign.map((lead) =>
          prisma.leadAssignment.create({ data: { leadId: lead.id, userId: dialer.id } }),
        ),
      );
      await prisma.lead.updateMany({
        where: { id: { in: toAssign.map((l) => l.id) } },
        data: { status: "ASSIGNED" },
      });
    }
  }

  // === Closer availability blocks (next 7 days) ===
  const availCount = await prisma.availabilityBlock.count({ where: { userId: closer.id } });
  if (availCount === 0) {
    const blocks = [];
    const base = new Date();
    base.setSeconds(0, 0);
    for (let day = 0; day < 7; day++) {
      const start = new Date(base);
      start.setDate(start.getDate() + day);
      start.setHours(10, 0, 0, 0);
      const end = new Date(base);
      end.setDate(end.getDate() + day);
      end.setHours(16, 0, 0, 0);
      blocks.push({ userId: closer.id, startAt: start, endAt: end });
    }
    await prisma.availabilityBlock.createMany({ data: blocks });
  }

  // === Create a mix of appointments ===
  const existingAppointments = await prisma.appointment.count();
  if (existingAppointments < 18) {
    const rng = makeRng(99);
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

    const create = [];
    // 10 upcoming scheduled
    for (let i = 0; i < 10; i++) {
      const lead = leads[i % leads.length];
      const start = new Date();
      start.setSeconds(0, 0);
      start.setDate(start.getDate() + (i % 3));
      start.setHours(10 + (i % 5), 0, 0, 0);
      const end = addMinutes(start, 30);
      create.push({
        leadId: lead.id,
        setterId: dialer.id,
        closerId: closer.id,
        startAt: start,
        endAt: end,
        status: "SCHEDULED",
      });
    }

    // 8 past completed with outcomes
    const pastAppointments = [];
    for (let i = 0; i < 8; i++) {
      const lead = leads[(10 + i) % leads.length];
      const start = new Date();
      start.setSeconds(0, 0);
      start.setDate(start.getDate() - (i + 1));
      start.setHours(11 + (i % 4), 0, 0, 0);
      const end = addMinutes(start, 30);
      pastAppointments.push({
        leadId: lead.id,
        setterId: dialer.id,
        closerId: closer.id,
        startAt: start,
        endAt: end,
        status: "COMPLETED",
        loomUrl: i % 2 === 0 ? "https://www.loom.com/share/example" : null,
      });
    }

    await prisma.appointment.createMany({ data: create });
    await prisma.appointment.createMany({ data: pastAppointments });

    // Fetch last created past appointments and attach outcomes.
    const past = await prisma.appointment.findMany({
      where: { status: "COMPLETED" },
      orderBy: { startAt: "desc" },
      take: 8,
    });

    for (let i = 0; i < past.length; i++) {
      const appt = past[i];
      const outcome = i % 3 === 0 ? "CLOSED" : i % 3 === 1 ? "FOLLOW_UP" : "LOST";
      const revenueCents = outcome === "CLOSED" ? Math.round((1500 + rng() * 5000) * 100) : null;
      const outcomeRow = await prisma.appointmentOutcome.upsert({
        where: { appointmentId: appt.id },
        update: { outcome, revenueCents, notes: `Demo outcome: ${outcome}` },
        create: { appointmentId: appt.id, outcome, revenueCents, notes: `Demo outcome: ${outcome}` },
      });

      // If closed, create a contract draft in APPROVED state to show the workflow.
      if (outcome === "CLOSED") {
        const aiDoc = await prisma.doc.create({
          data: {
            ownerId: closer.id,
            title: `Contract – ${appt.id.slice(0, 6)}`,
            kind: "CONTRACT_AI",
            content:
              "Agreement Summary\n\n- Services: Lead gen + appointment setting\n- Term: 90 days\n- Billing: Monthly\n\n(Generated demo content)",
          },
        });

        const draft = await prisma.contractDraft.upsert({
          where: { appointmentOutcomeId: outcomeRow.id },
          update: {
            status: "APPROVED",
            priceCents: revenueCents ?? 0,
            terms: "Net 7. Cancel anytime with 30 days notice.",
            services: "Outbound appointment setting + basic reporting.",
            clientEmail: "client@example.com",
            submittedByUserId: closer.id,
            aiDocId: aiDoc.id,
          },
          create: {
            appointmentOutcomeId: outcomeRow.id,
            status: "APPROVED",
            priceCents: revenueCents ?? 0,
            terms: "Net 7. Cancel anytime with 30 days notice.",
            services: "Outbound appointment setting + basic reporting.",
            clientEmail: "client@example.com",
            submittedByUserId: closer.id,
            aiDocId: aiDoc.id,
          },
        });

        const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
        if (admin) {
          await prisma.approval.create({
            data: {
              contractDraftId: draft.id,
              reviewerId: admin.id,
              decision: "APPROVED",
              notes: "Auto-approved demo",
            },
          });
        }
      }
    }
  }

  // === Prep packs for closer (attach to any scheduled appointments missing prepDoc) ===
  {
    const scheduled = await prisma.appointment.findMany({
      where: { closerId: closer.id, status: "SCHEDULED", prepDocId: null },
      include: { lead: true, setter: { select: { name: true, email: true } } },
      orderBy: { startAt: "asc" },
      take: 25,
    });

    for (const appt of scheduled) {
      const lead = appt.lead;
      const doc = await prisma.doc.create({
        data: {
          ownerId: closer.id,
          title: `Prep Pack – ${lead.businessName}`,
          kind: "CLOSER_PREP_PACK",
          content:
            `Business Snapshot\n- Name: ${lead.businessName}\n- Niche: ${lead.niche ?? "(unknown)"}\n- Location: ${lead.location ?? "(unknown)"}\n- Website: ${lead.website ?? "(none)"}\n- Phone: ${lead.phone}\n\nSetter Context\n- Setter: ${appt.setter?.name ?? "(unknown)"} (${appt.setter?.email ?? ""})\n- Meeting time: ${new Date(appt.startAt).toLocaleString()}\n\nDiscovery Prompts\n- What are you doing today to generate leads?\n- What’s your close rate on booked appointments?\n- What’s your average ticket & capacity?\n\nSuggested Frame\n- Confirm outcomes + timeline\n- Diagnose bottleneck (leadflow vs show rate vs close rate)\n- Present next-step offer\n\n(Seeded demo prep pack — editable later)`,
        },
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { prepDocId: doc.id },
      });
    }
  }

  // === Call logs + transcript docs (dialer) ===
  const callLogCount = await prisma.callLog.count({ where: { dialerId: dialer.id } });
  if (callLogCount < 30) {
    const rng = makeRng(7);
    const assigned = await prisma.leadAssignment.findMany({
      where: { userId: dialer.id, releasedAt: null },
      include: { lead: true },
      take: 25,
    });

    const dispositions = ["NO_ANSWER", "LEFT_VOICEMAIL", "FOLLOW_UP", "NOT_INTERESTED", "BAD_NUMBER", "BOOKED"];
    const methods = ["PHONE", "ZOOM", "GOOGLE_MEET", "IN_PERSON", "OTHER"];

    for (let i = 0; i < assigned.length; i++) {
      const lead = assigned[i].lead;
      const disp = pick(rng, dispositions);
      const method = pick(rng, methods);
      const log = await prisma.callLog.create({
        data: {
          dialerId: dialer.id,
          leadId: lead.id,
          disposition: disp,
          contactName: i % 3 === 0 ? "Owner" : i % 3 === 1 ? "Manager" : "Front Desk",
          contactEmail: i % 2 === 0 ? `contact${i}@example.com` : null,
          contactPhone: i % 4 === 0 ? lead.phone : null,
          companyName: i % 5 === 0 ? `${lead.businessName} (Holdco)` : null,
          method,
          methodOther: method === "OTHER" ? "Calendly" : null,
          notes: `Demo call notes for ${lead.businessName}`,
          followUpAt: disp === "FOLLOW_UP" ? addMinutes(new Date(), 24 * 60) : null,
        },
      });

      // Attach a transcript doc for some calls.
      if (i % 2 === 0) {
        const transcript = await prisma.doc.create({
          data: {
            ownerId: dialer.id,
            title: `Transcript – ${lead.businessName}`,
            kind: "CALL_TRANSCRIPT",
            content:
              `Setter: Hi ${lead.businessName}, quick question...\nProspect: ...\n\n(Editable transcript demo)`,
          },
        });

        await prisma.callLog.update({
          where: { id: log.id },
          data: { transcriptDocId: transcript.id },
        });
      }
    }
  }

  console.log("Seed complete.");
  console.log("Invite code:", inviteCode);
  console.log("Admin login:", adminEmail, adminPassword);
  console.log("Dialer login:", dialerEmail, dialerPassword);
  console.log("Closer login:", closerEmail, closerPassword);
  console.log("Manager login:", managerEmail, managerPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
