ALTER TABLE "SupportTicket"
ADD COLUMN "sourceEventKey" TEXT;

CREATE UNIQUE INDEX "SupportTicket_sourceEventKey_key"
ON "SupportTicket"("sourceEventKey");
