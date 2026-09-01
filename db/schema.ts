import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users=sqliteTable("users",{
 id:text("id").primaryKey(),
 email:text("email").notNull(),
 name:text("name").notNull(),
 publicId:text("public_id"),
 handle:text("handle"),
 phone:text("phone"),
 phoneHash:text("phone_hash"),
 phoneLast4:text("phone_last4"),
 phoneVerifiedAt:integer("phone_verified_at"),
 passwordHash:text("password_hash"),
 birthYear:integer("birth_year"),
 socialsJson:text("socials_json"),
 status:text("status"),
 avatarData:text("avatar_data"),
 avatarAssetId:text("avatar_asset_id"),
 avatarPreset:text("avatar_preset"),
 autoCorrectEnabled:integer("auto_correct_enabled",{mode:"boolean"}).notNull().default(false),
 registrationCompleted:integer("registration_completed",{mode:"boolean"}).notNull().default(false),
 syncContactsEnabled:integer("sync_contacts_enabled",{mode:"boolean"}).notNull().default(true),
 privacyPhone:integer("privacy_phone",{mode:"boolean"}).notNull().default(false),
 privacyEmail:integer("privacy_email",{mode:"boolean"}).notNull().default(false),
 privacyStatus:integer("privacy_status",{mode:"boolean"}).notNull().default(true),
 privacySocials:integer("privacy_socials",{mode:"boolean"}).notNull().default(true),
 privacyPhoto:integer("privacy_photo",{mode:"boolean"}).notNull().default(true),
 createdAt:integer("created_at").notNull()
},t=>[
 uniqueIndex("idx_users_phone_hash").on(t.phoneHash),
 uniqueIndex("idx_users_public_id").on(t.publicId),
 uniqueIndex("idx_users_handle").on(t.handle),
 index("idx_users_name").on(t.name)
]);
export const phoneVerifications=sqliteTable("phone_verifications",{userId:text("user_id").primaryKey(),phone:text("phone").notNull(),phoneHash:text("phone_hash").notNull(),codeHash:text("code_hash").notNull(),expiresAt:integer("expires_at").notNull(),attempts:integer("attempts").notNull().default(0),createdAt:integer("created_at").notNull()});
export const appSessions=sqliteTable("app_sessions",{tokenHash:text("token_hash").primaryKey(),userId:text("user_id").notNull(),deviceId:text("device_id"),deviceName:text("device_name"),platform:text("platform"),browser:text("browser"),createdAt:integer("created_at").notNull(),lastSeenAt:integer("last_seen_at").notNull()},t=>[index("idx_app_sessions_user").on(t.userId)]);
export const devicePairings=sqliteTable("device_pairings",{id:text("id").primaryKey(),secretHash:text("secret_hash").notNull(),userId:text("user_id"),deviceName:text("device_name").notNull(),platform:text("platform").notNull(),browser:text("browser"),sessionToken:text("session_token"),status:text("status",{enum:["pending","approved"]}).notNull(),createdAt:integer("created_at").notNull(),expiresAt:integer("expires_at").notNull()},t=>[index("idx_device_pairings_expiry").on(t.expiresAt)]);
export const contacts=sqliteTable("contacts",{ownerId:text("owner_id").notNull(),contactUserId:text("contact_user_id").notNull(),alias:text("alias"),createdAt:integer("created_at").notNull()},t=>[primaryKey({columns:[t.ownerId,t.contactUserId]}),index("idx_contacts_target").on(t.contactUserId)]);
export const notifications=sqliteTable("notifications",{id:text("id").primaryKey(),userId:text("user_id").notNull(),actorId:text("actor_id"),entityId:text("entity_id"),kind:text("kind").notNull(),body:text("body").notNull(),readAt:integer("read_at"),createdAt:integer("created_at").notNull()},t=>[index("idx_notifications_user_created").on(t.userId,t.createdAt)]);
export const chats=sqliteTable("chats",{id:text("id").primaryKey(),title:text("title").notNull(),kind:text("kind",{enum:["direct","group","channel"]}).notNull(),createdBy:text("created_by").notNull(),createdAt:integer("created_at").notNull()});
export const chatMembers=sqliteTable("chat_members",{chatId:text("chat_id").notNull(),userId:text("user_id").notNull(),role:text("role",{enum:["owner","admin","member"]}).notNull(),pinnedAt:integer("pinned_at"),joinedAt:integer("joined_at").notNull()},t=>[primaryKey({columns:[t.chatId,t.userId]}),index("idx_chat_members_user").on(t.userId)]);
export const messages=sqliteTable("messages",{id:text("id").primaryKey(),chatId:text("chat_id").notNull(),senderId:text("sender_id").notNull(),body:text("body"),kind:text("kind",{enum:["text","file","photo","album","sticker","voice","system","location","poll","checklist","contact"]}).notNull(),fileKey:text("file_key"),fileName:text("file_name"),fileSize:integer("file_size"),fileMime:text("file_mime"),replyTo:text("reply_to"),forwardedFromId:text("forwarded_from_id"),editedAt:integer("edited_at"),deletedAt:integer("deleted_at"),createdAt:integer("created_at").notNull()},t=>[index("idx_messages_chat_created").on(t.chatId,t.createdAt)]);
export const messageAttachments=sqliteTable("message_attachments",{id:text("id").primaryKey(),messageId:text("message_id").notNull(),fileKey:text("file_key").notNull(),fileName:text("file_name").notNull(),fileSize:integer("file_size").notNull(),fileMime:text("file_mime").notNull(),position:integer("position").notNull(),createdAt:integer("created_at").notNull()},t=>[index("idx_message_attachments_message_position").on(t.messageId,t.position)]);
export const userAvatars=sqliteTable("user_avatars",{id:text("id").primaryKey(),userId:text("user_id").notNull(),fileKey:text("file_key").notNull(),label:text("label"),createdAt:integer("created_at").notNull()},t=>[index("idx_user_avatars_user_created").on(t.userId,t.createdAt)]);
export const messageReceipts=sqliteTable("message_receipts",{messageId:text("message_id").notNull(),userId:text("user_id").notNull(),deliveredAt:integer("delivered_at"),readAt:integer("read_at")},t=>[primaryKey({columns:[t.messageId,t.userId]}),index("idx_message_receipts_user").on(t.userId,t.readAt)]);
export const messageHidden=sqliteTable("message_hidden",{messageId:text("message_id").notNull(),userId:text("user_id").notNull(),hiddenAt:integer("hidden_at").notNull()},t=>[primaryKey({columns:[t.messageId,t.userId]}),index("idx_message_hidden_user").on(t.userId)]);
export const messagePins=sqliteTable("message_pins",{messageId:text("message_id").primaryKey(),chatId:text("chat_id").notNull(),pinnedBy:text("pinned_by").notNull(),createdAt:integer("created_at").notNull()},t=>[index("idx_message_pins_chat_created").on(t.chatId,t.createdAt)]);
export const reactions=sqliteTable("reactions",{messageId:text("message_id").notNull(),userId:text("user_id").notNull(),emoji:text("emoji").notNull(),createdAt:integer("created_at").notNull()},t=>[primaryKey({columns:[t.messageId,t.userId,t.emoji]}),index("idx_reactions_message").on(t.messageId)]);
export const callSignals=sqliteTable("call_signals",{id:text("id").primaryKey(),chatId:text("chat_id").notNull(),senderId:text("sender_id").notNull(),recipientId:text("recipient_id"),type:text("type").notNull(),payload:text("payload").notNull(),createdAt:integer("created_at").notNull()},t=>[index("idx_call_signals_chat_created").on(t.chatId,t.createdAt)]);
