-- Enable required extensions
create extension if not exists "vector" with schema "extensions";
create extension if not exists "pg_trgm" with schema "extensions";

-- ============================================================
-- ITEMS: the core vault table
-- ============================================================
create type content_type as enum (
  'link',
  'selected_text',
  'pasted_link',
  'pdf',
  'image'
);

create type item_status as enum (
  'processing',
  'ready',
  'summary_failed'
);

create table items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source_url    text,
  title         text not null default '',
  content_type  content_type not null,
  content_ref   text,                -- for text: the text; for files: storage path
  page_text     text,                -- DOM text from extension (fallback for summarization)
  summary       text,
  note          text default '',
  status        item_status not null default 'processing',
  is_duplicate  boolean not null default false,
  summary_source text,               -- 'full_article', 'page_preview', 'selected_text', 'pdf_text', 'image'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- full-text search vector (auto-populated by trigger)
  fts           tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(note, '')), 'C')
  ) stored
);

create index items_user_id_idx on items(user_id);
create index items_created_at_idx on items(created_at desc);
create index items_fts_idx on items using gin(fts);
create index items_source_url_idx on items(user_id, source_url) where source_url is not null;

-- ============================================================
-- TAGS
-- ============================================================
create table tags (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  name      text not null,
  created_at timestamptz not null default now(),

  unique(user_id, name)
);

create table item_tags (
  item_id   uuid not null references items(id) on delete cascade,
  tag_id    uuid not null references tags(id) on delete cascade,
  is_ai     boolean not null default false,  -- true if AI-suggested
  primary key (item_id, tag_id)
);

create index item_tags_tag_id_idx on item_tags(tag_id);

-- ============================================================
-- EMBEDDINGS (pgvector, 768 dims for Gemini text-embedding-004)
-- ============================================================
create table item_embeddings (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid not null references items(id) on delete cascade unique,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);

create index item_embeddings_idx on item_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table items enable row level security;
alter table tags enable row level security;
alter table item_tags enable row level security;
alter table item_embeddings enable row level security;

-- Items: users can only access their own
create policy "Users can view own items"
  on items for select
  using (auth.uid() = user_id);

create policy "Users can insert own items"
  on items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own items"
  on items for update
  using (auth.uid() = user_id);

create policy "Users can delete own items"
  on items for delete
  using (auth.uid() = user_id);

-- Tags: users can only access their own
create policy "Users can view own tags"
  on tags for select
  using (auth.uid() = user_id);

create policy "Users can insert own tags"
  on tags for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own tags"
  on tags for delete
  using (auth.uid() = user_id);

-- Item tags: access through item ownership
create policy "Users can view own item_tags"
  on item_tags for select
  using (
    exists (select 1 from items where items.id = item_tags.item_id and items.user_id = auth.uid())
  );

create policy "Users can insert own item_tags"
  on item_tags for insert
  with check (
    exists (select 1 from items where items.id = item_tags.item_id and items.user_id = auth.uid())
  );

create policy "Users can delete own item_tags"
  on item_tags for delete
  using (
    exists (select 1 from items where items.id = item_tags.item_id and items.user_id = auth.uid())
  );

-- Embeddings: access through item ownership
create policy "Users can view own embeddings"
  on item_embeddings for select
  using (
    exists (select 1 from items where items.id = item_embeddings.item_id and items.user_id = auth.uid())
  );

create policy "Users can insert own embeddings"
  on item_embeddings for insert
  with check (
    exists (select 1 from items where items.id = item_embeddings.item_id and items.user_id = auth.uid())
  );

-- ============================================================
-- FUNCTIONS: hybrid search with RRF
-- ============================================================
create or replace function hybrid_search(
  query_text text,
  query_embedding vector(768),
  match_count int default 20,
  p_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  title text,
  source_url text,
  content_type content_type,
  summary text,
  note text,
  status item_status,
  created_at timestamptz,
  rrf_score float
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  k constant int := 60; -- RRF constant
begin
  return query
  with keyword_results as (
    select
      i.id,
      row_number() over (order by ts_rank_cd(i.fts, websearch_to_tsquery('english', query_text)) desc) as rank_ix
    from public.items i
    where i.user_id = p_user_id
      and i.fts @@ websearch_to_tsquery('english', query_text)
    order by rank_ix
    limit match_count * 2
  ),
  semantic_results as (
    select
      e.item_id as id,
      row_number() over (order by e.embedding <=> query_embedding) as rank_ix
    from public.item_embeddings e
    join public.items i on i.id = e.item_id
    where i.user_id = p_user_id
    order by rank_ix
    limit match_count * 2
  ),
  combined as (
    select
      coalesce(kr.id, sr.id) as id,
      coalesce(1.0 / (k + kr.rank_ix), 0.0) +
      coalesce(1.0 / (k + sr.rank_ix), 0.0) as score
    from keyword_results kr
    full outer join semantic_results sr on kr.id = sr.id
    order by score desc
    limit match_count
  )
  select
    i.id,
    i.title,
    i.source_url,
    i.content_type,
    i.summary,
    i.note,
    i.status,
    i.created_at,
    c.score as rrf_score
  from combined c
  join public.items i on i.id = c.id
  order by c.score desc;
end;
$$;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

-- ============================================================
-- STORAGE BUCKET for file uploads
-- ============================================================
insert into storage.buckets (id, name, public)
values ('vault-files', 'vault-files', false)
on conflict do nothing;

create policy "Users can upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view own files"
  on storage.objects for select
  using (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'vault-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
