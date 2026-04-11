import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function nameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function emailKey(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function phoneKey(value) {
  return String(value || '').replace(/[^0-9]/g, '') || null;
}

async function upsertContact(ownerId, contact) {
  const existing = await prisma.portalContact.findFirst({
    where: {
      ownerId,
      OR: [
        contact.email ? { emailKey: emailKey(contact.email) } : undefined,
        contact.phone ? { phoneKey: phoneKey(contact.phone) } : undefined,
        { nameKey: nameKey(contact.name) },
      ].filter(Boolean),
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.portalContact.update({
      where: { id: existing.id },
      data: {
        name: contact.name,
        nameKey: nameKey(contact.name),
        email: contact.email,
        emailKey: emailKey(contact.email),
        phone: contact.phone,
        phoneKey: phoneKey(contact.phone),
        customVariables: contact.customVariables,
      },
    });
  }

  return prisma.portalContact.create({
    data: {
      ownerId,
      name: contact.name,
      nameKey: nameKey(contact.name),
      email: contact.email,
      emailKey: emailKey(contact.email),
      phone: contact.phone,
      phoneKey: phoneKey(contact.phone),
      customVariables: contact.customVariables,
    },
  });
}

async function main() {
  const preferredEmail = 'credit-client@pureautomation.dev';
  const fallbackEmail = 'credit-client@purelyautomation.dev';

  let owner = await prisma.user.findUnique({
    where: { email: preferredEmail },
    select: { id: true, email: true, clientPortalVariant: true },
  });
  if (!owner) {
    owner = await prisma.user.findUnique({
      where: { email: fallbackEmail },
      select: { id: true, email: true, clientPortalVariant: true },
    });
  }
  if (!owner) throw new Error('Could not find a credit client user to seed.');

  const ownerId = owner.id;

  const contacts = await Promise.all([
    upsertContact(ownerId, {
      name: 'Jamie Carter',
      email: 'jamie.carter@example.com',
      phone: '+15554440111',
      customVariables: {
        addressLine1: '1428 Willow Bend Dr',
        city: 'Austin',
        state: 'TX',
        postalCode: '78704',
        signature: 'Jamie Carter',
      },
    }),
    upsertContact(ownerId, {
      name: 'Marcus Bennett',
      email: 'marcus.bennett@example.com',
      phone: '+15554440222',
      customVariables: {
        addressLine1: '88 Harbor Pointe Ave',
        city: 'Tampa',
        state: 'FL',
        postalCode: '33602',
        signature: 'Marcus Bennett',
      },
    }),
    upsertContact(ownerId, {
      name: 'Sofia Ramirez',
      email: 'sofia.ramirez@example.com',
      phone: '+15554440333',
      customVariables: {
        addressLine1: '3107 Mesa Ridge Ln',
        city: 'Phoenix',
        state: 'AZ',
        postalCode: '85016',
        signature: 'Sofia Ramirez',
      },
    }),
  ]);

  const [jamie, marcus, sofia] = contacts;

  await prisma.creditDisputeLetter.deleteMany({ where: { ownerId } });
  await prisma.creditPull.deleteMany({ where: { ownerId } });
  await prisma.creditReportItem.deleteMany({ where: { report: { ownerId } } });
  await prisma.creditReport.deleteMany({ where: { ownerId } });

  const jamiePull = await prisma.creditPull.create({
    data: {
      ownerId,
      contactId: jamie.id,
      provider: 'IdentityIQ',
      status: 'SUCCESS',
      requestedAt: new Date('2026-04-05T14:05:00.000Z'),
      completedAt: new Date('2026-04-05T14:06:00.000Z'),
      rawJson: {
        creditScope: 'PERSONAL',
        currentScore: 648,
        targetScore: 705,
        utilizationPercent: 31,
        openDisputes: 2,
        bureauScores: { transunion: 646, equifax: 651, experian: 647 },
      },
    },
  });

  const marcusPull = await prisma.creditPull.create({
    data: {
      ownerId,
      contactId: marcus.id,
      provider: 'SmartCredit',
      status: 'SUCCESS',
      requestedAt: new Date('2026-04-03T10:15:00.000Z'),
      completedAt: new Date('2026-04-03T10:16:00.000Z'),
      rawJson: {
        creditScope: 'BUSINESS',
        currentScore: 702,
        targetScore: 740,
        utilizationPercent: 8,
        openDisputes: 1,
        bureauScores: { experian: 701 },
      },
    },
  });

  const reports = await Promise.all([
    prisma.creditReport.create({
      data: {
        ownerId,
        contactId: jamie.id,
        provider: 'IdentityIQ',
        importedAt: new Date('2026-04-05T14:06:00.000Z'),
        createdAt: new Date('2026-04-05T14:06:00.000Z'),
        rawJson: {
          creditScope: 'PERSONAL',
          currentScore: 648,
          targetScore: 705,
          utilizationPercent: 31,
          openDisputes: 2,
          goals: ['Remove collection account', 'Bring utilization below 10%'],
          nextMilestone: 'Resolve the collection and pay balances down before the next pull.',
          bureauScores: {
            transunion: 646,
            equifax: 651,
            experian: 647,
          },
        },
      },
    }),
    prisma.creditReport.create({
      data: {
        ownerId,
        contactId: marcus.id,
        provider: 'SmartCredit',
        importedAt: new Date('2026-04-03T10:16:00.000Z'),
        createdAt: new Date('2026-04-03T10:16:00.000Z'),
        rawJson: {
          creditScope: 'BUSINESS',
          currentScore: 702,
          targetScore: 740,
          utilizationPercent: 8,
          openDisputes: 1,
          goals: ['Keep utilization low', 'Clear duplicate inquiry'],
          nextMilestone: 'Maintain clean payment history and remove the duplicate inquiry.',
          bureauScores: {
            experian: 701,
          },
        },
      },
    }),
    prisma.creditReport.create({
      data: {
        ownerId,
        contactId: sofia.id,
        provider: 'Experian',
        importedAt: new Date('2026-03-28T09:20:00.000Z'),
        createdAt: new Date('2026-03-28T09:20:00.000Z'),
        rawJson: {
          creditScope: 'BOTH',
          currentScore: 689,
          targetScore: 730,
          utilizationPercent: 14,
          openDisputes: 0,
          goals: ['Keep file clean', 'Limit new inquiries'],
          nextMilestone: 'Protect the score gains and stay selective on new applications.',
          bureauScores: {
            transunion: 691,
            equifax: 684,
            experian: 692,
          },
        },
      },
    }),
  ]);

  const [jamieReport, marcusReport, sofiaReport] = reports;

  await prisma.creditReportItem.createMany({
    data: [
      {
        reportId: jamieReport.id,
        bureau: 'TransUnion',
        kind: 'Collection',
        label: 'Midland Credit Management collection account',
        detailsJson: { accountNumber: '...4412', balance: '$642', status: 'Open collection', reportedDate: '2025-11-02' },
        auditTag: 'NEGATIVE',
        disputeStatus: 'Open dispute submitted Apr 6',
        createdAt: new Date('2026-04-05T14:06:00.000Z'),
        updatedAt: new Date('2026-04-06T12:00:00.000Z'),
      },
      {
        reportId: jamieReport.id,
        bureau: 'Equifax',
        kind: 'Late Payment',
        label: 'Capital One card shows 60-day late in error',
        detailsJson: { accountNumber: '...9981', lastReported: '2026-02-14', note: 'Consumer says payment posted on time' },
        auditTag: 'NEGATIVE',
        disputeStatus: null,
        createdAt: new Date('2026-04-05T14:06:00.000Z'),
        updatedAt: new Date('2026-04-05T14:06:00.000Z'),
      },
      {
        reportId: jamieReport.id,
        bureau: 'Experian',
        kind: 'Inquiry',
        label: 'Hard inquiry from Regional Auto Finance',
        detailsJson: { inquiryDate: '2026-01-11', reason: 'Customer does not recognize inquiry' },
        auditTag: 'PENDING',
        disputeStatus: 'Needs documentation',
        createdAt: new Date('2026-04-05T14:06:00.000Z'),
        updatedAt: new Date('2026-04-07T09:00:00.000Z'),
      },
      {
        reportId: marcusReport.id,
        bureau: 'Experian',
        kind: 'Business Card',
        label: 'Amex Blue Business Cash in good standing',
        detailsJson: { limit: '$18,000', utilization: '7%', paymentStatus: 'Paid as agreed' },
        auditTag: 'POSITIVE',
        disputeStatus: null,
        createdAt: new Date('2026-04-03T10:16:00.000Z'),
        updatedAt: new Date('2026-04-03T10:16:00.000Z'),
      },
      {
        reportId: marcusReport.id,
        bureau: 'Experian',
        kind: 'Inquiry',
        label: 'Duplicate hard inquiry from funding marketplace',
        detailsJson: { inquiryDate: '2026-03-18', duplicate: true },
        auditTag: 'PENDING',
        disputeStatus: 'Follow-up due Apr 18',
        createdAt: new Date('2026-04-03T10:16:00.000Z'),
        updatedAt: new Date('2026-04-08T11:25:00.000Z'),
      },
      {
        reportId: sofiaReport.id,
        bureau: 'TransUnion',
        kind: 'Tradeline',
        label: 'Auto loan reporting current and accurate',
        detailsJson: { balance: '$9,240', status: 'Current', paymentHistory: 'Clean' },
        auditTag: 'POSITIVE',
        disputeStatus: null,
        createdAt: new Date('2026-03-28T09:20:00.000Z'),
        updatedAt: new Date('2026-03-28T09:20:00.000Z'),
      },
    ],
  });

  await prisma.creditDisputeLetter.createMany({
    data: [
      {
        ownerId,
        contactId: jamie.id,
        creditPullId: jamiePull.id,
        status: 'GENERATED',
        subject: 'Round 1 - Jamie Carter - Experian',
        bodyText: 'I am requesting a reinvestigation of the Midland Credit Management collection account and the hard inquiry from Regional Auto Finance. These items appear inaccurate and should be verified or removed.',
        promptText: 'Demo seed letter for Jamie Carter.',
        model: 'gpt-5.4',
        generatedAt: new Date('2026-04-06T12:10:00.000Z'),
        createdAt: new Date('2026-04-06T12:10:00.000Z'),
        updatedAt: new Date('2026-04-06T12:10:00.000Z'),
      },
      {
        ownerId,
        contactId: jamie.id,
        creditPullId: jamiePull.id,
        status: 'SENT',
        subject: 'Round 2 - Jamie Carter - TransUnion',
        bodyText: 'This is a follow-up request regarding the remaining collection reporting that was not corrected after my prior dispute. Please provide the method of verification or delete the inaccurate account.',
        promptText: 'Follow-up demo seed letter for Jamie Carter.',
        model: 'gpt-5.4',
        generatedAt: new Date('2026-04-08T16:45:00.000Z'),
        sentAt: new Date('2026-04-09T09:15:00.000Z'),
        lastSentTo: 'TransUnion Consumer Solutions',
        createdAt: new Date('2026-04-08T16:45:00.000Z'),
        updatedAt: new Date('2026-04-09T09:15:00.000Z'),
      },
      {
        ownerId,
        contactId: marcus.id,
        creditPullId: marcusPull.id,
        status: 'DRAFT',
        subject: 'Round 1 - Marcus Bennett - Furnisher',
        bodyText: 'I am disputing a duplicate hard inquiry that appears on my business credit file. Please review the underlying application records and remove any inquiry that was reported in error.',
        promptText: 'Draft demo seed letter for Marcus Bennett.',
        model: 'gpt-5.4',
        createdAt: new Date('2026-04-07T13:30:00.000Z'),
        updatedAt: new Date('2026-04-07T13:30:00.000Z'),
      },
    ],
  });

  console.log(`Seeded credit demo data for ${owner.email}.`);
  console.log(`Contacts: ${contacts.length}, Reports: ${reports.length}, Letters: 3`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
