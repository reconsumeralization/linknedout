-- LinkedOut branded storage: one app bucket for files and assets (campaign images, avatars, etc.).
-- Apply in Supabase SQL editor or migration pipeline.

-- Create bucket (private; access via RLS)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linkedout-assets',
  'linkedout-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/json']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow authenticated users to read/list objects in this bucket
create policy "linkedout_assets_select"
on storage.objects for select
to authenticated
using ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to upload
create policy "linkedout_assets_insert"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to update (e.g. metadata)
create policy "linkedout_assets_update"
on storage.objects for update
to authenticated
using ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to delete
create policy "linkedout_assets_delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'linkedout-assets' );
