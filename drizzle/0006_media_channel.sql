ALTER TABLE `users` ADD `avatar_asset_id` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD `file_mime` text;
--> statement-breakpoint
CREATE TABLE `user_avatars` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_key` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_avatars_user_created` ON `user_avatars` (`user_id`,`created_at`);
