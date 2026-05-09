export function normalizeUserTextForIntent(textRaw: string): string {
  return String(textRaw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function userExplicitlyWantsAgentToDoIt(textRaw: string): boolean {
  const t = normalizeUserTextForIntent(textRaw).toLowerCase();
  if (!t.trim()) return false;

  const actionVerbs =
    /(\bsend\b|\btext\b|\bsms\b|\bemail\b|\bschedule\b|\breschedule\b|\bcreate\b|\bupdate\b|\bedit\b|\bchange\b|\bset\b|\bmake\b|\bfix\b|\badjust\b|\bmodify\b|\bdelete\b|\bremove\b|\badd\b|\bapply\b|\btag\b|\buntag\b|\benroll\b|\bunroll\b|\brun\b|\bimport\b|\bupload\b|\bverify\b|\bpublish\b|\bunpublish\b|\benable\b|\bdisable\b|\bconnect\b|\bdisconnect\b|\bturn on\b|\bturn off\b|\brename\b|\bmove\b|\breorder\b|\bcopy\b|\bduplicate\b|\barchive\b|\bunarchive\b|\bpause\b|\bstop\b|\bstart\b)/;
  const readOnlyVerbs =
    /(\bshow\b|\blist\b|\bfind\b|\bpull\b|\bcheck\b|\blook up\b|\blookup\b|\breview\b|\baudit\b|\bsummarize\b|\binspect\b|\bscan\b)/;

  // Strong signals that the user wants execution, not just guidance.
  if (/(\bdo it\b|\bdo that\b|\bhandle it\b|\btake care of it\b|\bgo ahead\b|\bgo ahead and\b|\bjust do\b|\bplease do\b|\bi want you to\b|\bi need you to\b|\bcan you\b|\bcould you\b|\bwould you\b)/.test(t)) {
    // Many users phrase imperatives as questions: "can you send..."
    // If they said "can you" with no action verb, let the model decide.
    if (!/(\b(can|could|would) you\b)/.test(t)) return true;
  }
  if (/\bfor me\b/.test(t)) return true;

  // Leading verb commands: "Update my booking form", "Create a funnel", etc.
  if (new RegExp(`^(?:please\\s+)?(?:${actionVerbs.source}|${readOnlyVerbs.source})`).test(t)) return true;

  // Casual team-style commands: "hey, we need to fix...", "let's clean up..."
  if (/\b(?:hey|ok|okay|alright|all right|yo|bro)\b/.test(t) && /(\bwe need to\b|\blet'?s\b|\bpls\b|\bplease\b)/.test(t) && (actionVerbs.test(t) || readOnlyVerbs.test(t))) {
    return true;
  }
  if (/(\bwe need to\b|\bneed to\b|\blet'?s\b|\bpls\b)/.test(t) && (actionVerbs.test(t) || readOnlyVerbs.test(t))) return true;

  if (/\b(can|could|would) you\b/.test(t)) return actionVerbs.test(t) || readOnlyVerbs.test(t);

  // "How about you ..." is usually an imperative, not a request for instructions.
  if (/\bhow about you\b/.test(t)) return actionVerbs.test(t) || readOnlyVerbs.test(t);

  // "Please ..." with an action verb is an imperative.
  if (/\bplease\b/.test(t) && (actionVerbs.test(t) || readOnlyVerbs.test(t))) return true;

  return false;
}

export function userAsksForHowOrSteps(textRaw: string): boolean {
  const t = normalizeUserTextForIntent(textRaw).toLowerCase();
  if (!t.trim()) return false;

  // If they also asked the agent to do it, we should execute instead of explaining.
  if (userExplicitlyWantsAgentToDoIt(t)) return false;

  // Keep this intentionally narrow; a broad "\bhow\b" match misclassifies
  // phrases like "how about you ..." and blocks execute-mode hard overrides.
  if (/\bhow about you\b/.test(t)) return false;

  return (
    /\bhow do i\b/.test(t) ||
    /\bhow can i\b/.test(t) ||
    /\bhow to\b/.test(t) ||
    (/\bsteps?\b/.test(t) && /\b(show|give|share|tell|walk me through)\b/.test(t)) ||
    /\bwhere do i\b/.test(t) ||
    /\bwalk me through\b/.test(t) ||
    /\bwhat do i click\b/.test(t)
  );
}

export function looksLikeImperativeRequest(textRaw: string): boolean {
  const t = normalizeUserTextForIntent(textRaw).toLowerCase();
  if (!t.trim()) return false;

  // Explicit execution intent wins even if the user wrote "how".
  if (userExplicitlyWantsAgentToDoIt(t)) return true;

  if (userAsksForHowOrSteps(t)) return false;

  return /(\bshow\b|\blist\b|\bfind\b|\bpull\b|\bcheck\b|\blook up\b|\blookup\b|\breview\b|\baudit\b|\bsummarize\b|\binspect\b|\bscan\b|\bsend\b|\btext\b|\bsms\b|\bemail\b|\bschedule\b|\breschedule\b|\bcreate\b|\bupdate\b|\bedit\b|\bchange\b|\bset\b|\bmake\b|\bfix\b|\badjust\b|\bmodify\b|\bdelete\b|\bremove\b|\badd\b|\bapply\b|\btag\b|\buntag\b|\benroll\b|\bunroll\b|\brun\b|\bimport\b|\bupload\b|\bverify\b|\bpublish\b|\bunpublish\b|\bconnect\b|\bdisconnect\b|\benable\b|\bdisable\b|\bturn on\b|\bturn off\b|\brename\b|\bmove\b|\breorder\b|\bcopy\b|\bduplicate\b|\barchive\b|\bunarchive\b|\bpause\b|\bstop\b|\bstart\b|\bevery\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bmon\b|\btue\b|\bwed\b|\bthu\b|\bfri\b)/.test(t);
}

export function getPuraIntentSignals(textRaw: string): {
  normalizedText: string;
  explicitDoIt: boolean;
  asksHow: boolean;
  looksImperative: boolean;
} {
  const normalizedText = normalizeUserTextForIntent(textRaw);
  const explicitDoIt = userExplicitlyWantsAgentToDoIt(normalizedText);
  const asksHow = userAsksForHowOrSteps(normalizedText);
  const looksImperative = looksLikeImperativeRequest(normalizedText);
  return { normalizedText, explicitDoIt, asksHow, looksImperative };
}
