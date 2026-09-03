-- Customer catalog cleanup: per-unit package prices, correct platforms/categories, hide junk.

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_unit TEXT NOT NULL DEFAULT 'per_1000';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_price_unit_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_price_unit_check CHECK (price_unit IN ('per_1000', 'each'));
  END IF;
END $$;

INSERT INTO platforms (name, slug, description, icon, color, sort_order, is_active)
VALUES ('Subscriptions', 'subscriptions', 'Account and subscription packages', 'Globe', '#E50914', 26, TRUE)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE;

-- Charge Netflix / subscription packages per unit (₵120 for qty 1, not ₵0.12).
UPDATE products
SET price_unit = 'each', updated_at = NOW()
WHERE price_unit = 'per_1000'
  AND min_quantity <= 10
  AND max_quantity <= 100
  AND (
    name ~* 'netflix|subscription|license|account[[:space:]]*plan'
    OR EXISTS (
      SELECT 1 FROM platforms pl
      WHERE pl.id = products.platform_id
        AND (pl.slug = 'subscriptions' OR pl.slug LIKE 'netflix%' OR pl.name ~* 'netflix|subscription')
    )
  );

-- Prefer the network named in the service title.
UPDATE products p
SET platform_id = pl.id, updated_at = NOW()
FROM platforms pl
WHERE pl.slug = CASE
  WHEN p.name ~* 'tiktok' THEN 'tiktok'
  WHEN p.name ~* 'instagram' OR p.name ~* '\mig\M' THEN 'instagram'
  WHEN p.name ~* 'youtube' OR p.name ~* '\myt\M' THEN 'youtube'
  WHEN p.name ~* 'facebook' OR p.name ~* '\mfb\M' THEN 'facebook'
  WHEN p.name ~* 'twitter' THEN 'x'
  WHEN p.name ~* 'telegram' THEN 'telegram'
  WHEN p.name ~* 'spotify' THEN 'spotify'
  WHEN p.name ~* 'threads' THEN 'threads'
  WHEN p.name ~* 'snapchat' THEN 'snapchat'
  WHEN p.name ~* 'linkedin' THEN 'linkedin'
  WHEN p.name ~* 'whatsapp' THEN 'whatsapp'
  WHEN p.name ~* 'discord' THEN 'discord'
  WHEN p.name ~* 'twitch' THEN 'twitch'
  WHEN p.name ~* 'pinterest' THEN 'pinterest'
  WHEN p.name ~* 'reddit' THEN 'reddit'
  WHEN p.name ~* 'soundcloud' THEN 'soundcloud'
  WHEN p.name ~* 'audiomack' THEN 'audiomack'
  WHEN p.name ~* 'apple[[:space:]]*music' THEN 'apple-music'
  WHEN p.name ~* 'deezer' THEN 'deezer'
  WHEN p.name ~* '\mkick\M' THEN 'kick'
  WHEN p.name ~* 'rumble' THEN 'rumble'
  WHEN p.name ~* 'likee' THEN 'likee'
  WHEN p.name ~* 'kwai' THEN 'kwai'
  WHEN p.name ~* 'netflix|subscription' THEN 'subscriptions'
  WHEN p.name ~* 'website[[:space:]]*traffic|\bseo\b' THEN 'website-traffic'
  ELSE NULL
END
AND p.platform_id IS DISTINCT FROM pl.id;

UPDATE products p
SET platform_id = canonical.id, updated_at = NOW()
FROM platforms junk
JOIN platforms canonical ON canonical.slug = 'threads'
WHERE p.platform_id = junk.id
  AND junk.slug LIKE 'threads-%';

UPDATE products p
SET platform_id = canonical.id, updated_at = NOW()
FROM platforms junk
JOIN platforms canonical ON canonical.slug = 'subscriptions'
WHERE p.platform_id = junk.id
  AND (junk.slug LIKE 'netflix%' OR junk.name ~* 'netflix');

-- File services into Followers / Likes / Views / … using the first metric in the title.
-- Postgres \y is a word boundary; \b is a backspace and was why Likes never matched.
UPDATE products p
SET category_id = c.id, updated_at = NOW()
FROM categories c
WHERE c.slug = CASE
  WHEN p.name ~* 'subscriber' THEN 'subscribers'
  WHEN p.name ~* 'follower' THEN 'followers'
  WHEN p.name ~* 'comment' THEN 'comments'
  WHEN p.name ~* 'share|repost|retweet' THEN 'shares'
  WHEN p.name ~* 'stor(y|ies)' THEN 'stories'
  WHEN p.name ~* '\ylive\y' THEN 'live'
  WHEN p.name ~* 'view|watch|play' THEN 'views'
  WHEN p.name ~* '\ylikes?\y|\ylikers\y' THEN 'likes'
  WHEN p.name ~* 'save|bookmark' THEN 'saves'
  WHEN p.name ~* 'member' THEN 'members'
  WHEN p.name ~* 'vote|poll' THEN 'votes'
  WHEN p.name ~* 'review' THEN 'reviews'
  WHEN p.name ~* 'impression' THEN 'impressions'
  WHEN p.name ~* 'reach' THEN 'reach'
  WHEN p.name ~* 'traffic|visit' THEN 'traffic'
  ELSE 'other'
