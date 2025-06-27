"create table public.ad_spend (
  id uuid not null default gen_random_uuid (),
  product_id uuid not null,
  date date not null,
  spend numeric(10, 2) not null default 0,
  currency character varying(10) null,
  created_at timestamp with time zone not null default now(),
  product_ad_account_id uuid null,
  campaign_id text null,
  adset_id text null,
  ad_id text null,
  campaign_name text null,
  adset_name text null,
  ad_name text null,
  impressions integer null,
  clicks integer null,
  cpc numeric null,
  cpm numeric null,
  ctr numeric null,
  constraint ad_spend_pkey primary key (id),
  constraint ad_spend_product_id_date_key unique (product_id, date),
  constraint ad_spend_product_ad_account_id_fkey foreign KEY (product_ad_account_id) references product_ad_accounts (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_product_ad_account_id on public.ad_spend using btree (product_ad_account_id) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_campaign_id on public.ad_spend using btree (campaign_id) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_adset_id on public.ad_spend using btree (adset_id) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_ad_id on public.ad_spend using btree (ad_id) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_campaign_name on public.ad_spend using btree (campaign_name) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_adset_name on public.ad_spend using btree (adset_name) TABLESPACE pg_default;

create index IF not exists idx_ad_spend_ad_name on public.ad_spend using btree (ad_name) TABLESPACE pg_default;"

"create table public.meta_ad_accounts (
  id text not null,
  user_integration_id uuid not null,
  name text null,
  status text null,
  created_at timestamp with time zone not null default now(),
  constraint meta_ad_accounts_pkey primary key (id),
  constraint meta_ad_accounts_user_integration_id_fkey foreign KEY (user_integration_id) references user_integrations (id) on delete CASCADE
) TABLESPACE pg_default;"

"create table public.product_ad_accounts (
  id uuid not null default gen_random_uuid (),
  product_id uuid not null,
  ad_account_id text not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint product_ad_accounts_pkey primary key (id),
  constraint product_ad_accounts_ad_account_id_fkey foreign KEY (ad_account_id) references meta_ad_accounts (id) on delete CASCADE,
  constraint product_ad_accounts_product_id_fkey foreign KEY (product_id) references products (id) on delete CASCADE
) TABLESPACE pg_default;

create unique INDEX IF not exists product_ad_accounts_unique on public.product_ad_accounts using btree (product_id, ad_account_id) TABLESPACE pg_default;

create index IF not exists idx_product_ad_accounts_product_id on public.product_ad_accounts using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_product_ad_accounts_ad_account_id on public.product_ad_accounts using btree (ad_account_id) TABLESPACE pg_default;"

"create table public.product_integrations (
  id uuid not null default gen_random_uuid (),
  product_id uuid not null,
  user_id uuid not null,
  provider text not null,
  access_token_encrypted text not null,
  meta_ad_account_id text null,
  meta_business_id text null,
  status text null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint product_integrations_pkey primary key (id),
  constraint product_integrations_product_id_provider_key unique (product_id, provider),
  constraint product_integrations_product_id_fkey foreign KEY (product_id) references products (id) on delete CASCADE,
  constraint product_integrations_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint product_integrations_status_check check (
    (
      status = any (
        array['active'::text, 'expired'::text, 'revoked'::text]
      )
    )
  )
) TABLESPACE pg_default;

create trigger handle_updated_at BEFORE
update on product_integrations for EACH row
execute FUNCTION moddatetime ('updated_at');"

"create table public.products (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text not null,
  tracking_id text not null,
  active boolean null default true,
  created_at timestamp with time zone null default now(),
  fb_pixel_id text null,
  fb_access_token text null,
  fb_test_event_code text null,
  constraint products_pkey primary key (id),
  constraint products_tracking_id_key unique (tracking_id),
  constraint products_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create index IF not exists idx_products_fb_pixel on public.products using btree (fb_pixel_id) TABLESPACE pg_default;"

"create table public.user_integrations (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  provider text not null,
  access_token_encrypted text null,
  status text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone null,
  constraint user_integrations_pkey primary key (id),
  constraint user_integrations_user_id_provider_key unique (user_id, provider),
  constraint user_integrations_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;"

"create table public.user_settings (
  user_id uuid not null,
  timezone text not null default 'UTC'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  notification_preferences jsonb null default '{"email": true, "in_app": true}'::jsonb,
  push_enabled boolean null default false,
  telegram_chat_id text null,
  telegram_thread_id text null,
  telegram_notification_type text null default 'private'::text,
  constraint user_settings_pkey primary key (user_id),
  constraint user_settings_user_id_fkey foreign KEY (user_id) references users (id),
  constraint user_settings_telegram_notification_type_check check (
    (
      telegram_notification_type = any (
        array[
          'private'::text,
          'group'::text,
          'group_topic'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create trigger update_user_settings_updated_at BEFORE
update on user_settings for EACH row
execute FUNCTION update_updated_at_column ();"

"create table public.users (
  id uuid not null,
  active boolean null default true,
  created_at timestamp with time zone null default now(),
  max_monthly_events integer null default 10000,
  events_count integer null default 0,
  last_notification_sent timestamp with time zone null,
  role text null default 'user'::text,
  max_products integer not null default 1,
  email text not null,
  password text not null,
  constraint users_pkey primary key (id),
  constraint users_email_unique unique (email)
) TABLESPACE pg_default;"

"create table public.tracking_events (
  id uuid not null default gen_random_uuid (),
  product_id uuid not null,
  event_data jsonb not null,
  created_at timestamp with time zone null default now(),
  event_type public.tracking_event_type not null,
  visitor_id text not null,
  session_id text not null,
  page_view_id text null,
  url text null,
  referrer text null,
  user_agent text null,
  screen_resolution text null,
  viewport_size text null,
  constraint tracking_events_pkey primary key (id),
  constraint tracking_events_product_id_fkey foreign KEY (product_id) references products (id)
) TABLESPACE pg_default;

create index IF not exists idx_tracking_events_visitor_session on public.tracking_events using btree (visitor_id, session_id) TABLESPACE pg_default;

create index IF not exists idx_tracking_events_product_created on public.tracking_events using btree (product_id, created_at) TABLESPACE pg_default;"
