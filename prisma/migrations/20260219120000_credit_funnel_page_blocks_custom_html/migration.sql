-- CreateEnum
CREATE TYPE "CreditFunnelPageEditorMode" AS ENUM ('MARKDOWN', 'BLOCKS', 'CUSTOM_HTML');

-- AlterTable
ALTER TABLE "CreditFunnelPage"
ADD COLUMN     "editorMode" "CreditFunnelPageEditorMode" NOT NULL DEFAULT 'MARKDOWN',
ADD COLUMN     "blocksJson" JSONB,
ADD COLUMN     "customHtml" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customChatJson" JSONB;
