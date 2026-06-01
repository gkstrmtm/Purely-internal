# Beta Feedback Status Board

- Date: `2026-06-01`
- Scope: current beta-user complaint set after the latest funnel editor, booking, and service-audit pass
- Goal: separate real remaining blockers from stale complaints, setup-dependent friction, and items that now need manual user-style validation instead of more prompt-driven churn

## Current read

The platform is closer to plug-and-play than it was when the beta feedback was first delivered, but it is not at the point where every complaint should be treated as fully closed.

The highest-value remaining gaps are now:

- hidden readiness state
- setup handoff clarity
- delivery/status truthfulness
- manual operator confidence on real user flows

This board is the working step-three status pass: what looks fixed, what is only partially fixed, and what should still be treated as open during the next manual testing hour.

## Already validated

- `npx tsc --noEmit --project tsconfig.json --pretty false` passes on the current workspace slice.
- Broad automated coverage was previously revalidated in this session:
  - `npm run test:critical-surface-invariants`
  - `npm run test:route-browser-smoke`
  - `npm run test:journey-browser-smoke`
  - `npm run pura:intent-smoke`
- The funnel editor assistant/page-rail cleanup is already landed in the active worktree.
- The public funnel booking readiness bug that showed `This booking link isn’t accepting bookings yet.` for the linked funnel preview was traced to the real public booking contract and patched in the current worktree.
- Live browser validation in the shared funnel editor session previously confirmed the disabled-booking banner disappeared and the booking UI reached the date-picking step.

## Fixed Or Effectively Fixed

### Pura AI composer behavior

Status: fixed at the main client behavior level.

Current code and prior validation both support this:

- the message draft clears on send
- an optimistic working/thinking state is shown
- the complaint is more likely stale, intermittent, or quality-related rather than a current textbox/loading UX regression

### Funnel editor shell and assistant friction

Status: materially improved.

Current work in the funnel editor already cleaned up:

- assistant toggle semantics
- page-context labeling
- bottom assistant strip chrome
- misleading `Editing ...` footer state
- assistant composer visual noise

This does not prove the whole Funnel Builder is bug-free, but the exact shell-level complaints that were actively hurting confidence have been reduced.

### Funnel booking preview readiness

Status: fixed in the current worktree.

The real bug was not fake calendar creation. It was the mismatch between funnel-linked calendar routing and the public booking readiness gate. That path was traced, patched, typechecked, and live-checked.

## Partially Fixed

### Sales provider setup handoff

Status: partially fixed.

The general sales reporting path now points users into Integrations instead of Profile, which is better and more truthful.

What still makes this feel incomplete:

- Stripe-specific reporting still routes users into setup/profile-style flows
- the experience can still read as a bad redirect instead of a guided next step

Interpretation:

This is no longer a raw broken link problem everywhere. It is now a handoff-clarity problem.

### Team invites and teammate adding

Status: implemented, but still fragile from the operator point of view.

The capability exists end to end, but the user can still reasonably experience it as broken because:

- invites are role-gated
- invite creation and invite email delivery are separate outcomes
- a user can hear "invite created" and still never receive the email

Interpretation:

This is partly fixed at the feature level, but not fully fixed at the trust/feedback level.

### Email sending

Status: partially fixed, strongly setup-dependent.

The environment does have outbound email prerequisites present, so this is not a total missing-plumbing problem. But from a beta-user perspective, email can still feel broken because:

- delivery/provider acceptance is still a real failure surface
- mailbox/inbox setup is a different requirement from transactional email sending
- the product does not always make those boundaries obvious enough

Interpretation:

Treat this as a truth-and-setup problem, not a blanket "email feature missing" problem.

### Integrations

Status: present, but still unclear.

The route exists and services can hand users there, but the surface still behaves more like a configuration hub than a strongly guided setup wizard.

Interpretation:

This is technically present but still weak in product clarity.

## Still Open

### Campaign-section confidence

Status: still open.

The campaign surfaces are not obviously stubbed, but the beta complaint could not be reduced to one precise reproducible bug from code inspection alone.

Interpretation:

This remains a real manual-test target.

### Funnel Builder overall "seems buggy"

Status: still open as a product-confidence question, even though the strongest concrete booking bug was fixed.

The right current position is:

- do not overstate this as fully resolved
- do not keep treating it as completely broken either
- use manual user-mode testing to decide whether the remaining impression is still "buggy" or just rough around setup and workflow edges

### Setup handoff wording across services

Status: still open.

This is now one of the biggest plug-and-play blockers for freelancers and business owners. Too many flows still depend on setup state that may be technically correct but feels like a dead end.

## What Needs To Be Done Next

These are the highest-value follow-ups after commit/push.

1. Run one hour of manual user-style testing instead of more prompt-driven exploration.
2. Prioritize service handoffs that bounce users into setup states and judge whether they feel intentional or broken.
3. Validate invite flow truth end to end: permission, invite creation, email arrival, resend behavior, and acceptance path.
4. Validate email behavior as separate buckets:
   - transactional emails
   - inbox/mailbox sending
   - status messaging when delivery fails
5. Validate campaigns as a real operator, not by static reading.

## Recommended Manual Test Focus

If the next pass is one timed hour, use this order:

1. Sales and Integrations handoff
2. Team invite and teammate acceptance
3. Email send-to-self flow
4. Campaign creation/edit/send path
5. Funnel Builder general operator confidence pass

The Funnel Builder does not need to be the first target now because the most concrete live blocker from this session was already fixed.

## Commit And Push Confidence

Current confidence to commit and push this slice: reasonable.

Reason:

- the active implementation slice is compiler-clean
- broad smoke coverage is already green from this session
- the strongest live funnel booking blocker was traced to root cause and fixed
- the remaining concerns are now mostly manual-confidence and setup-truth issues, not obvious missing core code paths

What this does not mean:

- it does not mean every service feels seamless yet
- it does not mean the beta-user concern set is fully closed
- it does not replace acting like a real user for the next test pass

## Bottom Line

The platform does not currently look "missing." It looks like it is transitioning from feature-exists to operator-trustworthy.

That is why the next step should be manual user-mode testing rather than more abstract prompting.