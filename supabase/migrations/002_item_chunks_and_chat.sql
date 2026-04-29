-- Chunk-level embeddings for Ask Cici (topic + single-item drill-down)
-- Chat persistence for Ask Cici threads

-- ============================================================
-- ITEM CHUNKS
-- ============================================================
create table item_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   vector(768) not null,
  created_at  timestamptz not null default now(),

  unique (item_id, chunk_index)
);

create index item_chunks_user_id_idx on item_chunks(user_id);
create index item_chunks_item_id_idx on item_chunks(item_id);
create index item_chunks_embedding_idx on item_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table item_chunks enable row level security;

create policy "Users can view own item_chunks"
  on item_chunks for select
  using (auth.uid() = user_id);

create policy "Users can insert own item_chunks"
  on item_chunks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own item_chunks"
  on item_chunks for delete
  using (auth.uid() = user_id);

create policy "Users can update own item_chunks"
  on item_chunks for update
  using (auth.uid() = user_id);

-- Semantic search over chunks (invoker = caller's JWT).
-- Include `extensions` in search_path so pgvector's `<=>` operator resolves (same root cause as hybrid_search semantic leg).
create or replace function search_item_chunks(
  query_embedding vector(768),
  match_count int default 16,
  filter_item_id uuid default null
)
returns table (
  chunk_id uuid,
  item_id uuid,
  title text,
  chunk_index int,
  content text,
  similarity float
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  return query
  select
    c.id as chunk_id,
    c.item_id,
    i.title,
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.item_chunks c
  join public.items i on i.id = c.item_id and i.user_id = auth.uid()
  where c.user_id = auth.uid()
    and (filter_item_id is null or c.item_id = filter_item_id)
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 16), 48);
end;
$$;

-- ============================================================
-- CHAT (Ask Cici)
-- ============================================================
create table chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id)
);

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references chat_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  meta       jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_id_idx on chat_messages(thread_id);

create table chat_message_sources (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  item_id    uuid not null references items(id) on delete cascade,
  chunk_id   uuid references item_chunks(id) on delete set null,
  rank       int not null default 0
);

create index chat_message_sources_message_id_idx on chat_message_sources(message_id);

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table chat_message_sources enable row level security;

create policy "Users can view own chat_threads"
  on chat_threads for select using (auth.uid() = user_id);

create policy "Users can insert own chat_threads"
  on chat_threads for insert with check (auth.uid() = user_id);

create policy "Users can update own chat_threads"
  on chat_threads for update using (auth.uid() = user_id);

create policy "Users can view own chat_messages"
  on chat_messages for select using (
    exists (select 1 from chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
  );

create policy "Users can insert own chat_messages"
  on chat_messages for insert with check (
    exists (select 1 from chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
  );

create policy "Users can view own chat_message_sources"
  on chat_message_sources for select using (
    exists (
      select 1 from chat_messages m
      join chat_threads t on t.id = m.thread_id
      where m.id = chat_message_sources.message_id and t.user_id = auth.uid()
    )
  );

create policy "Users can insert own chat_message_sources"
  on chat_message_sources for insert with check (
    exists (
      select 1 from chat_messages m
      join chat_threads t on t.id = m.thread_id
      where m.id = chat_message_sources.message_id and t.user_id = auth.uid()
    )
  );

create or replace function chat_threads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_messages_touch_thread
  after insert on chat_messages
  for each row execute function chat_threads_set_updated_at();
