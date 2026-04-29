-- Scout agent: RSS sources + AI-scored article suggestions

-- ── scout_sources ─────────────────────────────────────────────────────────────
-- RSS feeds the user wants the agent to watch

create table scout_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null,
  feed_url   text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index scout_sources_user_id_idx on scout_sources(user_id);

alter table scout_sources enable row level security;

create policy "Users can view own scout_sources"
  on scout_sources for select using (auth.uid() = user_id);

create policy "Users can insert own scout_sources"
  on scout_sources for insert with check (auth.uid() = user_id);

create policy "Users can update own scout_sources"
  on scout_sources for update using (auth.uid() = user_id);

create policy "Users can delete own scout_sources"
  on scout_sources for delete using (auth.uid() = user_id);


-- ── scout_suggestions ─────────────────────────────────────────────────────────
-- Articles found by the agent, scored for relevance

create table scout_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  source_id        uuid references scout_sources(id) on delete set null,
  source_label     text not null,
  title            text not null,
  url              text not null,
  description      text,
  published_at     timestamptz,
  relevance_score  int not null check (relevance_score between 1 and 5),
  relevance_reason text not null,
  status           text not null default 'pending' check (status in ('pending', 'saved', 'dismissed')),
  created_at       timestamptz not null default now()
);

create index scout_suggestions_user_id_idx on scout_suggestions(user_id);
create index scout_suggestions_status_idx on scout_suggestions(user_id, status);

alter table scout_suggestions enable row level security;

create policy "Users can view own scout_suggestions"
  on scout_suggestions for select using (auth.uid() = user_id);

create policy "Users can insert own scout_suggestions"
  on scout_suggestions for insert with check (auth.uid() = user_id);

create policy "Users can update own scout_suggestions"
  on scout_suggestions for update using (auth.uid() = user_id);

create policy "Users can delete own scout_suggestions"
  on scout_suggestions for delete using (auth.uid() = user_id);
