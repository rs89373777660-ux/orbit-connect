CREATE TABLE `app_sessions` (`token_hash` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `created_at` integer NOT NULL, `last_seen_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_app_sessions_user` ON `app_sessions` (`user_id`);
--> statement-breakpoint
PRAGMA optimize;
