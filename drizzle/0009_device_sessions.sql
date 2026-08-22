ALTER TABLE `app_sessions` ADD `device_id` text;
--> statement-breakpoint
ALTER TABLE `app_sessions` ADD `device_name` text;
--> statement-breakpoint
ALTER TABLE `app_sessions` ADD `platform` text;
--> statement-breakpoint
ALTER TABLE `app_sessions` ADD `browser` text;
--> statement-breakpoint
CREATE TABLE `device_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`user_id` text,
	`device_name` text NOT NULL,
	`platform` text NOT NULL,
	`browser` text,
	`session_token` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_device_pairings_expiry` ON `device_pairings` (`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
