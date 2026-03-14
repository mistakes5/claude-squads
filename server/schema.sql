-- Squads: Social lobbies for Claude Code
-- Standalone Postgres schema (no Supabase dependencies)

-- Users (synced from GitHub OAuth)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id text UNIQUE NOT NULL,
  github_username text NOT NULL,
  avatar_url text,
  display_name text,
  github_token text,
  selected_border text DEFAULT 'auto',
  created_at timestamptz DEFAULT now()
);

-- Rooms (lobbies/squads)
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid REFERENCES users(id),
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Room membership
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Friends
CREATE TABLE IF NOT EXISTS friends (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Persistent activity log (room_id nullable for direct pings)
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  detail text,
  created_at timestamptz DEFAULT now()
);

-- Gamification: GitHub stats per user
CREATE TABLE IF NOT EXISTS user_github_stats (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  contributions int DEFAULT 0,
  public_repos int DEFAULT 0,
  pull_requests int DEFAULT 0,
  followers int DEFAULT 0,
  account_age_days int DEFAULT 0,
  longest_streak int DEFAULT 0,
  xp int DEFAULT 0,
  tier text DEFAULT 'bronze',
  fetched_at timestamptz DEFAULT now()
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  xp_bonus int DEFAULT 0
);

-- User earned achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text REFERENCES achievements(id),
  earned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Seed achievements
INSERT INTO achievements (id, name, description, icon, xp_bonus) VALUES
  ('first-commit', 'First Blood', 'Made your first contribution', '⚔️', 10),
  ('repo-10', 'Architect', '10+ public repositories', '🏛️', 25),
  ('repo-50', 'Empire Builder', '50+ public repositories', '🏗️', 50),
  ('pr-50', 'Review Machine', '50+ pull requests', '🔍', 25),
  ('pr-200', 'Merge Master', '200+ pull requests', '🎯', 50),
  ('streak-7', 'Week Warrior', '7-day contribution streak', '🔥', 15),
  ('streak-30', 'On Fire', '30-day contribution streak', '🔥', 40),
  ('streak-100', 'Unstoppable', '100-day contribution streak', '💎', 100),
  ('followers-50', 'Rising Star', '50+ followers', '⭐', 20),
  ('followers-100', 'Influencer', '100+ followers', '🌟', 40),
  ('followers-500', 'Celebrity', '500+ followers', '👑', 80),
  ('year-1', 'Veteran', '1+ year on GitHub', '🛡️', 15),
  ('year-5', 'Elder', '5+ years on GitHub', '⚡', 30),
  ('year-10', 'Ancient One', '10+ years on GitHub', '🏆', 60)
ON CONFLICT (id) DO NOTHING;

-- Direct messages (persisted DMs between users)
CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Invites (persisted squad invitations)
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (from_user_id, to_user_id, room_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_room ON activities(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_action ON activities(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants ON direct_messages(LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invites_to ON invites(to_user_id, status);
