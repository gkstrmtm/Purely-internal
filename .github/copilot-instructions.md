- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements

- [x] Scaffold the Project

- [x] Customize the Project

- [ ] Install Required Extensions (no specific extension list provided)

- [x] Compile the Project

- [x] Create and Run Task

- [x] Launch the Project

- [x] Ensure Documentation is Complete
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
- Never add deterministic portal flows, hard-coded execution branches, or screen-reading style logic unless the user explicitly says the code word: screen read.
- Treat fallback as a failure path, not a normal product behavior. The primary job is to make the intended pathway succeed and fulfill its contract.
- Do not introduce layered fallback-on-fallback behavior unless the failure is truly unavoidable for safety or uptime. First remove the cause of fallback activation.
- When fallback exists, keep it narrow, explicit, and temporary-feeling: preserve truthful output, surface the real degradation, and do not let generic fallback language become the main user experience.
- When a route or agent repeatedly falls back, stop optimizing the fallback and instead fix the routing, context delivery, contract enforcement, or validation that should have made the primary path work.
- For funnel-builder AI work, operate in this order: infer the funnel/page job, load stored brief and page intent, resolve shell posture and section plan, compare that intended blueprint against the current page state, then produce only the most important diffs.
- Funnel-builder chat, review, and generation routes should communicate in blueprint terms: page job, shell posture, section sequence, proof placement, CTA rhythm, booking handoff, and current-state diffs. Avoid generic critique language when a concrete page-level diff can be named.
- Asset and block selection for funnels should be role-based, not style-first. Map surfaces to proof, CTA, intake, scheduling, qualification, reinforcement, confirmation, or media roles before talking about visual mood.
