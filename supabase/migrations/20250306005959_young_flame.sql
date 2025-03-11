/*
  # Fix events counter and add notifications

  1. Changes
    - Add last_notification_sent column to users table
    - Create or replace increment_user_events_count function
    - Add notification thresholds for usage limits

  2. Security
    - Maintain existing RLS policies
    - Function is security definer to ensure proper access control
*/

-- Add last_notification_sent column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_notification_sent timestamptz;

-- Create or replace the function to increment events count
CREATE OR REPLACE FUNCTION increment_user_events_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
  v_max_events integer;
  v_last_notification timestamptz;
BEGIN
  -- Get current values
  SELECT 
    events_count, 
    max_monthly_events,
    last_notification_sent
  INTO 
    v_current_count, 
    v_max_events,
    v_last_notification
  FROM users 
  WHERE id = p_user_id;

  -- Increment the counter
  UPDATE users 
  SET events_count = events_count + 1
  WHERE id = p_user_id;

  -- Check if we need to send a notification (80% threshold)
  IF (v_current_count + 1) >= (v_max_events * 0.8) THEN
    -- Only send notification once per day
    IF v_last_notification IS NULL OR v_last_notification < CURRENT_DATE THEN
      UPDATE users 
      SET last_notification_sent = now()
      WHERE id = p_user_id;
    END IF;
  END IF;
END;
$$;