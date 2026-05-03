"use client";

import { type ReactNode } from "react";

import { AppModal } from "@/components/AppModal";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { PortalTypeaheadInput } from "@/components/PortalTypeaheadInput";

type BookingCalendarEditorCalendar = {
  id: string;
  title: string;
  durationMinutes?: number | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  notificationEmails?: string[] | null;
};

type BookingCalendarEditorPatch = {
  title?: string;
  durationMinutes?: number;
  meetingLocation?: string;
  meetingDetails?: string;
  notificationEmails?: string[];
};

export function PortalBookingCalendarEditorModal({
  open,
  onClose,
  title,
  description,
  widthClassName = "max-w-3xl",
  backdropClassName,
  embedded = false,
  busy = false,
  calendar,
  emptyStateText = "Choose a calendar to edit.",
  introNotice,
  meetingLocationField,
  extraFields,
  titleLabel = "Title",
  titlePlaceholder = "e.g. Strategy call",
  titleCommitLimit = 80,
  durationLabel = "Duration",
  durationOptions = [15, 20, 30, 45, 60, 90],
  meetingLocationLabel = "Meeting location",
  meetingLocationHelpText,
  meetingLocationPlaceholder = "Phone call, Zoom link, in-person address...",
  meetingLocationCommitLimit = 120,
  meetingDetailsLabel = "Meeting details",
  meetingDetailsHelpText,
  meetingDetailsPlaceholder = "Anything they should know before the call.",
  meetingDetailsCommitLimit = 600,
  notificationEmailsLabel = "Notification emails",
  notificationEmailsHelpText,
  notificationEmailsEmptyText = "Add one or more emails to notify when someone books.",
  notificationEmailSuggestions = [],
  firstNotificationEmailPlaceholder = "you@company.com",
  additionalNotificationEmailPlaceholder = "another@company.com",
  addEmailLabel = "+ Add email",
  removeEmailLabel = "Remove",
  doneLabel = "Done",
  draftTitle,
  onDraftTitleChange,
  draftDurationMinutes,
  onDraftDurationMinutesChange,
  draftMeetingLocation,
  onDraftMeetingLocationChange,
  draftMeetingDetails,
  onDraftMeetingDetailsChange,
  draftNotificationEmails,
  onDraftNotificationEmailsChange,
  normalizeNotificationEmails,
  onSavePatch,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  widthClassName?: string;
  backdropClassName?: string;
  embedded?: boolean;
  busy?: boolean;
  calendar: BookingCalendarEditorCalendar | null;
  emptyStateText?: string;
  introNotice?: ReactNode;
  meetingLocationField?: ReactNode;
  extraFields?: ReactNode;
  titleLabel?: string;
  titlePlaceholder?: string;
  titleCommitLimit?: number;
  durationLabel?: string;
  durationOptions?: number[];
  meetingLocationLabel?: string;
  meetingLocationHelpText?: ReactNode;
  meetingLocationPlaceholder?: string;
  meetingLocationCommitLimit?: number;
  meetingDetailsLabel?: string;
  meetingDetailsHelpText?: ReactNode;
  meetingDetailsPlaceholder?: string;
  meetingDetailsCommitLimit?: number;
  notificationEmailsLabel?: string;
  notificationEmailsHelpText?: ReactNode;
  notificationEmailsEmptyText?: string;
  notificationEmailSuggestions?: string[];
  firstNotificationEmailPlaceholder?: string;
  additionalNotificationEmailPlaceholder?: string;
  addEmailLabel?: string;
  removeEmailLabel?: string;
  doneLabel?: string;
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  draftDurationMinutes: number;
  onDraftDurationMinutesChange: (value: number) => void;
  draftMeetingLocation: string;
  onDraftMeetingLocationChange: (value: string) => void;
  draftMeetingDetails: string;
  onDraftMeetingDetailsChange: (value: string) => void;
  draftNotificationEmails: string[];
  onDraftNotificationEmailsChange: (value: string[]) => void;
  normalizeNotificationEmails: (items: string[]) => string[];
  onSavePatch: (patch: BookingCalendarEditorPatch) => void | Promise<void>;
}) {
  const commitNotificationEmails = (items: string[]) => {
    const normalized = normalizeNotificationEmails(items);
    onDraftNotificationEmailsChange(normalized);
    void onSavePatch({ notificationEmails: normalized.length ? normalized : undefined });
  };

  const content = !calendar ? (
    <div className="text-sm text-zinc-600">{emptyStateText}</div>
  ) : (
    <div className="space-y-4">
      {introNotice ? introNotice : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
          <div className="font-medium text-zinc-800">{titleLabel}</div>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            value={draftTitle}
            onChange={(event) => onDraftTitleChange(event.target.value)}
            onBlur={() => {
              const nextTitle = draftTitle.trim().slice(0, titleCommitLimit);
              if (!nextTitle) {
                onDraftTitleChange(calendar.title ?? "");
                return;
              }
              void onSavePatch({ title: nextTitle });
            }}
            placeholder={titlePlaceholder}
            disabled={busy}
          />
        </label>

        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
          <div className="font-medium text-zinc-800">{durationLabel}</div>
          <PortalSelectDropdown
            value={draftDurationMinutes}
            onChange={(value) => {
              onDraftDurationMinutesChange(value);
              void onSavePatch({ durationMinutes: value });
            }}
            options={durationOptions.map((minutes) => ({ value: minutes, label: `${minutes} minutes` }))}
            className="mt-2 w-full"
            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
          />
        </label>

        {meetingLocationField ? (
          meetingLocationField
        ) : (
          <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
            <div className="font-medium text-zinc-800">{meetingLocationLabel}</div>
            {meetingLocationHelpText ? <div className="mt-1 text-xs leading-5 text-zinc-600">{meetingLocationHelpText}</div> : null}
            <textarea
              className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder={meetingLocationPlaceholder}
              value={draftMeetingLocation}
              onChange={(event) => onDraftMeetingLocationChange(event.target.value)}
              onBlur={() => {
                const next = draftMeetingLocation.trim().slice(0, meetingLocationCommitLimit);
                void onSavePatch({ meetingLocation: next || undefined });
              }}
              disabled={busy}
            />
          </label>
        )}

        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
          <div className="font-medium text-zinc-800">{meetingDetailsLabel}</div>
          {meetingDetailsHelpText ? <div className="mt-1 text-xs leading-5 text-zinc-600">{meetingDetailsHelpText}</div> : null}
          <textarea
            className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder={meetingDetailsPlaceholder}
            value={draftMeetingDetails}
            onChange={(event) => onDraftMeetingDetailsChange(event.target.value)}
            onBlur={() => {
              const next = draftMeetingDetails.trim().slice(0, meetingDetailsCommitLimit);
              void onSavePatch({ meetingDetails: next || undefined });
            }}
            disabled={busy}
          />
        </label>

        {extraFields ? extraFields : null}

        <label className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
          <div className="font-medium text-zinc-800">{notificationEmailsLabel}</div>
          {notificationEmailsHelpText ? <div className="mt-1 text-xs leading-5 text-zinc-600">{notificationEmailsHelpText}</div> : null}
          <div className="mt-2 space-y-2">
            {draftNotificationEmails.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                {notificationEmailsEmptyText}
              </div>
            ) : null}

            {draftNotificationEmails.map((email, index) => (
              <div key={`${calendar.id}-email-${index}`} className="flex items-center gap-2">
                {notificationEmailSuggestions.length ? (
                  <PortalTypeaheadInput
                    value={email}
                    suggestions={notificationEmailSuggestions}
                    disabled={busy}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder={index === 0 ? firstNotificationEmailPlaceholder : additionalNotificationEmailPlaceholder}
                    onChange={(nextEmail) => {
                      const next = [...draftNotificationEmails];
                      next[index] = nextEmail;
                      onDraftNotificationEmailsChange(next);
                    }}
                    onBlur={() => {
                      commitNotificationEmails(draftNotificationEmails);
                    }}
                  />
                ) : (
                  <input
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder={index === 0 ? firstNotificationEmailPlaceholder : additionalNotificationEmailPlaceholder}
                    value={email}
                    onChange={(event) => {
                      const next = [...draftNotificationEmails];
                      next[index] = event.target.value;
                      onDraftNotificationEmailsChange(next);
                    }}
                    onBlur={() => {
                      commitNotificationEmails(draftNotificationEmails);
                    }}
                    disabled={busy}
                  />
                )}
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    const next = draftNotificationEmails.filter((_, itemIndex) => itemIndex !== index);
                    onDraftNotificationEmailsChange(next);
                    commitNotificationEmails(next);
                  }}
                  disabled={busy}
                >
                  {removeEmailLabel}
                </button>
              </div>
            ))}

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              onClick={() => onDraftNotificationEmailsChange([...draftNotificationEmails, ""])}
              disabled={busy}
            >
              {addEmailLabel}
            </button>
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          onClick={onClose}
          disabled={busy}
        >
          {doneLabel}
        </button>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      widthClassName={widthClassName}
      backdropClassName={backdropClassName}
    >
      {content}
    </AppModal>
  );
}