-- T051: a revoked Telegram chat can be linked to another staff account.
alter table app_private.f15_telegram_links
  drop constraint f15_telegram_links_chat_id_key;

create unique index f15_telegram_links_active_chat_id_unique
  on app_private.f15_telegram_links(chat_id)
  where revoked_at is null;
