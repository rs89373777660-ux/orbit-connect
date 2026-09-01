CREATE TABLE `message_pins` (
	`message_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`pinned_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_message_pins_chat_created` ON `message_pins` (`chat_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
