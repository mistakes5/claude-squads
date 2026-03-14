-- Allow null room_id on activities (for direct pings between users)
alter table activities alter column room_id drop not null;
alter table activities drop constraint if exists activities_room_id_fkey;
alter table activities
  add constraint activities_room_id_fkey
  foreign key (room_id) references rooms(id) on delete cascade;

-- Index for looking up pings by action type
create index idx_activities_action on activities(action, created_at desc);

-- Policy: users can read pings addressed to them
create policy "Users can read their pings"
  on activities for select
  using (
    action = 'ping'
    and detail::jsonb->>'to' = auth.uid()::text
  );
