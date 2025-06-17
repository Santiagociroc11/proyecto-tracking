-- Add telegram_thread_id column to user_settings table
ALTER TABLE user_settings 
ADD COLUMN telegram_thread_id text DEFAULT NULL;

-- Add comment to explain the new column
COMMENT ON COLUMN user_settings.telegram_thread_id IS 'Thread ID for Telegram group topics/threads. NULL for private chats or general group messages';

-- Add telegram_notification_type to track the type of notification setup
ALTER TABLE user_settings 
ADD COLUMN telegram_notification_type text DEFAULT 'private' CHECK (telegram_notification_type IN ('private', 'group', 'group_topic'));

COMMENT ON COLUMN user_settings.telegram_notification_type IS 'Type of Telegram notification: private (default), group, or group_topic'; 