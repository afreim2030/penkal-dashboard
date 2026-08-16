insert into storage.buckets (id, name, public, file_size_limit)
values ('import-staging', 'import-staging', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "Authenticated users can upload import staging"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'import-staging'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated users can read own import staging"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'import-staging'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated users can delete own import staging"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'import-staging'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
