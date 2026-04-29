-- Enable multiple chat threads per user
-- Previously enforced one thread per user via unique(user_id); drop that constraint.
-- Add a title column so the sidebar can label each conversation.
-- Add DELETE policies so users can remove their own threads and messages.

-- 1. Drop the single-thread-per-user constraint
ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_user_id_key;

-- 2. Add title column (null = old threads without a stored title)
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS title text;

-- 3. Delete policies (drop first in case they already exist)
DROP POLICY IF EXISTS "Users can delete own chat_threads" ON chat_threads;
CREATE POLICY "Users can delete own chat_threads"
  ON chat_threads FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chat_messages" ON chat_messages;
CREATE POLICY "Users can delete own chat_messages"
  ON chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND t.user_id = auth.uid()
    )
  );
