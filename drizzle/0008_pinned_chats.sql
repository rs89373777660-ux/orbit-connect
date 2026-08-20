ALTER TABLE `chat_members` ADD `pinned_at` integer;
--> statement-breakpoint
PRAGMA optimize;
