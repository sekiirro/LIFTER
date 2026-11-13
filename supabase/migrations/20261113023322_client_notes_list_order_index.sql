create index if not exists client_notes_workspace_client_order_idx
  on public.client_notes (workspace_id, client_id, created_at desc, id desc);
