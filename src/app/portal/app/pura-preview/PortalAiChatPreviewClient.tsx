"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { IconChevron, IconCopy, IconEdit, IconSchedule, IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type PreviewChatMode = "plan" | "work";
type PreviewProfile = "Fast" | "Balanced" | "Deep";

type PreviewThread = {
  id: string;
  title: string;
  when: string;
  chatMode: PreviewChatMode;
  responseProfile: PreviewProfile;
  badge?: { label: string; dotClassName: string; badgeClassName: string; title?: string } | null;
  previewText?: string | null;
};

type PreviewMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const INITIAL_THREADS: PreviewThread[] = [
  {
    id: "t1",
    title: "Access New Funnel Q...",
    when: "Mar 29",
    chatMode: "work",
    responseProfile: "Fast",
    badge: {
      label: "Completed",
      dotClassName: "bg-emerald-500",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      title: "Last run completed",
    },
  },
  {
    id: "t2",
    title: "Add Contact: Tabari 86...",
    when: "Apr 6",
    chatMode: "plan",
    responseProfile: "Balanced",
    previewText: "Blocked on contact matching",
  },
  {
    id: "t3",
    title: "Improve Booking Flow ...",
    when: "Apr 6",
    chatMode: "work",
    responseProfile: "Deep",
    badge: {
      label: "Needs input",
      dotClassName: "bg-amber-500",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      title: "Waiting on your reply",
    },
  },
  {
    id: "t4",
    title: "Mon-Fri 9am SMS Send",
    when: "Apr 6",
    chatMode: "work",
    responseProfile: "Balanced",
    previewText: "Continue with send-time safeguards",
  },
];

const INITIAL_MESSAGES: Record<string, PreviewMessage[]> = {
  t2: [
    {
      id: "m1",
      role: "user",
      text: 'add 8644502445 as a contact and name him "tabari"',
    },
    {
      id: "m2",
      role: "assistant",
      text: 'I created the contact named "tabari" with the phone number 8644502445. You can keep going from here if you want to add email, tags, or a follow-up.',
    },
    {
      id: "m3",
      role: "user",
      text: 'add the email "tabariroper14@icloud.com" as his email',
    },
    {
      id: "m4",
      role: "assistant",
      text: "The update failed because the target contact still needs to be matched more safely, so this preview mirrors the exact shell while staying local-only.",
    },
  ],
};

const PROFILE_OPTIONS: PreviewProfile[] = ["Fast", "Balanced", "Deep"];
const WELCOME_PROMPTS = [
  "Summarize the highest-priority leads I should follow up with today.",
  "Plan three marketing tasks I can finish this week.",
  "Review what Pura can help automate next for this business.",
];

function IconVolumeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M19.7479 4.99993C21.1652 6.97016 22 9.38756 22 11.9999C22 14.6123 21.1652 17.0297 19.7479 18.9999M15.7453 7.99993C16.5362 9.13376 17 10.5127 17 11.9999C17 13.4872 16.5362 14.8661 15.7453 15.9999M9.63432 4.36561L6.46863 7.5313C6.29568 7.70425 6.2092 7.79073 6.10828 7.85257C6.01881 7.9074 5.92127 7.9478 5.81923 7.9723C5.70414 7.99993 5.58185 7.99993 5.33726 7.99993H3.6C3.03995 7.99993 2.75992 7.99993 2.54601 8.10892C2.35785 8.20479 2.20487 8.35777 2.10899 8.54594C2 8.75985 2 9.03987 2 9.59993V14.3999C2 14.96 2 15.24 2.10899 15.4539C2.20487 15.6421 2.35785 15.7951 2.54601 15.8909C2.75992 15.9999 3.03995 15.9999 3.6 15.9999H5.33726C5.58185 15.9999 5.70414 15.9999 5.81923 16.0276C5.92127 16.0521 6.01881 16.0925 6.10828 16.1473C6.2092 16.2091 6.29568 16.2956 6.46863 16.4686L9.63431 19.6342C10.0627 20.0626 10.2769 20.2768 10.4608 20.2913C10.6203 20.3038 10.7763 20.2392 10.8802 20.1175C11 19.9773 11 19.6744 11 19.0686V4.9313C11 4.32548 11 4.02257 10.8802 3.88231C10.7763 3.76061 10.6203 3.69602 10.4608 3.70858C10.2769 3.72305 10.0627 3.93724 9.63432 4.36561Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRedoGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2 10C2 10 2.12132 9.15076 5.63604 5.63604C9.15076 2.12132 14.8492 2.12132 18.364 5.63604C19.6092 6.88131 20.4133 8.40072 20.7762 10M2 10V4M2 10H8M22 14C22 14 21.8787 14.8492 18.364 18.364C14.8492 21.8787 9.15076 21.8787 5.63604 18.364C4.39076 17.1187 3.58669 15.5993 3.22383 14M22 14V20M22 14H16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewMessageBubble({
  message,
  isLastAssistant,
  isLastUser,
  footerLeft,
  footerRight,
}: {
  message: PreviewMessage;
  isLastAssistant: boolean;
  isLastUser: boolean;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}) {
  const isUser = message.role === "user";

  return (
    <div className={classNames("group/message flex", isUser ? "justify-end" : "justify-start")}>
      <div className={classNames("inline-flex max-w-[min(980px,100%)] flex-col", isUser ? "ml-10" : "mr-10")}>
        <div className={classNames(isUser ? "rounded-3xl bg-brand-blue px-4 py-3 text-sm leading-relaxed text-white" : "px-1 py-1 text-sm leading-relaxed text-zinc-900")}>
          <div className="whitespace-pre-wrap">{message.text}</div>
        </div>
        <div className={classNames("mt-1 flex items-center gap-2", isUser ? "justify-end" : "justify-between")}>
          <div className="flex items-center gap-1">{!isUser ? footerLeft : null}</div>
          <div className="flex items-center justify-end gap-1">
            {isLastUser || isLastAssistant ? footerRight : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PortalAiChatPreviewClient({ standalone = false }: { standalone?: boolean }) {
  const [threads, setThreads] = useState<PreviewThread[]>(INITIAL_THREADS);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, PreviewMessage[]>>(INITIAL_MESSAGES);
  const [activeThreadId, setActiveThreadId] = useState<string | null>("t2");
  const [modeControlsOpen, setModeControlsOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<PreviewChatMode>("plan");
  const [draftProfile, setDraftProfile] = useState<PreviewProfile>("Balanced");
  const [input, setInput] = useState("");
  const [runsOpen, setRunsOpen] = useState(false);
  const setSidebarOverride = useSetPortalSidebarOverride();

  const activeThread = useMemo(() => (activeThreadId ? threads.find((thread) => thread.id === activeThreadId) ?? null : null), [activeThreadId, threads]);
  const messages = useMemo(() => (activeThreadId ? messagesByThread[activeThreadId] ?? [] : []), [activeThreadId, messagesByThread]);
  const showWelcomeComposer = !activeThreadId;
  const effectiveChatMode = activeThread?.chatMode ?? draftMode;
  const effectiveResponseProfile = activeThread?.responseProfile ?? draftProfile;
  const effectiveChatModeLabel = effectiveChatMode === "plan" ? "Discuss" : "Work";
  const modeSummaryLabel = `${effectiveChatModeLabel} ${effectiveResponseProfile}`;

  const composerControlButtonClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50";
  const composerTextareaClass =
    "min-h-11 flex-1 resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[rgba(29,78,216,0.25)]";

  const createThread = () => {
    setActiveThreadId(null);
    setInput("");
    setModeControlsOpen(false);
  };

  const selectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setInput("");
  };

  const setChatModeForCurrentThread = (nextMode: PreviewChatMode) => {
    if (activeThreadId) {
      setThreads((prev) => prev.map((thread) => (thread.id === activeThreadId ? { ...thread, chatMode: nextMode } : thread)));
      return;
    }
    setDraftMode(nextMode);
  };

  const setResponseProfileForCurrentThread = (nextProfile: PreviewProfile) => {
    if (activeThreadId) {
      setThreads((prev) => prev.map((thread) => (thread.id === activeThreadId ? { ...thread, responseProfile: nextProfile } : thread)));
      return;
    }
    setDraftProfile(nextProfile);
  };

  const handleCopy = useMemo(
    () => async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore in preview
      }
    },
    [],
  );

  const handleRedo = () => {
    if (!activeThreadId) return;
    setMessagesByThread((prev) => ({
      ...prev,
      [activeThreadId]: [
        ...(prev[activeThreadId] ?? []),
        {
          id: `assistant-redo-${Date.now()}`,
          role: "assistant",
          text: "Here is the regenerated local preview response. The shell stays identical; only the sample content changes.",
        },
      ],
    }));
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMessage: PreviewMessage = { id: `user-${Date.now()}`, role: "user", text };
    const assistantMessage: PreviewMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text:
        effectiveChatMode === "work"
          ? "Preview only: this uses the real production shell styling while keeping all data local and disconnected from the portal."
          : "Preview only: this is the draft-shell state, styled like production but running with local mock data.",
    };

    if (!activeThreadId) {
      const nextId = `preview-${Date.now()}`;
      const title = text.length > 24 ? `${text.slice(0, 24)}...` : text;
      setThreads((prev) => [
        {
          id: nextId,
          title: title || "New chat",
          when: "Now",
          chatMode: draftMode,
          responseProfile: draftProfile,
          previewText: "Local preview thread",
        },
        ...prev,
      ]);
      setMessagesByThread((prev) => ({ ...prev, [nextId]: [userMessage, assistantMessage] }));
      setActiveThreadId(nextId);
      setInput("");
      return;
    }

    setMessagesByThread((prev) => ({
      ...prev,
      [activeThreadId]: [...(prev[activeThreadId] ?? []), userMessage, assistantMessage],
    }));
    setThreads((prev) => prev.map((thread) => (thread.id === activeThreadId ? { ...thread, when: "Now" } : thread)));
    setInput("");
  };

  const left = useMemo(
    () => (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-3 pb-2 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chats</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-transparent text-zinc-700 transition-all duration-150 hover:scale-110 hover:bg-zinc-50"
                aria-label="Scheduled tasks"
                title="Scheduled tasks"
              >
                <IconSchedule size={18} />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue text-white transition-transform duration-150 hover:scale-110 hover:opacity-95"
                onClick={createThread}
                aria-label="New chat"
                title="New chat"
              >
                <span className="text-lg font-semibold leading-none">＋</span>
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
          {!threads.length ? (
            <div className="p-3 text-sm text-zinc-500">No chats yet.</div>
          ) : (
            <div className="space-y-1">
              {threads.map((thread) => {
                const active = thread.id === activeThreadId;
                return (
                  <div key={thread.id} className={classNames("group relative w-full rounded-2xl", active ? "bg-[rgba(29,78,216,0.10)]" : "hover:bg-zinc-50")}>
                    <button type="button" onClick={() => selectThread(thread.id)} className="w-full rounded-2xl px-3 py-2 pr-10 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={classNames("block truncate text-sm font-semibold", active ? "text-zinc-900" : "text-zinc-800")}>{thread.title || "New chat"}</span>
                          {thread.badge ? (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                              <span className={classNames("inline-flex h-2 w-2 rounded-full", thread.badge.dotClassName)} />
                              <span className={classNames("rounded-full border px-2 py-0.5", thread.badge.badgeClassName)} title={thread.badge.title}>{thread.badge.label}</span>
                            </div>
                          ) : null}
                          {!thread.badge && thread.previewText ? <div className="mt-1 truncate text-[11px] text-zinc-500">{thread.previewText}</div> : null}
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-zinc-500">{thread.when}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={classNames(
                        "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-xl text-zinc-500",
                        "opacity-0 transition-all group-hover:opacity-100 hover:scale-110 hover:text-zinc-700",
                        active && "opacity-100",
                      )}
                      aria-label="Chat options"
                      title="Chat options"
                    >
                      <span className="text-lg font-semibold leading-none">⋯</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    ),
    [activeThreadId, threads],
  );

  useEffect(() => {
    if (standalone) return;
    setSidebarOverride({ desktopSidebarContent: left, mobileSidebarContent: left });
    return () => setSidebarOverride(null);
  }, [left, setSidebarOverride, standalone]);

  const composerInner = (
    <div className="flex items-end gap-2">
      <button type="button" className={composerControlButtonClass} aria-label="Add attachment" title="Add attachment">
        <span className="text-lg font-semibold">＋</span>
      </button>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        rows={1}
        placeholder={showWelcomeComposer ? "Tell Pura what you want handled." : "Message"}
        className={composerTextareaClass}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSend();
          }
        }}
      />

      <button
        type="button"
        className={classNames(
          "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95",
          showWelcomeComposer ? "shadow-none" : "",
          !input.trim() ? "opacity-60" : "",
        )}
        onClick={handleSend}
        disabled={!input.trim()}
        aria-label="Send"
        title="Send"
      >
        <span className="group-hover:hidden">
          <IconSend />
        </span>
        <span className="hidden group-hover:inline">
          <IconSendHover />
        </span>
      </button>
    </div>
  );

  const previewMain = (
    <div className="relative flex h-full min-w-0 flex-1 bg-white shadow-[inset_12px_0_16px_-16px_rgba(0,0,0,0.22)]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white">
          <div className="relative z-10 mx-auto w-full max-w-5xl space-y-3 px-3 py-4 sm:px-4 sm:py-6">
            {messages.length ? (
              messages.map((message, index) => {
                const isLastAssistant = message.role === "assistant" && messages.slice(index + 1).every((next) => next.role !== "assistant");
                const isLastUser = message.role === "user" && messages.slice(index + 1).every((next) => next.role !== "user");

                return (
                  <PreviewMessageBubble
                    key={message.id}
                    message={message}
                    isLastAssistant={isLastAssistant}
                    isLastUser={isLastUser}
                    footerLeft={
                      <>
                        <button
                          type="button"
                          className={classNames(
                            "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100",
                            !isLastAssistant && "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100",
                          )}
                          aria-label="Dictate assistant message"
                          title="Dictate"
                        >
                          <IconVolumeGlyph size={16} />
                        </button>
                        <button
                          type="button"
                          className={classNames(
                            "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100",
                            !isLastAssistant && "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100",
                          )}
                          onClick={handleRedo}
                          aria-label="Redo assistant response"
                          title="Redo from here"
                        >
                          <IconRedoGlyph size={16} />
                        </button>
                      </>
                    }
                    footerRight={
                      <>
                        {isLastUser ? (
                          <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent text-zinc-600 opacity-0 transition-all duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100 hover:scale-110 hover:bg-zinc-100"
                            onClick={() => setInput(message.text)}
                            aria-label="Edit last user message"
                            title="Edit"
                          >
                            <IconEdit size={16} />
                          </button>
                        ) : null}
                        {isLastAssistant ? (
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-zinc-600 transition-all duration-150 hover:scale-110 hover:bg-zinc-100"
                            onClick={() => void handleCopy(message.text)}
                            aria-label="Copy message"
                            title="Copy"
                          >
                            <IconCopy size={16} />
                          </button>
                        ) : null}
                      </>
                    }
                  />
                );
              })
            ) : showWelcomeComposer ? (
              <div className="flex min-h-[calc(100dvh-10rem-env(safe-area-inset-top))] items-center justify-center sm:min-h-[60vh]">
                <div className="w-full max-w-2xl -translate-y-8 sm:translate-y-0">
                  <div className="mb-5 px-1 text-center sm:mb-6 sm:px-0">
                    <div className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 sm:text-3xl">Let Pura work for you</div>
                    <div className="mt-2 text-sm leading-relaxed text-zinc-500">Start with a question, a task, or the next workflow you want off your plate.</div>
                  </div>
                  <div className="mb-4 hidden grid-cols-1 gap-3 md:grid md:grid-cols-3">
                    {WELCOME_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="flex min-h-28 items-start rounded-3xl border border-zinc-200 bg-white p-4 text-left text-sm font-semibold text-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-1 hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => setInput(prompt)}
                      >
                        <span className="block leading-relaxed">{prompt}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-[28px] bg-transparent p-0 shadow-none sm:rounded-3xl sm:bg-transparent sm:p-0 sm:shadow-none">{composerInner}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">&nbsp;</div>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.6rem)] z-20 px-3 sm:px-4">
          <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-3">
            <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-2">
              {modeControlsOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
                    <button
                      type="button"
                      className={classNames(
                        "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                        effectiveChatMode === "plan" ? "bg-brand-blue text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900",
                      )}
                      onClick={() => setChatModeForCurrentThread("plan")}
                    >
                      Discuss
                    </button>
                    <button
                      type="button"
                      className={classNames(
                        "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                        effectiveChatMode === "work" ? "bg-brand-blue text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900",
                      )}
                      onClick={() => setChatModeForCurrentThread("work")}
                    >
                      Work
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
                    {PROFILE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={classNames(
                          "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                          effectiveResponseProfile === option ? "bg-brand-blue text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900",
                        )}
                        onClick={() => setResponseProfileForCurrentThread(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="inline-flex items-center gap-1.5 bg-transparent px-0 py-0 text-sm font-semibold text-brand-blue transition-opacity duration-150 hover:opacity-80"
                onClick={() => setModeControlsOpen((prev) => !prev)}
                aria-label={modeControlsOpen ? "Collapse chat modes" : "Expand chat modes"}
                title={modeControlsOpen ? "Collapse chat modes" : "Expand chat modes"}
              >
                <span>{modeSummaryLabel}</span>
                <span className={classNames("inline-flex text-zinc-500 transition-transform duration-200", modeControlsOpen ? "rotate-90" : "-rotate-90")}>
                  <IconChevron />
                </span>
              </button>
            </div>

            <div className="pointer-events-auto ml-auto flex items-center gap-2">
              {activeThreadId ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:bg-zinc-50"
                  onClick={() => setRunsOpen(true)}
                >
                  Runs
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {!showWelcomeComposer ? (
          <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
            <div className="mx-auto w-full max-w-5xl">{composerInner}</div>
          </div>
        ) : null}
      </div>

      {runsOpen ? (
        <div className="fixed inset-0 z-12060 flex items-end justify-center bg-black/30 p-4 sm:items-center" onMouseDown={() => setRunsOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Runs"
          >
            <div className="text-base font-semibold text-zinc-900">Runs</div>
            <div className="mt-1 text-sm text-zinc-600">Local-only preview of the production runs sheet.</div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                <div className="text-sm font-semibold text-zinc-900">Matched contact safely</div>
                <div className="mt-1 text-xs text-zinc-500">Completed · Apr 6 at 10:42 AM</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                <div className="text-sm font-semibold text-zinc-900">Resolve duplicate contact</div>
                <div className="mt-1 text-xs text-zinc-500">Needs input · Apr 6 at 10:44 AM</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setRunsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (standalone) {
    return (
      <div data-pura-preview-root className="flex h-dvh overflow-hidden bg-[#f5f7fb] text-zinc-900">
        <aside className="hidden w-[18rem] shrink-0 border-r border-zinc-200 bg-white shadow-[2px_0_12px_rgba(0,0,0,0.06)] lg:flex lg:flex-col">
          <div className="shrink-0 border-b border-zinc-200 p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 px-2">
                <div className="truncate text-[22px] font-semibold tracking-tight text-brand-ink">Pura</div>
              </div>
              <button
                type="button"
                className="group inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:text-zinc-900"
                aria-label="Collapse sidebar"
                title="Collapse"
              >
                <span className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden" aria-hidden>
                  <span className="absolute inset-0 flex items-center justify-center translate-x-0 rotate-180 opacity-100">
                    <IconChevron />
                  </span>
                </span>
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{left}</div>
          <div className="shrink-0 border-t border-zinc-200 px-4 py-4 text-sm text-zinc-500">Signed in as demo-full@purelyautomation.dev</div>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{previewMain}</main>
      </div>
    );
  }

  return <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-white">{previewMain}</div>;
}
