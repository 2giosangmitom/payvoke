-- A revision has its own delivery deadline, set when the buyer asks for it.
-- Older revisions keep NULL and are judged against the quote's deadline.
ALTER TABLE "invocation_revisions" ADD COLUMN "dueAt" TIMESTAMP(3);
