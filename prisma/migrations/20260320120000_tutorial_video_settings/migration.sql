-- CreateTable
CREATE TABLE "TutorialVideoSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "videosJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorialVideoSettings_pkey" PRIMARY KEY ("id")
);
