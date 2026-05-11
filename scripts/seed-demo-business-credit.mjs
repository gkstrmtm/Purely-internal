import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TARGET_EMAIL = "shotbygkstr@gmail.com";
const SEED_SETUP_SLUG = "__credit_demo_seed_v2";

function normalizeNameKey(value) {
	return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeEmailKey(value) {
	const email = String(value || "").trim().toLowerCase();
	return email.includes("@") ? email : null;
}

function normalizePhoneValue(value) {
	const digits = String(value || "").replace(/\D+/g, "");
	const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
	return {
		phone,
		phoneKey: phone || null,
	};
}

function hoursAgo(value) {
	return new Date(Date.now() - value * 60 * 60 * 1000);
}

function daysAgo(value) {
	return new Date(Date.now() - value * 24 * 60 * 60 * 1000);
}

function safeJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function buildProfile(contact, snapshot, milestone) {
	return {
		currentScore: snapshot.currentScore,
		targetScore: snapshot.targetScore,
		bureauScores: snapshot.bureauScores,
		goals: snapshot.goals,
		utilizationPercent: snapshot.utilizationPercent,
		openDisputes: snapshot.openDisputes,
		nextMilestone: milestone,
		fullName: contact.name,
		email: contact.email,
	};
}

function buildExperianRaw(contact, snapshot, tradelines, inquiries, publicRecords, infoMessages, lifecycle) {
	return safeJson({
		provider: "Experian",
		creditScope: "PERSONAL",
		transactionId: `demo-${contact.slug}-${snapshot.currentScore}`,
		profile: buildProfile(contact, snapshot, snapshot.nextMilestone),
		lifecycle: lifecycle || undefined,
		CreditProfile: {
			Header: {
				ReportDate: new Date().toISOString().slice(0, 10),
				ReportTime: new Date().toISOString().slice(11, 19),
			},
			ConsumerIdentity: {
				Name: {
					First: contact.firstName,
					Middle: contact.middleName || "",
					Surname: contact.lastName,
				},
				DOB: contact.dob,
			},
			AddressInformation: contact.addresses.map((address) => ({
				StreetName: address.street,
				City: address.city,
				State: address.state,
				Zip: address.zip,
			})),
			EmploymentInformation: contact.employers.map((name) => ({ Name: name })),
			TradeLine: tradelines,
			Inquiry: inquiries,
			PublicRecord: publicRecords,
			Statement: [
				{
					StatementText: snapshot.statement,
					Type: "Consumer statement",
				},
			],
			InformationalMessage: infoMessages.map((message, index) => ({
				MessageNumber: String(index + 1),
				MessageText: message,
			})),
			ProfileSummary: {
				TotalTradeItems: String(tradelines.length),
				TotalInquiries: String(inquiries.length),
				InquiriesDuringLast6Months: String(snapshot.recentInquiries),
				PublicRecordsCount: String(publicRecords.length),
				PastDueAmount: snapshot.pastDueAmount,
				RevolvingBalance: snapshot.revolvingBalance,
				RevolvingAvailablePercent: String(Math.max(0, 100 - snapshot.utilizationPercent)),
				DisputedAccountsExcluded: String(snapshot.openDisputes),
				DelinquenciesOver30Days: String(snapshot.delinquencies30),
			},
			RiskModel: {
				Score: String(snapshot.currentScore),
				ModelIndicator: "VantageScore 3.0",
				Evaluation: snapshot.evaluation,
				ScoreFactorCodeOne: snapshot.factorOne,
				ScoreFactorCodeTwo: snapshot.factorTwo,
				ScoreFactorCodeThree: snapshot.factorThree,
				ScoreFactorCodeFour: snapshot.factorFour,
			},
		},
	});
}

function itemSeed(overrides) {
	return {
		bureau: "Experian",
		kind: "Account",
		label: "Unnamed account",
		auditTag: "PENDING",
		disputeStatus: null,
		detailsJson: {},
		...overrides,
	};
}

function reportData() {
	const alicia = {
		slug: "alicia-carter",
		name: "Alicia Carter",
		firstName: "Alicia",
		lastName: "Carter",
		middleName: "N",
		email: "alicia.carter@example.com",
		phone: "+1 (813) 555-0181",
		dob: "1994-08-12",
		addresses: [
			{ street: "121 Palm View Dr", city: "Tampa", state: "FL", zip: "33612" },
			{ street: "87 Harbor Run", city: "Jacksonville", state: "FL", zip: "32218" },
		],
		employers: ["North Bay Studio", "Freelance Producer"],
		customVariables: {
			street: "121 Palm View Dr",
			city: "Tampa",
			state: "FL",
			zip: "33612",
			dob: "1994-08-12",
			ssnLast4: "1124",
			signature: "Alicia Carter",
		},
	};

	const aliciaPreviousItems = [
		itemSeed({
			bureau: "Experian",
			kind: "Collection",
			label: "Northstar Recovery collection - $842",
			auditTag: "NEGATIVE",
			disputeStatus: "Dispute mailed 2026-04-10",
			detailsJson: { AccountNumber: "***4832", SubscriberCode: "NSR442", balance: "$842", status: "Collection" },
		}),
		itemSeed({
			bureau: "Equifax",
			kind: "Late Payment",
			label: "Capital First Card - 60 days late",
			auditTag: "NEGATIVE",
			disputeStatus: "Dispute mailed 2026-04-10",
			detailsJson: { AccountNumber: "***9941", lateMonth: "2025-01", status: "60 days late" },
		}),
		itemSeed({
			bureau: "TransUnion",
			kind: "Inquiry",
			label: "Beacon Auto inquiry",
			auditTag: "PENDING",
			disputeStatus: "Need bureau response",
			detailsJson: { inquiryDate: "2026-02-10", accountName: "Beacon Auto" },
		}),
		itemSeed({
			bureau: "Experian",
			kind: "Address",
			label: "Old Jacksonville address",
			auditTag: "PENDING",
			disputeStatus: "Address dispute opened",
			detailsJson: { StreetName: "87 Harbor Run", City: "Jacksonville", State: "FL", Zip: "32218" },
		}),
	];

	const aliciaCurrentItems = [
		itemSeed({
			bureau: "Equifax",
			kind: "Late Payment",
			label: "Capital First Card - 60 days late",
			auditTag: "POSITIVE",
			disputeStatus: "Resolved on latest report 2026-05-11",
			detailsJson: { AccountNumber: "***9941", lateMonth: "2025-01", status: "Paid as agreed" },
		}),
		itemSeed({
			bureau: "TransUnion",
			kind: "Inquiry",
			label: "Beacon Auto inquiry",
			auditTag: "PENDING",
			disputeStatus: "Need bureau response",
			detailsJson: { inquiryDate: "2026-02-10", accountName: "Beacon Auto" },
		}),
		itemSeed({
			bureau: "Experian",
			kind: "Revolving account",
			label: "Metro Rewards Visa",
			auditTag: "POSITIVE",
			disputeStatus: null,
			detailsJson: { AccountNumber: "***1107", status: "Open/never late", balance: "$322" },
		}),
	];

	const aliciaPreviousSnapshot = {
		currentScore: 611,
		targetScore: 700,
		bureauScores: { Experian: 604, Equifax: 617, TransUnion: 612 },
		goals: ["Remove collection accounts", "Get mortgage-ready", "Lower revolving utilization"],
		utilizationPercent: 34,
		openDisputes: 3,
		nextMilestone: "Wait for bureau responses and clear the old address.",
		recentInquiries: 2,
		pastDueAmount: "$1,240",
		revolvingBalance: "$4,910",
		delinquencies30: 2,
		evaluation: "Needs work",
		factorOne: "Recent delinquency on revolving account",
		factorTwo: "Collection account reporting",
		factorThree: "Utilization above target",
		factorFour: "Recent hard inquiry",
		statement: "Consumer disputes collection ownership and late payment reporting.",
	};

	const aliciaCurrentSnapshot = {
		currentScore: 667,
		targetScore: 720,
		bureauScores: { Experian: 661, Equifax: 671, TransUnion: 669 },
		goals: ["Finish inquiry cleanup", "Keep utilization under 10%", "Protect recent score gain"],
		utilizationPercent: 11,
		openDisputes: 1,
		nextMilestone: "Only the unauthorized inquiry still needs a response before broader funding prep.",
		recentInquiries: 1,
		pastDueAmount: "$0",
		revolvingBalance: "$1,480",
		delinquencies30: 0,
		evaluation: "Building",
		factorOne: "Recent hard inquiry remains",
		factorTwo: "Short-term utilization still a little elevated",
		factorThree: "Thin clean history on newest card",
		factorFour: "Need one more clean refresh cycle",
		statement: "Collection account no longer appears and the late payment now reads corrected.",
	};

	const aliciaLifecycle = {
		previousReportId: null,
		carriedForwardCount: 1,
		removedCount: 2,
		resolvedCount: 1,
		notificationSummary: {
			account: "sent",
			client: "sent",
		},
		lastReconciledAt: new Date().toISOString(),
		events: [
			{
				kind: "item_removed",
				title: "Northstar Recovery collection removed",
				description: "The collection no longer appears on the latest report after the mailed dispute.",
				createdAt: new Date().toISOString(),
				itemLabel: "Northstar Recovery collection - $842",
				bureau: "Experian",
			},
			{
				kind: "item_removed",
				title: "Old Jacksonville address removed",
				description: "The disputed old address is gone from the newest file.",
				createdAt: new Date().toISOString(),
				itemLabel: "Old Jacksonville address",
				bureau: "Experian",
			},
			{
				kind: "item_resolved",
				title: "Capital First late payment resolved",
				description: "The late-payment tradeline now reads corrected and clean.",
				createdAt: new Date().toISOString(),
				itemLabel: "Capital First Card - 60 days late",
				bureau: "Equifax",
			},
			{
				kind: "score_improved",
				title: "Score improved to 667",
				description: "The latest report shows a 56-point gain since the previous file.",
				createdAt: new Date().toISOString(),
			},
		],
	};

	const brandon = {
		slug: "brandon-miles",
		name: "Brandon Miles",
		firstName: "Brandon",
		lastName: "Miles",
		email: "brandon.miles@example.com",
		phone: "+1 (813) 555-0182",
		dob: "1990-11-03",
		addresses: [{ street: "4802 Southview Ave", city: "Tampa", state: "FL", zip: "33611" }],
		employers: ["Miles Media LLC"],
		customVariables: {
			street: "4802 Southview Ave",
			city: "Tampa",
			state: "FL",
			zip: "33611",
			dob: "1990-11-03",
			ssnLast4: "8821",
			signature: "Brandon Miles",
		},
	};

	const brandonItems = [
		itemSeed({
			bureau: "Experian",
			kind: "Charge-off",
			label: "Summit Retail Card charge-off",
			auditTag: "NEGATIVE",
			disputeStatus: "Follow-up letter mailed 2026-05-05",
			detailsJson: { AccountNumber: "***3011", balance: "$1,240", status: "Charge-off" },
		}),
		itemSeed({
			bureau: "Equifax",
			kind: "Collection",
			label: "Rapid Med Collections",
			auditTag: "PENDING",
			disputeStatus: "Need validation docs",
			detailsJson: { AccountNumber: "***7754", balance: "$312", status: "Medical collection" },
		}),
		itemSeed({
			bureau: "TransUnion",
			kind: "Inquiry",
			label: "Blue Ridge Lending inquiry",
			auditTag: "PENDING",
			disputeStatus: null,
			detailsJson: { inquiryDate: "2026-03-04", accountName: "Blue Ridge Lending" },
		}),
		itemSeed({
			bureau: "Experian",
			kind: "Account",
			label: "Metro Auto Finance paid as agreed",
			auditTag: "POSITIVE",
			disputeStatus: null,
			detailsJson: { AccountNumber: "***1188", status: "Paid as agreed" },
		}),
	];

	const brandonSnapshot = {
		currentScore: 648,
		targetScore: 720,
		bureauScores: { Experian: 641, Equifax: 655, TransUnion: 649 },
		goals: ["Finish current disputes", "Reach 700+ across bureaus", "Open one cleaner revolving line"],
		utilizationPercent: 19,
		openDisputes: 2,
		nextMilestone: "Resolve the charge-off follow-up and keep new inquiries frozen for 30 days.",
		recentInquiries: 1,
		pastDueAmount: "$1,240",
		revolvingBalance: "$2,870",
		delinquencies30: 1,
		evaluation: "Needs work",
		factorOne: "Charge-off still reporting",
		factorTwo: "Medical collection needs verification",
		factorThree: "Need another positive revolving trade",
		factorFour: "Recent inquiry activity",
		statement: "Client is waiting on updated validation for the medical collection and charge-off follow-up.",
	};

	const chelsea = {
		slug: "chelsea-monroe",
		name: "Chelsea Monroe",
		firstName: "Chelsea",
		lastName: "Monroe",
		email: "chelsea.monroe@example.com",
		phone: "+1 (813) 555-0183",
		dob: "1996-01-28",
		addresses: [{ street: "908 Gulf Point Way", city: "St. Petersburg", state: "FL", zip: "33701" }],
		employers: ["Monroe Creative"],
		customVariables: {
			street: "908 Gulf Point Way",
			city: "St. Petersburg",
			state: "FL",
			zip: "33701",
			dob: "1996-01-28",
			ssnLast4: "4410",
			signature: "Chelsea Monroe",
		},
	};

	const chelseaItems = [
		itemSeed({
			bureau: "Experian",
			kind: "Address",
			label: "Two addresses on file need review",
			auditTag: "PENDING",
			disputeStatus: "Draft letter pending",
			detailsJson: { StreetName: "908 Gulf Point Way", City: "St. Petersburg", State: "FL", Zip: "33701" },
		}),
		itemSeed({
			bureau: "TransUnion",
			kind: "Account",
			label: "Harbor Credit Union card paid as agreed",
			auditTag: "POSITIVE",
			disputeStatus: null,
			detailsJson: { AccountNumber: "***5544", status: "Open/never late" },
		}),
	];

	const chelseaSnapshot = {
		currentScore: 703,
		targetScore: 740,
		bureauScores: { Experian: 698, Equifax: 711, TransUnion: 700 },
		goals: ["Keep the file clean", "Prepare for prime card approvals"],
		utilizationPercent: 8,
		openDisputes: 1,
		nextMilestone: "Clear the address mismatch and then leave the file alone for another clean update cycle.",
		recentInquiries: 0,
		pastDueAmount: "$0",
		revolvingBalance: "$730",
		delinquencies30: 0,
		evaluation: "Strong",
		factorOne: "Address mismatch still open",
		factorTwo: "Thin bureau depth on one file",
		factorThree: "Limited installment history",
		factorFour: "Protect recent clean streak",
		statement: "The file is otherwise clean and close to prime readiness.",
	};

	return {
		contacts: [
			{
				contact: alicia,
				pulls: [{ provider: "Experian", status: "SUCCESS", requestedAt: daysAgo(10), rawJson: { note: "Initial pull" } }],
				reports: [
					{
						provider: "Experian",
						importedAt: daysAgo(9),
						rawJson: buildExperianRaw(
							alicia,
							aliciaPreviousSnapshot,
							[
								{ SubscriberDisplayName: "Northstar Recovery", AccountType: "Collection", Status: "Collection", AccountNumber: "***4832", DisputeFlag: "Yes" },
								{ SubscriberDisplayName: "Capital First Card", AccountType: "Revolving", Status: "60 days late", AccountNumber: "***9941", ConsumerComment: "Consumer disputes late mark" },
							],
							[{ SubscriberDisplayName: "Beacon Auto", Type: "Auto inquiry", InquiryDate: "2026-02-10" }],
							[],
							["Client is waiting on bureau responses for mailed disputes."],
							null,
						),
						items: aliciaPreviousItems,
					},
					{
						provider: "Experian",
						importedAt: hoursAgo(12),
						rawJson: buildExperianRaw(
							alicia,
							aliciaCurrentSnapshot,
							[
								{ SubscriberDisplayName: "Capital First Card", AccountType: "Revolving", Status: "Paid as agreed", AccountNumber: "***9941" },
								{ SubscriberDisplayName: "Metro Rewards Visa", AccountType: "Revolving", Status: "Open/never late", AccountNumber: "***1107" },
							],
							[{ SubscriberDisplayName: "Beacon Auto", Type: "Auto inquiry", InquiryDate: "2026-02-10" }],
							[],
							["Latest report shows the disputed collection and old address removed."],
							aliciaLifecycle,
						),
						items: aliciaCurrentItems,
					},
				],
				letters: [
					{
						subject: "Alicia Carter - Experian collection dispute",
						status: "SENT",
						createdAt: daysAgo(13),
						generatedAt: daysAgo(13),
						sentAt: daysAgo(12),
						lastSentTo: "Experian",
						bodyText: "Date: 2026-04-29\n\nExperian\nP.O. Box 4500\nAllen, TX 75013\n\nRe: Credit report dispute for Alicia Carter\n\nTo whom it may concern,\n\nI dispute the Northstar Recovery collection account and the late payment reporting on Capital First Card. Please reinvestigate these items and remove any information that cannot be fully verified.\n\nSincerely,\nAlicia Carter",
					},
				],
			},
			{
				contact: brandon,
				pulls: [{ provider: "SmartCredit", status: "SUCCESS", requestedAt: daysAgo(5), rawJson: { note: "Follow-up pull" } }],
				reports: [
					{
						provider: "SmartCredit",
						importedAt: daysAgo(4),
						rawJson: buildExperianRaw(
							brandon,
							brandonSnapshot,
							[
								{ SubscriberDisplayName: "Summit Retail Card", AccountType: "Charge-off", Status: "Charge-off", AccountNumber: "***3011", DisputeFlag: "Yes" },
								{ SubscriberDisplayName: "Metro Auto Finance", AccountType: "Installment", Status: "Paid as agreed", AccountNumber: "***1188" },
							],
							[{ SubscriberDisplayName: "Blue Ridge Lending", Type: "Personal loan inquiry", InquiryDate: "2026-03-04" }],
							[],
							["Medical collection still requires validation."],
							null,
						),
						items: brandonItems,
					},
				],
				letters: [
					{
						subject: "Brandon Miles - follow-up bureau letter",
						status: "SENT",
						createdAt: daysAgo(6),
						generatedAt: daysAgo(6),
						sentAt: daysAgo(5),
						lastSentTo: "Equifax",
						bodyText: "Date: 2026-05-05\n\nEquifax\nP.O. Box 740256\nAtlanta, GA 30374-0256\n\nRe: Follow-up dispute for Brandon Miles\n\nTo whom it may concern,\n\nI am following up on the Summit Retail Card charge-off and Rapid Med Collections item. Please provide full verification or delete the reporting.\n\nSincerely,\nBrandon Miles",
					},
				],
			},
			{
				contact: chelsea,
				pulls: [{ provider: "IdentityIQ", status: "SUCCESS", requestedAt: daysAgo(2), rawJson: { note: "Light review pull" } }],
				reports: [
					{
						provider: "IdentityIQ",
						importedAt: hoursAgo(30),
						rawJson: buildExperianRaw(
							chelsea,
							chelseaSnapshot,
							[
								{ SubscriberDisplayName: "Harbor Credit Union", AccountType: "Revolving", Status: "Open/never late", AccountNumber: "***5544" },
							],
							[],
							[],
							["Address mismatch is the only remaining cleanup item on this file."],
							null,
						),
						items: chelseaItems,
					},
				],
				letters: [
					{
						subject: "Chelsea Monroe - draft personal info dispute",
						status: "DRAFT",
						createdAt: hoursAgo(20),
						generatedAt: null,
						sentAt: null,
						lastSentTo: null,
						bodyText: "Date: 2026-05-10\n\nTransUnion\nP.O. Box 2000\nChester, PA 19016-2000\n\nRe: Personal information dispute for Chelsea Monroe\n\nTo whom it may concern,\n\nI need an investigation into the address information on my credit report because one address does not belong to me. Please delete any inaccurate personal information.\n\nSincerely,\nChelsea Monroe",
					},
				],
			},
		],
	};
}

async function upsertContact(ownerId, seed) {
	const nameKey = normalizeNameKey(seed.name);
	const emailKey = normalizeEmailKey(seed.email);
	const phoneNorm = normalizePhoneValue(seed.phone);

	const existing = await prisma.portalContact.findFirst({
		where: {
			ownerId,
			OR: [
				{ nameKey },
				...(emailKey ? [{ emailKey }] : []),
				...(phoneNorm.phoneKey ? [{ phoneKey: phoneNorm.phoneKey }] : []),
			],
		},
		select: { id: true },
	});

	const data = {
		ownerId,
		name: seed.name,
		nameKey,
		email: seed.email,
		emailKey,
		phone: phoneNorm.phone,
		phoneKey: phoneNorm.phoneKey,
		customVariables: safeJson(seed.customVariables),
	};

	if (existing) {
		return prisma.portalContact.update({ where: { id: existing.id }, data, select: { id: true, name: true, email: true } });
	}

	return prisma.portalContact.create({ data, select: { id: true, name: true, email: true } });
}

async function createPull(ownerId, contactId, pull) {
	const created = await prisma.creditPull.create({
		data: {
			ownerId,
			contactId,
			provider: pull.provider,
			status: pull.status,
			requestedAt: pull.requestedAt,
			completedAt: new Date(new Date(pull.requestedAt).getTime() + 5 * 60 * 1000),
			rawJson: safeJson(pull.rawJson),
			createdAt: pull.requestedAt,
			updatedAt: new Date(new Date(pull.requestedAt).getTime() + 5 * 60 * 1000),
		},
		select: { id: true },
	});
	return created.id;
}

async function createReport(ownerId, contactId, report) {
	const created = await prisma.creditReport.create({
		data: {
			ownerId,
			contactId,
			provider: report.provider,
			rawJson: safeJson(report.rawJson),
			importedAt: report.importedAt,
			createdAt: report.importedAt,
		},
		select: { id: true, importedAt: true },
	});

	await prisma.creditReportItem.createMany({
		data: report.items.map((item, index) => ({
			reportId: created.id,
			bureau: item.bureau,
			kind: item.kind,
			label: item.label,
			auditTag: item.auditTag,
			disputeStatus: item.disputeStatus,
			detailsJson: safeJson(item.detailsJson),
			createdAt: new Date(new Date(report.importedAt).getTime() + index * 60 * 1000),
			updatedAt: new Date(new Date(report.importedAt).getTime() + index * 60 * 1000),
		})),
	});

	return created.id;
}

async function createLetter(ownerId, contactId, creditPullId, letter) {
	const created = await prisma.creditDisputeLetter.create({
		data: {
			ownerId,
			contactId,
			creditPullId: creditPullId || null,
			status: letter.status,
			subject: letter.subject,
			bodyText: letter.bodyText,
			promptText: "Demo seeded record",
			model: "demo-seed",
			createdAt: letter.createdAt,
			updatedAt: letter.sentAt || letter.generatedAt || letter.createdAt,
			generatedAt: letter.generatedAt,
			sentAt: letter.sentAt,
			lastSentTo: letter.lastSentTo,
		},
		select: { id: true },
	});
	return created.id;
}

async function clearPreviousSeed(ownerId) {
	const setup = await prisma.portalServiceSetup.findUnique({
		where: { ownerId_serviceSlug: { ownerId, serviceSlug: SEED_SETUP_SLUG } },
		select: { dataJson: true },
	});

	const data = setup?.dataJson && typeof setup.dataJson === "object" && !Array.isArray(setup.dataJson) ? setup.dataJson : null;
	if (!data) return;

	const letterIds = Array.isArray(data.letterIds) ? data.letterIds : [];
	const reportIds = Array.isArray(data.reportIds) ? data.reportIds : [];
	const pullIds = Array.isArray(data.pullIds) ? data.pullIds : [];
	const contactIds = Array.isArray(data.contactIds) ? data.contactIds : [];

	if (letterIds.length) {
		await prisma.creditDisputeLetter.deleteMany({ where: { ownerId, id: { in: letterIds } } });
	}
	if (reportIds.length) {
		await prisma.creditReportItem.deleteMany({ where: { reportId: { in: reportIds } } });
		await prisma.creditReport.deleteMany({ where: { ownerId, id: { in: reportIds } } });
	}
	if (pullIds.length) {
		await prisma.creditPull.deleteMany({ where: { ownerId, id: { in: pullIds } } });
	}
	if (contactIds.length) {
		await prisma.portalContact.deleteMany({ where: { ownerId, id: { in: contactIds } } });
	}
}

async function main() {
	const targetEmail = String(process.argv[2] || DEFAULT_TARGET_EMAIL).trim().toLowerCase();

	const owner = await prisma.user.findFirst({
		where: { email: targetEmail },
		select: { id: true, email: true, role: true, businessProfile: { select: { businessName: true } } },
	});

	if (!owner) {
		throw new Error(`No user found for ${targetEmail}`);
	}
	if (owner.role !== "CLIENT") {
		throw new Error(`Target user ${targetEmail} is not a client account.`);
	}

	await clearPreviousSeed(owner.id);

	const seeded = reportData();
	const contactIds = [];
	const pullIds = [];
	const reportIds = [];
	const letterIds = [];
	const latestReportIds = {};

	for (const entry of seeded.contacts) {
		const contact = await upsertContact(owner.id, entry.contact);
		contactIds.push(contact.id);

		const createdPullIds = [];
		for (const pull of entry.pulls) {
			const pullId = await createPull(owner.id, contact.id, pull);
			pullIds.push(pullId);
			createdPullIds.push(pullId);
		}

		let newestReport = null;
		for (const report of entry.reports) {
			const reportId = await createReport(owner.id, contact.id, report);
			reportIds.push(reportId);
			if (!newestReport || new Date(report.importedAt) > new Date(newestReport.importedAt)) {
				newestReport = { id: reportId, importedAt: report.importedAt };
			}
		}
		if (newestReport) {
			latestReportIds[entry.contact.slug] = newestReport.id;
		}

		for (const [index, letter] of entry.letters.entries()) {
			const creditPullId = createdPullIds[index] || createdPullIds[0] || null;
			const letterId = await createLetter(owner.id, contact.id, creditPullId, letter);
			letterIds.push(letterId);
		}
	}

	await prisma.portalServiceSetup.upsert({
		where: { ownerId_serviceSlug: { ownerId: owner.id, serviceSlug: SEED_SETUP_SLUG } },
		create: {
			ownerId: owner.id,
			serviceSlug: SEED_SETUP_SLUG,
			status: "COMPLETE",
			dataJson: safeJson({
				version: 2,
				seededAtIso: new Date().toISOString(),
				email: owner.email,
				businessName: owner.businessProfile?.businessName || null,
				contactIds,
				pullIds,
				reportIds,
				letterIds,
				latestReportIds,
			}),
		},
		update: {
			status: "COMPLETE",
			dataJson: safeJson({
				version: 2,
				seededAtIso: new Date().toISOString(),
				email: owner.email,
				businessName: owner.businessProfile?.businessName || null,
				contactIds,
				pullIds,
				reportIds,
				letterIds,
				latestReportIds,
			}),
		},
	});

	console.log(JSON.stringify({
		ok: true,
		email: owner.email,
		businessName: owner.businessProfile?.businessName || null,
		ownerId: owner.id,
		counts: {
			contacts: contactIds.length,
			pulls: pullIds.length,
			reports: reportIds.length,
			letters: letterIds.length,
		},
		latestReportIds,
	}, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect().catch(() => {});
	});
