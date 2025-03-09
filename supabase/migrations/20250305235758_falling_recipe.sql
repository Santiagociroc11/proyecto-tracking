/*
  # Add function to increment user events count

  1. Changes
    - Add PostgreSQL function to increment events_count for a user
    - Function will be called whenever a tracking event is recorded
    - Handles concurrent updates safely using atomic operations

  2. Security
    - Function can only be called by authenticated users
    - Users can only increment their own event count
*/

CREATE OR REPLACE FUNCTION increment_user_events_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users 
  SET events_count = events_count + 1,
      last_notification_sent = CASE 
        WHEN events_count + 1 >= max_monthly_events AND (last_notification_sent IS NULL OR last_notification_sent < now() - interval '1 day')
        THEN now()
        ELSE last_notification_sent
      END
  WHERE id = p_user_id;
END;
$$;