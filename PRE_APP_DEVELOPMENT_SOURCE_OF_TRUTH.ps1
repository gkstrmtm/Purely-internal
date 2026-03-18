# PRE-APP DEVELOPMENT SOURCE OF TRUTH
#
# This file exists to prevent accidental changes to the existing web app deployment
# while we build a separate mobile app.
#
# NON-NEGOTIABLE:
# - The URL below is the "source of truth" for the current Portal deployment BEFORE app work.
# - Do NOT change the existing Vercel project settings that produce this deployment.
# - The mobile app must deploy as a separate Vercel project with Root Directory = "mobile-app".
#
# If anything about the Portal changes unexpectedly, compare against this deployment first.

$PURELY_PORTAL_SOURCE_OF_TRUTH_URL = "https://purely-internal-i5d62brbc-tabari-ropers-projects-6f2e090b.vercel.app"

Write-Host "Portal source-of-truth deployment:" -ForegroundColor Cyan
Write-Host $PURELY_PORTAL_SOURCE_OF_TRUTH_URL
