-- Evaluation system: stores eval run metadata and per-item judge results

-- ── eval_runs ────────────────────────────────────────────────────────────────
-- One row per eval execution (vault sample, chat history, or uploaded dataset)

create table eval_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  mode         text not null check (mode in ('vault', 'chat', 'dataset')),
  status       text not null default 'running' check (status in ('running', 'done', 'failed')),
  item_count   int not null default 0,
  avg_scores   jsonb not null default '{}'::jsonb,  -- { dimension: avg_score }
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index eval_runs_user_id_idx on eval_runs(user_id);
create index eval_runs_created_at_idx on eval_runs(user_id, created_at desc);

alter table eval_runs enable row level security;

create policy "Users can view own eval_runs"
  on eval_runs for select using (auth.uid() = user_id);

create policy "Users can insert own eval_runs"
  on eval_runs for insert with check (auth.uid() = user_id);

create policy "Users can update own eval_runs"
  on eval_runs for update using (auth.uid() = user_id);

create policy "Users can delete own eval_runs"
  on eval_runs for delete using (auth.uid() = user_id);


-- ── eval_results ─────────────────────────────────────────────────────────────
-- One row per (subject × dimension) — e.g. item X scored 4/5 on faithfulness

create table eval_results (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references eval_runs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  subject_type  text not null check (subject_type in ('item', 'chat_turn', 'dataset_case')),
  subject_id    text,    -- item.id | chat_messages.id | dataset row index (as text)
  subject_label text,    -- item title | question text | dataset case label
  dimension     text not null,
  score         int not null check (score between 1 and 5),
  reasoning     text not null,
  created_at    timestamptz not null default now()
);

create index eval_results_run_id_idx on eval_results(run_id);

alter table eval_results enable row level security;

create policy "Users can view own eval_results"
  on eval_results for select using (auth.uid() = user_id);

create policy "Users can insert own eval_results"
  on eval_results for insert with check (auth.uid() = user_id);

create policy "Users can delete own eval_results"
  on eval_results for delete using (auth.uid() = user_id);
