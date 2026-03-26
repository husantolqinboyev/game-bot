-- =====================================================
-- GURUH OYINI BOT - Supabase Database Schema
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT PRIMARY KEY,  -- Telegram user ID
  username    TEXT,
  first_name  TEXT,
  last_name   TEXT,
  is_admin    BOOLEAN DEFAULT FALSE,
  is_banned   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GROUPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS groups (
  id           BIGINT PRIMARY KEY,  -- Telegram group ID
  title        TEXT NOT NULL,
  username     TEXT,
  invite_link  TEXT,
  member_count INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GAMES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS games (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id          BIGINT REFERENCES groups(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  conditions        TEXT,
  people_per_number INT DEFAULT 5,
  start_date        TIMESTAMPTZ DEFAULT NOW(),
  end_date          TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT TRUE,
  created_by        BIGINT REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GAME MODERATORS
-- =====================================================
CREATE TABLE IF NOT EXISTS game_moderators (
  game_id  UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id  BIGINT REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id)
);

-- =====================================================
-- GAME PARTICIPANTS
-- =====================================================
CREATE TABLE IF NOT EXISTS game_participants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id          UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id          BIGINT REFERENCES users(id) ON DELETE CASCADE,
  invited_by       BIGINT REFERENCES users(id),
  invite_count     INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT TRUE,
  disqualified     BOOLEAN DEFAULT FALSE,
  joined_at        TIMESTAMPTZ DEFAULT NOW(),
  left_at          TIMESTAMPTZ,
  unique_invite_link TEXT,
  UNIQUE(game_id, user_id)
);


-- =====================================================
-- GAME NUMBERS (Assigned unique numbers)
-- =====================================================
CREATE TABLE IF NOT EXISTS game_numbers (
  id           SERIAL PRIMARY KEY,
  game_id      UUID REFERENCES games(id) ON DELETE CASCADE,
  number       INT NOT NULL,
  assigned_to  BIGINT REFERENCES users(id),
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, number)
);

-- =====================================================
-- GROUP MEMBER LOG (Anti-cheat: join/leave tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS member_logs (
  id         SERIAL PRIMARY KEY,
  group_id   BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  game_id    UUID REFERENCES games(id),
  action     TEXT NOT NULL CHECK (action IN ('join', 'leave')),
  logged_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- BROADCASTS
-- =====================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id     BIGINT REFERENCES users(id),
  message_text  TEXT,
  media_type    TEXT CHECK (media_type IN ('photo', 'document', 'video', NULL)),
  media_file_id TEXT,
  caption       TEXT,
  button_text   TEXT,
  button_url    TEXT,
  target_type   TEXT CHECK (target_type IN ('users', 'groups', 'game_participants', 'all')),
  target_game_id UUID REFERENCES games(id),
  sent_count    INT DEFAULT 0,
  failed_count  INT DEFAULT 0,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'done')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_games_group_id ON games(group_id);
CREATE INDEX IF NOT EXISTS idx_games_is_active ON games(is_active);
CREATE INDEX IF NOT EXISTS idx_participants_game_id ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON game_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_invited_by ON game_participants(invited_by);
CREATE INDEX IF NOT EXISTS idx_numbers_game_id ON game_numbers(game_id);
CREATE INDEX IF NOT EXISTS idx_numbers_user_id ON game_numbers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_member_logs_group ON member_logs(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_member_logs_game ON member_logs(game_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get next available number for a game
CREATE OR REPLACE FUNCTION get_next_game_number(p_game_id UUID)
RETURNS INT AS $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1
  INTO v_max
  FROM game_numbers
  WHERE game_id = p_game_id;
  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

-- Assign number to participant atomically
CREATE OR REPLACE FUNCTION assign_number_to_user(p_game_id UUID, p_user_id BIGINT)
RETURNS INT AS $$
DECLARE
  v_number INT;
BEGIN
  SELECT get_next_game_number(p_game_id) INTO v_number;
  INSERT INTO game_numbers (game_id, number, assigned_to)
  VALUES (p_game_id, v_number, p_user_id);
  RETURN v_number;
EXCEPTION
  WHEN unique_violation THEN
    -- In case of race condition, try again
    RETURN assign_number_to_user(p_game_id, p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Process invite increment and handle number assignment atomically
CREATE OR REPLACE FUNCTION process_invite_increment(p_game_id UUID, p_inviter_id BIGINT)
RETURNS JSON AS $$
DECLARE
  v_ppn INT;
  v_old_count INT;
  v_new_count INT;
  v_number_assigned INT := NULL;
  v_updated_participant RECORD;
BEGIN
  -- Get people_per_number
  SELECT people_per_number INTO v_ppn FROM games WHERE id = p_game_id;
  
  -- Update invite count atomically
  UPDATE game_participants 
  SET invite_count = invite_count + 1 
  WHERE game_id = p_game_id AND user_id = p_inviter_id
  RETURNING invite_count - 1, invite_count INTO v_old_count, v_new_count;

  -- If not found, create it (should already exist though)
  IF NOT FOUND THEN
    INSERT INTO game_participants (game_id, user_id, invite_count)
    VALUES (p_game_id, p_inviter_id, 1)
    RETURNING 0, 1 INTO v_old_count, v_new_count;
  END IF;

  -- Check if a new number should be assigned
  IF floor(v_new_count / v_ppn) > floor(v_old_count / v_ppn) THEN
    SELECT assign_number_to_user(p_game_id, p_inviter_id) INTO v_number_assigned;
  END IF;

  -- Get updated participant record
  SELECT * INTO v_updated_participant FROM game_participants WHERE game_id = p_game_id AND user_id = p_inviter_id;

  RETURN json_build_object(
    'updated_participant', row_to_json(v_updated_participant),
    'assigned_number', v_number_assigned
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (Optional - enable as needed)
-- =====================================================
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE games ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
