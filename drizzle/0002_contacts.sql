ALTER TABLE `users` ADD `phone_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `phone_last4` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `status` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_data` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_phone_hash` ON `users` (`phone_hash`);
--> statement-breakpoint
CREATE TABLE `contacts` (`owner_id` text NOT NULL, `contact_user_id` text NOT NULL, `alias` text, `created_at` integer NOT NULL, PRIMARY KEY (`owner_id`,`contact_user_id`));
--> statement-breakpoint
CREATE INDEX `idx_contacts_target` ON `contacts` (`contact_user_id`);
--> statement-breakpoint
CREATE TABLE `notifications` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `actor_id` text, `kind` text NOT NULL, `body` text NOT NULL, `read_at` integer, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
