-- Free-text notes per lead (shown on the lead page; later used as AI context
-- when drafting replies).
alter table public.leads
  add column notes text not null default ''
  check (char_length(notes) <= 10000);
