-- ── Vault Folders ─────────────────────────────────────────────────────────────
-- A folder is a named collection of tag names.
-- Selecting a folder shows items that have ANY of its tags (OR filter).
-- Tags can belong to multiple folders.

create table if not exists vault_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null,
  created_at timestamptz default now()
);

alter table vault_folders enable row level security;

create policy "Users own their folders"
  on vault_folders
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Folder ↔ Tag mapping ───────────────────────────────────────────────────────
-- Stores tag *names* (not IDs) so folders survive tag renames and are easy
-- to compare against the tags that come back with items.

create table if not exists folder_tags (
  folder_id uuid references vault_folders(id) on delete cascade,
  tag_name  text not null,
  primary key (folder_id, tag_name)
);

alter table folder_tags enable row level security;

create policy "Users own their folder_tags"
  on folder_tags
  using (
    folder_id in (
      select id from vault_folders where user_id = auth.uid()
    )
  )
  with check (
    folder_id in (
      select id from vault_folders where user_id = auth.uid()
    )
  );
