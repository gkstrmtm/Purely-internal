# Pura onboarding and multi-task execution plan

## Goals

- Let new customers choose between the manual onboarding checklist and an `Onboard with Pura` flow.
- Have Pura ask only for onboarding information that is still missing from the business profile.
- Reuse the same agentic planning model for onboarding and broader "do all of these things" prompts.

## Onboarding flow

- The onboarding status API should return a structured list of missing profile fields, recommended setup tasks, and a starter prompt for Pura.
- The onboarding screen should deep-link into AI chat with an onboarding bootstrap intent.
- AI chat should create a purpose-built thread titled `Onboarding with Pura`, attach the onboarding summary to thread context, and auto-send the starter prompt once.
- Pura should open by summarizing what is already complete, asking only for the missing profile inputs, and then continuing into setup work.

## Execution model for many tasks in one prompt

- Treat a user prompt as a work packet, not a single action.
- First classify the request into:
  - missing information to collect
  - read-only checks to run
  - executable setup actions to queue
  - actions that need confirmation because they charge credits, start billing, or send external messages
- Once enough information is available, group compatible actions into a single plan and execute them in batches.
- Persist the plan summary, completed steps, unresolved questions, and next-step suggestions on thread context so Pura can resume cleanly.

## Guardrails

- Ask before any billing, credit-consuming work that is not obviously requested, or anything that sends outward communication.
- Prefer updating the business profile first because many downstream generators depend on that context.
- When the user gives many tasks at once, keep one running summary:
  - what is already done
  - what is blocked on missing info
  - what is waiting for confirmation
  - what Pura will handle next

## Near-term follow-ups

- Expand onboarding readiness beyond profile, blogs, and credits by surfacing live service readiness for inbox, reviews, automations, funnels, and nurture.
- Add a compact onboarding status card inside AI chat so the user can always see what remains.
- Teach the planner to explicitly merge multiple compatible actions into one execution round instead of treating each intent in isolation.