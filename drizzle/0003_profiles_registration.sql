ALTER TABLE `users` ADD `public_id` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `handle` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `birth_year` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `socials_json` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `registration_completed` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `sync_contacts_enabled` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_phone` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_email` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_status` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_socials` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_photo` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_public_id` ON `users` (`public_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_handle` ON `users` (`handle`);
--> statement-breakpoint
CREATE INDEX `idx_users_name` ON `users` (`name`);
--> statement-breakpoint
CREATE TABLE `phone_verifications` (
 `user_id` text PRIMARY KEY NOT NULL,
 `phone` text NOT NULL,
 `phone_hash` text NOT NULL,
 `code_hash` text NOT NULL,
 `expires_at` integer NOT NULL,
 `attempts` integer NOT NULL DEFAULT 0,
 `created_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
