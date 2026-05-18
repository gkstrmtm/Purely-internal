# Recoverability Retention and Permanent Purge Policy

Date: 2026-05-17
Prompt: P-033
Scope: archived records created through the P-031 and P-032 recoverability model

## Purpose

This policy separates normal user deletion from true permanent deletion.

- Normal delete archives business records so accidental removal remains recoverable.
- Permanent purge is a privileged operator action for archived records only.
- Legal and privacy deletion requests follow a separate reviewed path and are not treated as normal operator cleanup.

## Definitions

### Recoverable archive

Recoverable archive is the default delete behavior for supported business records.

- The live record is hidden from normal user surfaces.
- The record remains restorable from the platform-admin recovery console.
- The archive ledger stores only the metadata needed for operator search and controlled restore.
- Archive and restore actions write audit events.

### Permanent purge

Permanent purge is a terminal destructive action.

- Only `ADMIN` and `PLATFORM_ADMIN` may purge.
- Only currently archived records may be purged.
- Purge requires an explicit reason and confirmation.
- Purge preserves audit history but removes the record from the recovery queue.
- Purge must not cross owners or workspaces.

### Legal/privacy deletion

Legal or privacy deletion is a separate path from accidental-recovery tooling.

- Use this path when statutory, contractual, or customer-directed deletion is required.
- This path may need to remove uploaded files, reports, messages, and other data beyond the archive ledger.
- Do not treat recovery-console purge as the general legal/privacy workflow.

## Default retention target

The default retention target for archived recoverable records is 30 days.

- This is a manual operational guideline, not an automatic purge job.
- Automatic scheduled purge is not enabled by default.
- Operators should prefer restore over purge during the retention window unless there is a reviewed reason not to.

## What must not be purged automatically

The following data classes should remain outside automatic cleanup unless a reviewed safe behavior exists:

- records with billing, credit, financial, or entitlements history
- records with legal or compliance significance
- records with dependent audit trails that would become misleading after deletion
- records with linked operational history that still needs separate review
- any record targeted for a customer privacy or legal deletion request

## Current P-033 purge scope

The current permanent-purge implementation is intentionally narrow.

- `portal_task`: purge is allowed from the recovery console after archive, with task completion rows removed first.
- `client_blog_post`: purge is allowed from the recovery console after archive.
- `portal_contact`: purge is blocked when dependent bookings, reviews, inbox threads, leads, or credit-reporting records still exist.

If dependency safety is not clearly defined, the system must deny purge instead of guessing.

## Audit expectations

Permanent purge must preserve enough metadata to answer these questions without keeping sensitive bodies or secrets:

- what record was purged
- which owner or workspace it belonged to
- who purged it
- when it was purged
- why it was purged

For P-033, the purge audit trail preserves safe identifying metadata only, such as `name`, `title`, `email`, `slug`, and `status` when available.

## Operational notes

- Normal user delete actions must continue to archive, not purge.
- Recovery-console purge stays visually secondary to restore and must make permanence explicit.
- Any future scheduled cleanup should ship disabled by default or dry-run only until dependency safety is reviewed.