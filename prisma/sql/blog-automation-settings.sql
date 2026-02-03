-- Create BlogAutomationSettings table (singleton row)
-- Run this in Supabase SQL editor.

create table if not exists "BlogAutomationSettings" (
  "id" text primary key default 'singleton',
  "weeklyEnabled" boolean not null default true,
  "topicQueue" jsonb null,
  "topicQueueCursor" integer not null default 0,
  "lastWeeklyRunAt" timestamptz null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Keep updatedAt current on update
create or replace function set_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_blog_automation_settings_updated_at on "BlogAutomationSettings";
create trigger trg_blog_automation_settings_updated_at
before update on "BlogAutomationSettings"
for each row
execute function set_updated_at();

-- Ensure singleton row exists
insert into "BlogAutomationSettings" ("id")
values ('singleton')
on conflict ("id") do nothing;
