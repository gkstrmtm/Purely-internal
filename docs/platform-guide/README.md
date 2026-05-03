# Platform Guide

This guide is the starting point for documenting how the platform is supposed to work from an operator point of view.

The immediate goal is precision:

- explain what each surface is for
- explain what settings actually do
- separate setup from reporting
- give internal users a reference before they need live support

## What This Guide Should Cover

This guide is meant to grow into the reference map for the full platform.

Current documentation priorities:

1. Funnel Builder
2. Booking setup and calendar routing
3. Search and page visibility
4. Tracking and Meta pixel setup
5. AI direction, discuss, and work flows
6. Dashboard/reporting surfaces outside the builder

## Product Principles

These rules should stay consistent as the UI changes:

1. The builder is for setup, editing, and publishing.
2. Reporting should live in dedicated dashboard surfaces, not inside editing rails.
3. Page and Source are two views over the same draft, not separate systems.
4. Booking setup should open dedicated setup UI instead of trying to fit every routing workflow into a cramped sidebar.
5. Tracking language should describe where events go in product terms, not internal override jargon.

## Funnel Builder

Primary route:

- `/portal/app/services/funnel-builder`

Editor route pattern:

- `/portal/app/services/funnel-builder/funnels/[funnelId]/edit`

### Editor Surfaces

- `Page`: shows the current draft as the visitor would see it.
- `Source`: shows the same draft as editable code.
- `Chat`: gives AI discuss/work assistance for the current page.
- `Sidebar`: holds setup and structure controls.

### Sidebar Model

The sidebar should be treated as the setup rail.

Current setup groups:

1. Page direction
2. Booking
3. Search
4. Tracking
5. Canvas defaults

The sidebar should stay compact, collapsible, and summary-first.

### Tracking Language

Use these terms in product copy:

- `Account default`: the default Meta pixel saved in Funnel Builder settings.
- `This funnel`: a pixel applied to every page in the current funnel unless a page replaces it.
- `This page`: a page-specific pixel used only for one page.
- `Currently using`: the pixel the current page will actually send Meta events to.

Avoid internal wording like `override` unless it is truly needed for implementation notes.

## Booking Setup

Booking needs two levels of communication:

1. Builder sidebar summary
2. Dedicated booking setup flow for route choice, calendar creation, and block-vs-funnel assignment

The sidebar should answer:

- does this funnel have a calendar?
- does this page have a booking placeholder?
- is the selected booking block using the funnel calendar, its own calendar, or nothing yet?

## Search Setup

Search settings inside the builder should stay focused on:

- favicon / tab icon
- search visibility
- page-level metadata inputs that affect what is published

Search reporting or crawl diagnostics should not be forced into the editor rail.

## Reporting Split

The builder should not become the analytics dashboard.

Builder-side tracking UI should stay limited to:

- configuration
- effective destination
- lightweight runtime status

Detailed reporting should live in external dashboard surfaces.

## Documentation Backlog

Planned reference docs to add next:

1. Funnel Builder operator walkthrough
2. Booking routing glossary
3. Tracking setup walkthrough with examples
4. Publish workflow and draft/live behavior
5. Dashboard/reporting surface map

## Working Agreement

When updating the platform, update this guide whenever one of these changes:

1. a user-facing term changes
2. a settings responsibility moves between surfaces
3. a new setup flow is introduced
4. a reporting surface is split from an editing surface