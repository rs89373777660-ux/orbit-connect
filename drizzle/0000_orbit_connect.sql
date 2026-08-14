CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL, `name` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `chats` (`id` text PRIMARY KEY NOT NULL, `title` text NOT NULL, `kind` text NOT NULL, `created_by` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `chat_members` (`chat_id` text NOT NULL, `user_id` text NOT NULL, `role` text NOT NULL, `joined_at` integer NOT NULL, PRIMARY KEY(`chat_id`,`user_id`));
--> statement-breakpoint
CREATE INDEX `idx_chat_members_user` ON `chat_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `messages` (`id` text PRIMARY KEY NOT NULL, `chat_id` text NOT NULL, `sender_id` text NOT NULL, `body` text, `kind` text NOT NULL, `file_key` text, `file_name` text, `file_size` integer, `reply_to` text, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_messages_chat_created` ON `messages` (`chat_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `reactions` (`message_id` text NOT NULL, `user_id` text NOT NULL, `emoji` text NOT NULL, `created_at` integer NOT NULL, PRIMARY KEY(`message_id`,`user_id`,`emoji`));
--> statement-breakpoint
CREATE INDEX `idx_reactions_message` ON `reactions` (`message_id`);
--> statement-breakpoint
CREATE TABLE `call_signals` (`id` text PRIMARY KEY NOT NULL, `chat_id` text NOT NULL, `sender_id` text NOT NULL, `recipient_id` text, `type` text NOT NULL, `payload` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_call_signals_chat_created` ON `call_signals` (`chat_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
