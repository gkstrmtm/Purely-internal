# Pura non-funnel perfection tracker

Last updated: 2026-05-06

This file is the working source of truth for closing the remaining non-funnel Pura rough edges and making hosted pages outside Funnel Builder launch-ready for crawling, indexing, and business-directed conversion.

Rule for this file: only mark a checkbox complete after the fix is implemented and verified.

## Discovery loops

- [x] Re-run `node tmp/run_pura_non_funnel_organic_sweep.mjs` after each meaningful reply-quality or routing fix and inspect every scenario for awkward copy, broken links, weak follow-up suggestions, and domain drift.
- [x] Re-run `npm run pura:production-smoke` after parser/planner/reply-path changes.
- [x] Re-audit hosted public surfaces directly:
  - blogs index
  - blog post
  - reviews page
  - newsletters index
  - newsletter detail
  - booking page
- [x] Verify published hosted surfaces emit route-aware metadata, canonicals, and sitemap coverage.
- [x] Verify generated hosted/blog/newsletter/reviews content defaults to moving readers toward the business, offer, booking, review, or subscription goal rather than generic editorial drift.
- [ ] Keep adding newly discovered defects below before fixing them; only check them off after verification.

## Remaining Pura rough edges

- [x] Fix booking live-link reply so the response cleanly surfaces the live booking URL instead of leaving the fragment `and the live booking link here.` or vague unlinked `here` wording.
- [x] Fix newsletter hosted-page rewrite reply so it stops ending with `to see the complete HTML code or any specific section, just let me know!`.
- [x] Fix duplicate task-summary labels so `tasks.list` does not repeat the same title twice in notable examples.
- [x] Verify AI receptionist greeting/readback preserves terminal sentence punctuation in live replies.
- [x] Fix booking live-link source-of-truth drift so Pura and the portal booking-site endpoint return the real `PortalBookingSite.slug` link instead of a hosted-site slug like `/book/purely`, then verify the returned live link resolves publicly.
- [x] Verify booking slots, reminders, AI receptionist, tasks, and booking availability stay strong under repeated organic sweeps without regressing into generic filler.

## Hosted-page SEO gaps

- [x] Audit public metadata for blogs, blog posts, reviews, newsletters, and booking so each route sets route-specific title, description, canonical, Open Graph, and Twitter metadata rather than shallow title-only metadata.
- [x] Add public sitemap coverage for non-funnel hosted surfaces, especially published blog indexes and blog posts, so Google can discover them immediately after release.
- [x] Verify `robots.txt` points crawlers at all relevant sitemap endpoints for hosted/public content.
- [x] Ensure blog post metadata uses the actual post content/cover/SEO fields where available.
- [x] Ensure blog index and blog post routes expose stable canonical URLs on both platform-hosted and custom-domain paths.
- [x] Ensure reviews and newsletters routes expose stable canonical URLs and richer metadata instead of minimal title-only metadata.
- [x] Verify no public hosted route accidentally emits `noindex` unless intentionally unpublished or invalid.

## Content-generation SEO and conversion bias

- [x] Audit blog generation prompts so blog drafts are explicitly SEO-oriented, topic-tight, and biased toward the owner business’s offer, niche, and conversion path by default.
- [x] Audit hosted page generation prompts for blogs, reviews, and newsletters so the copy naturally funnels readers toward the business by default.
- [x] Ensure blog home and blog post templates are SEO-ready by default:
  - clear topical headline hierarchy
  - descriptive metadata inputs
  - crawlable internal links
  - business-directed CTAs
- [x] Ensure reviews pages bias toward trust and action for the business, not generic testimonial filler.
- [x] Ensure newsletter pages bias toward subscription and business affinity, not generic editorial copy.

## Verification checkpoints

- [x] `npm run pura:production-smoke`
- [x] `node tmp/run_pura_non_funnel_organic_sweep.mjs`
- [x] Targeted metadata/HTML inspection for blogs, blog posts, reviews, newsletters, and booking pages
- [x] Confirm sitemap output includes public hosted/blog/newsletter/review URLs
- [x] Confirm this file has every item checked only after verification
