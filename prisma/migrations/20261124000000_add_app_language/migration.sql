CREATE TYPE "AppLanguage" AS ENUM ('ENGLISH', 'SPANISH');

ALTER TABLE "UserPreference"
ADD COLUMN "appLanguage" "AppLanguage" NOT NULL DEFAULT 'ENGLISH';
