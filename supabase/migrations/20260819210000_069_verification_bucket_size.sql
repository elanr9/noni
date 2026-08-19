-- Warm-up proof is a screen recording, so 100MB was too tight once creators
-- recorded for more than a minute. Matches the videos bucket at 500MB. The
-- project-wide storage limit was raised to the same number, since the smaller
-- of the two wins and it was silently capping every bucket at 50MB.
update storage.buckets
set file_size_limit = 524288000
where id = 'account-verification';
