-- Squads: Social lobbies for Claude Code
-- Initial schema

-- Users (synced from GitHub OAuth)
create table users (
  id uuid primary key default gen_random_uuid(),
  github_id text unique not null,
  github_username text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Rooms (lobbies/squads)
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_by uuid references users(id),
  is_public boolean default true,
  created_at timestamptz default now()
);

-- Room membership
create table room_members (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

-- Friends
create table friends (
  user_id uuid references users(id) on delete cascade,
  friend_id uuid references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);

-- Chat messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id),
  content text not null,
  created_at timestamptz default now()
);

-- Persistent activity log
create table activities (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  detail text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_messages_room on messages(room_id, created_at desc);
create index idx_activities_room on activities(room_id, created_at desc);
create index idx_friends_user on friends(user_id);
create index idx_friends_friend on friends(friend_id);
create index idx_room_members_user on room_members(user_id);

-- ============================================================
-- Helper function to break RLS circular dependencies.
-- SECURITY DEFINER runs as the function owner (postgres), bypassing RLS.
-- ============================================================

create or replace function get_my_room_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select room_id from room_members where user_id = auth.uid();
$$;

create or replace function is_room_public(rid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from rooms where id = rid and is_public = true);
$$;

-- Enable RLS
alter table users enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table friends enable row level security;
alter table messages enable row level security;
alter table activities enable row level security;

-- ============================================================
-- USERS policies
-- ============================================================
create policy "Users can view profiles"
  on users for select
  using (auth.uid() is not null);

create policy "Users can upsert own profile"
  on users for insert
  with check (id = auth.uid());

create policy "Users can update own profile"
  on users for update
  using (id = auth.uid());

-- ============================================================
-- ROOMS policies
-- ============================================================
create policy "Anyone can view public rooms"
  on rooms for select
  using (is_public = true or id in (select get_my_room_ids()));

create policy "Authenticated users can create rooms"
  on rooms for insert
  with check (auth.uid() is not null);

-- ============================================================
-- ROOM_MEMBERS policies (use helper functions to avoid recursion)
-- ============================================================
create policy "Members can view room members"
  on room_members for select
  using (room_id in (select get_my_room_ids()));

create policy "Users can join rooms"
  on room_members for insert
  with check (
    user_id = auth.uid()
    and (is_room_public(room_id) or room_id in (select get_my_room_ids()))
  );

create policy "Users can leave rooms"
  on room_members for delete
  using (user_id = auth.uid());

-- ============================================================
-- MESSAGES policies
-- ============================================================
create policy "Members can read room messages"
  on messages for select
  using (room_id in (select get_my_room_ids()));

create policy "Members can send messages"
  on messages for insert
  with check (
    user_id = auth.uid()
    and room_id in (select get_my_room_ids())
  );

-- ============================================================
-- ACTIVITIES policies
-- ============================================================
create policy "Users can read activities"
  on activities for select
  using (
    auth.uid() is not null
    and (room_id is null or room_id in (select get_my_room_ids()))
  );

create policy "Authenticated users can post activities"
  on activities for insert
  with check (auth.uid() is not null);

-- ============================================================
-- FRIENDS policies
-- ============================================================
create policy "Users can see their friends"
  on friends for select
  using (user_id = auth.uid() or friend_id = auth.uid());

create policy "Users can send friend requests"
  on friends for insert
  with check (user_id = auth.uid());

create policy "Users can accept friend requests"
  on friends for update
  using (friend_id = auth.uid());

-- Enable realtime for messages and activities
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table activities;
