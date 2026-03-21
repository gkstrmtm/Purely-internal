-- Add separate knowledge base JSON for outbound messages agent
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "chatKnowledgeBaseJson" JSONB;
