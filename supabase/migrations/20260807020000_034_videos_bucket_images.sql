-- Photo carousel slides are submission media; allow images in the videos
-- bucket so they live beside the video segments instead of the
-- account-verification bucket.
update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp'
]
where id = 'videos';
