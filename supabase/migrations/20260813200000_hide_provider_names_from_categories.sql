-- Hide panel provider labels from customer-facing categories.
-- Map products onto Followers / Likes / Views / etc. using the service name.

INSERT INTO categories (name, slug, description, sort_order, is_active)
VALUES
  ('Followers', 'followers', 'Follower packages', 10, TRUE),
  ('Likes', 'likes', 'Like packages', 20, TRUE),
  ('Views', 'views', 'View packages', 30, TRUE),
  ('Comments', 'comments', 'Comment packages', 40, TRUE),
  ('Shares', 'shares', 'Share and repost packages', 50, TRUE),
  ('Subscribers', 'subscribers', 'Subscriber packages', 60, TRUE),
  ('Stories', 'stories', 'Story packages', 70, TRUE),
  ('Live Stream', 'live', 'Live stream packages', 80, TRUE),
  ('Saves', 'saves', 'Save packages', 90, TRUE),
  ('Members', 'members', 'Member packages', 100, TRUE),
  ('Votes', 'votes', 'Vote packages', 110, TRUE),
  ('Reviews', 'reviews', 'Review packages', 120, TRUE),
  ('Impressions', 'impressions', 'Impression packages', 130, TRUE),
  ('Reach', 'reach', 'Reach packages', 140, TRUE),
  ('Traffic', 'traffic', 'Traffic packages', 150, TRUE),
  ('Other', 'other', 'Other packages', 900, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE,
  description = EXCLUDED.description;

UPDATE products p
SET category_id = c.id,
    updated_at = NOW()
FROM categories c
WHERE c.slug = CASE
  WHEN p.name ~* 'subscriber' THEN 'subscribers'
  WHEN p.name ~* 'follower' THEN 'followers'
  WHEN p.name ~* '\blikes?\b' THEN 'likes'
  WHEN p.name ~* 'comment' THEN 'comments'
  WHEN p.name ~* 'share|repost|retweet' THEN 'shares'
  WHEN p.name ~* 'stor(y|ies)' THEN 'stories'
  WHEN p.name ~* '\blive\b' THEN 'live'
  WHEN p.name ~* 'view|watch|play' THEN 'views'
  WHEN p.name ~* 'save|bookmark' THEN 'saves'
  WHEN p.name ~* 'member' THEN 'members'
  WHEN p.name ~* 'vote|poll' THEN 'votes'
  WHEN p.name ~* 'review' THEN 'reviews'
  WHEN p.name ~* 'impression' THEN 'impressions'
  WHEN p.name ~* 'reach' THEN 'reach'
  WHEN p.name ~* 'traffic|visit' THEN 'traffic'
  ELSE 'other'
END;

INSERT INTO platform_categories (platform_id, category_id)
SELECT DISTINCT platform_id, category_id FROM products
ON CONFLICT DO NOTHING;

UPDATE categories
SET is_active = FALSE,
    updated_at = NOW()
WHERE name ~* 'resellersmm|\bprovider\b|task[[:space:]]*/[[:space:]]*farm'
   OR slug LIKE 'resellersmm%'
   OR slug LIKE '%provider%';

UPDATE products
SET description = NULL,
    updated_at = NOW()
WHERE description ILIKE '%imported from%';