END;

UPDATE categories SET sort_order = 10, is_active = TRUE, name = 'Followers' WHERE slug = 'followers';
UPDATE categories SET sort_order = 20, is_active = TRUE, name = 'Likes' WHERE slug = 'likes';
UPDATE categories SET sort_order = 30, is_active = TRUE, name = 'Views' WHERE slug = 'views';
UPDATE categories SET sort_order = 40, is_active = TRUE, name = 'Comments' WHERE slug = 'comments';
UPDATE categories SET sort_order = 50, is_active = TRUE, name = 'Shares' WHERE slug = 'shares';
UPDATE categories SET sort_order = 60, is_active = TRUE, name = 'Subscribers' WHERE slug = 'subscribers';
UPDATE categories SET sort_order = 70, is_active = TRUE, name = 'Stories' WHERE slug = 'stories';
UPDATE categories SET sort_order = 80, is_active = TRUE, name = 'Live Stream' WHERE slug = 'live';
UPDATE categories SET sort_order = 90, is_active = TRUE, name = 'Saves' WHERE slug = 'saves';
UPDATE categories SET sort_order = 100, is_active = TRUE, name = 'Members' WHERE slug = 'members';
UPDATE categories SET sort_order = 110, is_active = TRUE, name = 'Votes' WHERE slug = 'votes';
UPDATE categories SET sort_order = 120, is_active = TRUE, name = 'Reviews' WHERE slug = 'reviews';
UPDATE categories SET sort_order = 130, is_active = TRUE, name = 'Impressions' WHERE slug = 'impressions';
UPDATE categories SET sort_order = 140, is_active = TRUE, name = 'Reach' WHERE slug = 'reach';
UPDATE categories SET sort_order = 150, is_active = TRUE, name = 'Traffic' WHERE slug = 'traffic';
UPDATE categories SET sort_order = 900, is_active = TRUE, name = 'Other' WHERE slug = 'other';

UPDATE categories
SET is_active = FALSE, updated_at = NOW()
WHERE slug NOT IN (
  'followers','likes','views','comments','shares','subscribers','stories','live',
  'saves','members','votes','reviews','impressions','reach','traffic','other'
);

INSERT INTO platform_categories (platform_id, category_id)
SELECT DISTINCT platform_id, category_id FROM products
ON CONFLICT DO NOTHING;

UPDATE platforms SET sort_order = 1, is_active = TRUE WHERE slug = 'tiktok';
UPDATE platforms SET sort_order = 2, is_active = TRUE WHERE slug = 'instagram';
UPDATE platforms SET sort_order = 3, is_active = TRUE WHERE slug = 'youtube';
UPDATE platforms SET sort_order = 4, is_active = TRUE WHERE slug = 'facebook';
UPDATE platforms SET sort_order = 5, is_active = TRUE WHERE slug = 'x';
UPDATE platforms SET sort_order = 6, is_active = TRUE WHERE slug = 'telegram';
UPDATE platforms SET sort_order = 7, is_active = TRUE WHERE slug = 'spotify';
UPDATE platforms SET sort_order = 8, is_active = TRUE WHERE slug = 'threads';
UPDATE platforms SET sort_order = 9, is_active = TRUE WHERE slug = 'snapchat';
UPDATE platforms SET sort_order = 10, is_active = TRUE WHERE slug = 'whatsapp';
UPDATE platforms SET sort_order = 26, is_active = TRUE WHERE slug = 'subscriptions';
UPDATE platforms SET sort_order = 98, is_active = TRUE WHERE slug = 'website-traffic';
UPDATE platforms SET sort_order = 99, is_active = TRUE WHERE slug = 'other';

UPDATE platforms
SET is_active = FALSE, updated_at = NOW()
WHERE slug LIKE 'netflix%'
   OR slug LIKE 'threads-%'
   OR (slug LIKE '%-%' AND slug NOT IN ('apple-music','website-traffic') AND NOT EXISTS (
        SELECT 1 FROM products p WHERE p.platform_id = platforms.id
      ));

-- Hide services that are marked unavailable or are empty generic titles.
UPDATE products
SET status = 'inactive', updated_at = NOW()
WHERE status = 'active'
  AND (
    name ~* 'not[[:space:]]*available|unavailable|out[[:space:]]*of[[:space:]]*stock|do[[:space:]]*not[[:space:]]*order'
    OR name ~* '^(like|likes|subscribers?|members?|followers?|views?|comments?)$'
  );
