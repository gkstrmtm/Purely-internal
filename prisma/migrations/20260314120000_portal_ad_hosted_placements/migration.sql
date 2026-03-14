-- Add hosted ad placements for public hosted pages

ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'HOSTED_BLOG_PAGE';
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'HOSTED_REVIEWS_PAGE';
