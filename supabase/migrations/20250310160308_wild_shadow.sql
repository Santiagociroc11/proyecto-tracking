/*
  # Add max_products column to users table
  
  1. Changes
    - Add max_products column to users table with default value of 1
*/

ALTER TABLE users 
ADD COLUMN max_products integer NOT NULL DEFAULT 1;