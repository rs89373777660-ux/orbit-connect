ALTER TABLE `users` ADD `avatar_preset` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `auto_correct_enabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `messages` ADD `forwarded_from_id` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD `edited_at` integer;
--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE TABLE `message_receipts` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delivered_at` integer,
	`read_at` integer,
	PRIMARY KEY(`message_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_message_receipts_user` ON `message_receipts` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE TABLE `message_hidden` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`hidden_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_message_hidden_user` ON `message_hidden` (`user_id`);
--> statement-breakpoint
PRAGMA optimize;
