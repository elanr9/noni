-- Seed first tenant: FieldVision AI
insert into public.companies (name, slug, website, settings)
values (
  'FieldVision AI',
  'fieldvision',
  'https://fieldvision.ai',
  jsonb_build_object(
    'vertical', 'college_soccer',
    'ugc_reference_handles', jsonb_build_array('fabri.d1soccer')
  )
)
on conflict (slug) do nothing;
