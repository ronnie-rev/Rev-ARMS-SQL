-- 0005: remove duplicate config rows (from an interrupted/double first-run seed) and make uniqueness work for NULL parents.
delete from public.config_options a using public.config_options b
 where a.ctid < b.ctid and a.category = b.category and a.value = b.value and a.parent is not distinct from b.parent;
alter table public.config_options drop constraint if exists config_options_category_parent_value_key;
create unique index if not exists config_options_unique_idx on public.config_options (category, coalesce(parent, ''), value);

delete from public.import_templates a using public.import_templates b where a.ctid < b.ctid and a.name = b.name;
