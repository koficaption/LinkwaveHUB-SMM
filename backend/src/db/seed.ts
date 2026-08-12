import { pool, query, queryOne } from "../db.js";
import { hashPassword, encryptSecret, makeSlug } from "../utils.js";

export async function seedIfEmpty() {
  const existing = await queryOne(`SELECT id FROM users LIMIT 1`);
  if (existing) {
    console.log("Database already seeded");
    return;
  }
  await seed();
}

export async function seed() {
  console.log("Seeding LinkWaveHub demo data...");
  const adminHash = await hashPassword("Admin@12345");
  const resellerHash = await hashPassword("Reseller@12345");
  const customerHash = await hashPassword("Customer@12345");

  const admin = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, phone, role, status, email_verified, referral_code)
     VALUES ('admin@linkwavehub.com', $1, 'Demo Admin', '+233201111111', 'admin', 'active', TRUE, 'LWHADMIN01') RETURNING id`,
    [adminHash]
  );
  const resellerUser = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, phone, role, status, email_verified, referral_code)
     VALUES ('reseller@linkwavehub.com', $1, 'Demo Reseller', '+233202222222', 'reseller', 'active', TRUE, 'LWHRESEL01') RETURNING id`,
    [resellerHash]
  );
  const customer = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, phone, role, status, email_verified, referral_code)
     VALUES ('customer@linkwavehub.com', $1, 'Demo Customer', '+233203333333', 'customer', 'active', TRUE, 'LWHCUST01') RETURNING id`,
    [customerHash]
  );

  const extraUsers = [
    ["demo1@linkwavehub.com", "Demo User 1", "customer"],
    ["demo2@linkwavehub.com", "Demo User 2", "customer"],
    ["demo3@linkwavehub.com", "Demo User 3", "customer"],
    ["demo4@linkwavehub.com", "Demo User 4", "reseller"],
  ] as const;

  const extraIds: string[] = [];
  for (const [email, name, role] of extraUsers) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, status, referral_code)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [email, customerHash, name, role, `LWHDEMO${String(extraIds.length + 1).padStart(2, "0")}`]
    );
    extraIds.push(row!.id);
  }

  await query(`UPDATE users SET referred_by_id = $2 WHERE id = $1`, [extraIds[0], customer!.id]);

  const allUserIds = [admin!.id, resellerUser!.id, customer!.id, ...extraIds];
  for (const id of allUserIds) {
    const opening = id === customer!.id ? 250 : id === resellerUser!.id ? 800 : id === admin!.id ? 0 : 120;
    await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, $2)`, [id, opening]);
  }

  const reseller = await queryOne<{ id: string }>(
    `INSERT INTO resellers (user_id, status, store_name, store_slug, tagline, brand_color, markup_percent)
     VALUES ($1, 'active', 'Demo Storefront', 'demo-store', 'Sample reseller storefront for preview only', '#0D9488', 18)
     RETURNING id`,
    [resellerUser!.id]
  );
  await query(
    `INSERT INTO resellers (user_id, status, store_name, store_slug, tagline, markup_percent)
     VALUES ($1, 'pending', 'Demo Storefront 2', 'demo-store-2', 'Sample pending reseller', 25)`,
    [extraIds[3]]
  );

  const provider = await queryOne<{ id: string }>(
    `INSERT INTO providers (name, slug, api_url, api_key_encrypted, adapter, status, balance, currency, notes)
     VALUES ('Sample provider (not live)', 'linkwave-panel', 'https://resellersmm.com/api/v2', $1, 'mock', 'active', 0, 'USD', 'Placeholder. Connect the live resellersmm.com v2 API later from Admin → Providers.')
     RETURNING id`,
    [encryptSecret("demo-provider-key-not-for-frontend")]
  );
  await query(
    `INSERT INTO providers (name, slug, api_url, adapter, status, balance, currency)
     VALUES ('Backup SMM', 'backup-smm', 'https://backup.example.com/api', 'generic_http', 'inactive', 0, 'USD')`
  );

  const platforms = [
    ["TikTok", "tiktok", "Music2", "#111111", "Short-form video growth"],
    ["Instagram", "instagram", "Instagram", "#E1306C", "Feed, reels and story engagement"],
    ["YouTube", "youtube", "Youtube", "#FF0000", "Views, watch time and subscribers"],
    ["Facebook", "facebook", "Facebook", "#1877F2", "Page likes, views and reactions"],
    ["X", "x", "Twitter", "#0F1419", "Followers, likes and reposts"],
    ["Telegram", "telegram", "Send", "#229ED9", "Members, views and reactions"],
    ["Spotify", "spotify", "Music", "#1DB954", "Plays, followers and saves"],
  ] as const;

  const platformIds: Record<string, string> = {};
  let order = 1;
  for (const [name, slug, icon, color, description] of platforms) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO platforms (name, slug, description, icon, color, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6, TRUE) RETURNING id`,
      [name, slug, description, icon, color, order++]
    );
    platformIds[slug] = row!.id;
  }

  const categories = [
    ["Followers", "followers", "UserPlus"],
    ["Likes", "likes", "Heart"],
    ["Views", "views", "Eye"],
    ["Comments", "comments", "MessageCircle"],
    ["Shares", "shares", "Share2"],
    ["Subscribers", "subscribers", "Bell"],
    ["Watch Time", "watch-time", "Clock"],
    ["Saves", "saves", "Bookmark"],
    ["Reactions", "reactions", "Smile"],
  ] as const;
  const categoryIds: Record<string, string> = {};
  order = 1;
  for (const [name, slug, icon] of categories) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO categories (name, slug, icon, sort_order, is_active) VALUES ($1,$2,$3,$4, TRUE) RETURNING id`,
      [name, slug, icon, order++]
    );
    categoryIds[slug] = row!.id;
  }

  const assignments: [string, string[]][] = [
    ["tiktok", ["followers", "likes", "views", "comments", "shares", "saves"]],
    ["instagram", ["followers", "likes", "views", "comments", "saves"]],
    ["youtube", ["subscribers", "views", "likes", "watch-time", "comments"]],
    ["facebook", ["followers", "likes", "views", "reactions", "shares"]],
    ["x", ["followers", "likes", "views", "shares"]],
    ["telegram", ["followers", "views", "reactions"]],
    ["spotify", ["followers", "views", "saves"]],
  ];
  for (const [platform, cats] of assignments) {
    for (const cat of cats) {
      await query(
        `INSERT INTO platform_categories (platform_id, category_id) VALUES ($1, $2)`,
        [platformIds[platform], categoryIds[cat]]
      );
    }
  }

  type ProductSeed = {
    platform: string;
    category: string;
    name: string;
    description: string;
    min: number;
    max: number;
    price: number;
    cost: number;
    reseller: number;
    delivery: string;
    time: string;
    features: string[];
    serviceId: string;
  };

  const products: ProductSeed[] = [
    { platform: "tiktok", category: "followers", name: "TikTok Followers — Fast Delivery", description: "High-quality TikTok followers with gradual refill-friendly delivery.", min: 100, max: 100000, price: 18, cost: 11, reseller: 14, delivery: "gradual", time: "0-6 hours", features: ["Refill 30 days", "Real-looking profiles", "No password required"], serviceId: "1001" },
    { platform: "tiktok", category: "likes", name: "TikTok Likes — Instant Start", description: "Boost video social proof with fast TikTok likes.", min: 50, max: 200000, price: 4.5, cost: 2.2, reseller: 3.2, delivery: "instant", time: "0-30 minutes", features: ["Instant start", "Stable delivery"], serviceId: "1002" },
    { platform: "tiktok", category: "views", name: "TikTok Views — High Retention", description: "Increase video reach with high-retention views.", min: 1000, max: 1000000, price: 1.8, cost: 0.7, reseller: 1.2, delivery: "instant", time: "0-1 hour", features: ["Fast start", "Safe for For You page"], serviceId: "1003" },
    { platform: "tiktok", category: "comments", name: "TikTok Custom Comments", description: "Random positive comments or custom comments on request.", min: 10, max: 5000, price: 35, cost: 22, reseller: 28, delivery: "gradual", time: "1-12 hours", features: ["Custom text supported", "Natural pacing"], serviceId: "1004" },
    { platform: "instagram", category: "followers", name: "Instagram Followers — Premium", description: "Premium Instagram followers for personal brands and shops.", min: 100, max: 50000, price: 28, cost: 18, reseller: 22, delivery: "gradual", time: "0-12 hours", features: ["30-day refill", "Mixed quality"], serviceId: "2001" },
    { platform: "instagram", category: "likes", name: "Instagram Likes — Fast", description: "Likes for posts and reels with quick start.", min: 50, max: 100000, price: 6, cost: 3, reseller: 4.5, delivery: "instant", time: "0-20 minutes", features: ["Works on posts & reels"], serviceId: "2002" },
    { platform: "instagram", category: "views", name: "Instagram Reel Views", description: "Reel views to improve distribution.", min: 500, max: 500000, price: 2.4, cost: 1.0, reseller: 1.7, delivery: "instant", time: "0-1 hour", features: ["Reel optimized"], serviceId: "2003" },
    { platform: "instagram", category: "saves", name: "Instagram Saves", description: "Saves that help posts rank in Explore.", min: 50, max: 20000, price: 9, cost: 5, reseller: 7, delivery: "gradual", time: "1-6 hours", features: ["Explore-friendly"], serviceId: "2004" },
    { platform: "youtube", category: "subscribers", name: "YouTube Subscribers", description: "Channel subscribers with slow, natural delivery.", min: 50, max: 20000, price: 55, cost: 38, reseller: 45, delivery: "gradual", time: "1-3 days", features: ["Non-drop focused", "Channel URL required"], serviceId: "3001" },
    { platform: "youtube", category: "views", name: "YouTube Views — High Retention", description: "Views with stronger watch-time signals.", min: 500, max: 200000, price: 12, cost: 7.5, reseller: 9.5, delivery: "gradual", time: "0-24 hours", features: ["Ad-friendly sources"], serviceId: "3002" },
    { platform: "youtube", category: "watch-time", name: "YouTube Watch Time Hours", description: "Watch hours towards monetization goals.", min: 100, max: 4000, price: 90, cost: 62, reseller: 75, delivery: "gradual", time: "2-7 days", features: ["Hour-based delivery"], serviceId: "3003" },
    { platform: "youtube", category: "likes", name: "YouTube Likes", description: "Video likes for social proof.", min: 50, max: 50000, price: 8, cost: 4.5, reseller: 6, delivery: "instant", time: "0-2 hours", features: ["Fast start"], serviceId: "3004" },
    { platform: "facebook", category: "followers", name: "Facebook Page Followers", description: "Followers for Facebook pages.", min: 100, max: 50000, price: 16, cost: 10, reseller: 13, delivery: "gradual", time: "0-24 hours", features: ["Page URL required"], serviceId: "4001" },
    { platform: "facebook", category: "views", name: "Facebook Video Views", description: "Video and reel views on Facebook.", min: 500, max: 500000, price: 3.2, cost: 1.4, reseller: 2.2, delivery: "instant", time: "0-3 hours", features: ["Video URL required"], serviceId: "4002" },
    { platform: "facebook", category: "reactions", name: "Facebook Post Reactions", description: "Like, love and mix reactions.", min: 50, max: 20000, price: 7, cost: 3.8, reseller: 5.2, delivery: "gradual", time: "1-8 hours", features: ["Mixed reactions"], serviceId: "4003" },
    { platform: "x", category: "followers", name: "X Followers", description: "Followers for X / Twitter profiles.", min: 100, max: 30000, price: 22, cost: 14, reseller: 17, delivery: "gradual", time: "0-12 hours", features: ["Profile URL or @handle"], serviceId: "5001" },
    { platform: "x", category: "likes", name: "X Post Likes", description: "Likes for posts and threads.", min: 20, max: 50000, price: 5.5, cost: 2.8, reseller: 4, delivery: "instant", time: "0-1 hour", features: ["Tweet URL required"], serviceId: "5002" },
    { platform: "telegram", category: "followers", name: "Telegram Channel Members", description: "Members for public Telegram channels.", min: 100, max: 100000, price: 14, cost: 8, reseller: 11, delivery: "gradual", time: "0-12 hours", features: ["Public channel required"], serviceId: "6001" },
    { platform: "telegram", category: "views", name: "Telegram Post Views", description: "Views for channel posts.", min: 500, max: 1000000, price: 1.2, cost: 0.4, reseller: 0.8, delivery: "instant", time: "0-30 minutes", features: ["Post link required"], serviceId: "6002" },
    { platform: "spotify", category: "followers", name: "Spotify Followers", description: "Artist or playlist followers.", min: 50, max: 20000, price: 20, cost: 12, reseller: 16, delivery: "gradual", time: "1-2 days", features: ["Playlist or artist URL"], serviceId: "7001" },
    { platform: "spotify", category: "views", name: "Spotify Plays", description: "Track plays from real-looking listeners.", min: 500, max: 100000, price: 15, cost: 9, reseller: 12, delivery: "gradual", time: "1-3 days", features: ["Track URL required"], serviceId: "7002" },
  ];

  const productIds: string[] = [];
  for (const p of products) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO products (
        platform_id, category_id, provider_id, name, slug, description,
        min_quantity, max_quantity, price_per_1000, cost_per_1000, reseller_price_per_1000,
        status, delivery_type, avg_delivery_time, provider_service_id, features
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14,$15::jsonb)
      RETURNING id`,
      [
        platformIds[p.platform],
        categoryIds[p.category],
        provider!.id,
        p.name,
        makeSlug(p.name),
        p.description,
        p.min,
        p.max,
        p.price,
        p.cost,
        p.reseller,
        p.delivery,
        p.time,
        p.serviceId,
        JSON.stringify(p.features),
      ]
    );
    productIds.push(row!.id);
  }

  await query(
    `INSERT INTO payment_methods (code, name, description, adapter, is_enabled, sort_order, config) VALUES
     ('mock', 'Instant Demo Top-up', 'Credits the wallet immediately for demos and testing.', 'mock', TRUE, 1, '{}'),
     ('momo', 'Mobile Money', 'MTN, Vodafone and AirtelTigo manual confirmation.', 'manual', TRUE, 2, '{"network":"MTN Mobile Money","momoNumber":"024 000 0000"}'),
     ('paystack', 'Card / Paystack', 'Pay with card via Paystack. Add keys in settings to go live.', 'paystack', FALSE, 3, '{}')`
  );

  await query(
    `INSERT INTO settings (key, value) VALUES
     ('general', '{"siteName":"LinkWaveHub SMM","tagline":"Grow Your Social Presence With Powerful Social Media Services","supportEmail":"support@linkwavehub.com","contactPhone":"+233 00 000 0000","address":"Accra, Ghana","developer":"OB CodeLab","currency":"GHS","logoUrl":"","faviconUrl":""}'),
     ('payments', '{"autoApproveMock":true}'),
     ('orders', '{"autoProcessing":false,"maxPendingPerUser":20,"refundWindowHours":48}'),
     ('pricing', '{"customerMarkupPercent":0,"resellerMarkupPercent":15,"minimumProfitPer1000":0.5}'),
     ('notifications', '{"emailEnabled":false,"orderNotifications":true,"depositNotifications":true}'),
     ('affiliates', '{"enabled":true,"commissionPercent":7,"minimumPayout":10,"lifetime":true}'),
     ('resellers', '{"upgradeEnabled":true,"upgradeFee":200,"upgradeNote":"Pay the reseller / child panel fee by Mobile Money. After you pay, an admin confirms the payment and switches your dashboard to reseller."}')
     ON CONFLICT (key) DO NOTHING`
  );

  const statuses = ["pending", "processing", "in_progress", "completed", "completed", "completed", "partial", "cancelled", "failed", "refunded"] as const;
  const buyers = [customer!.id, extraIds[0], extraIds[1], extraIds[2], customer!.id];
  const now = Date.now();

  for (let i = 0; i < 24; i++) {
    const productIndex = i % productIds.length;
    const product = products[productIndex];
    const qty = product.min * (1 + (i % 5));
    const charge = Number(((product.price * qty) / 1000).toFixed(4));
    const cost = Number(((product.cost * qty) / 1000).toFixed(4));
    const status = statuses[i % statuses.length];
    const created = new Date(now - i * 36 * 60 * 60 * 1000);
    const publicId = `LWH-SEED-${String(1000 + i)}`;
    const userId = buyers[i % buyers.length];
    const isResellerOrder = i % 4 === 0;
    const order = await queryOne<{ id: string }>(
      `INSERT INTO orders (
        public_id, user_id, product_id, reseller_id, quantity, target, charge, cost, profit, reseller_profit, status, provider_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
      [
        publicId,
        userId,
        productIds[productIndex],
        isResellerOrder ? reseller!.id : null,
        qty,
        i % 2 === 0 ? "https://www.tiktok.com/@linkwavehub" : "https://instagram.com/linkwavehub",
        charge,
        cost,
        Number((charge - cost).toFixed(4)),
        isResellerOrder ? Number((charge * 0.12).toFixed(4)) : 0,
        status,
        provider!.id,
        created.toISOString(),
      ]
    );
    await query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, created_at) VALUES ($1, NULL, $2, $3)`,
      [order!.id, status, created.toISOString()]
    );
  }

  const wallets = await query<{ id: string; user_id: string; balance: string }>(`SELECT id, user_id, balance FROM wallets`);
  for (const w of wallets) {
    if (Number(w.balance) <= 0) continue;
    await query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description)
       VALUES ($1,$2,'deposit',$3,$3,$4,'Opening demo deposit')`,
      [w.id, w.user_id, w.balance, `PAY-SEED-${w.user_id.slice(0, 6)}`]
    );
  }

  await query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description)
     SELECT w.id, w.user_id, 'order_payment', -15.5, GREATEST(w.balance - 15.5, 0), 'LWH-SEED-1000', 'Order LWH-SEED-1000'
     FROM wallets w WHERE w.user_id = $1`,
    [customer!.id]
  );

  await query(
    `INSERT INTO support_tickets (public_id, user_id, subject, category, priority, status)
     VALUES ('TCK-1001', $1, 'Order still pending', 'orders', 'high', 'open'),
            ('TCK-1002', $2, 'How do reseller prices work?', 'billing', 'medium', 'pending')`,
    [customer!.id, resellerUser!.id]
  );
  const t1 = await queryOne<{ id: string }>(`SELECT id FROM support_tickets WHERE public_id = 'TCK-1001'`);
  await query(
    `INSERT INTO support_messages (ticket_id, user_id, message, is_staff)
     VALUES ($1, $2, 'Hi, my TikTok followers order has been pending for a few hours. Please check.', FALSE)`,
    [t1!.id, customer!.id]
  );

  await query(
    `INSERT INTO notifications (user_id, title, body, type) VALUES
     ($1, 'Welcome to LinkWaveHub', 'Your customer account is ready. Add funds and place your first order.', 'account'),
     ($2, 'Reseller approved', 'Demo Storefront is live. Share your storefront link with clients.', 'reseller'),
     (NULL, 'New order', 'A customer placed LWH-SEED-1000.', 'order')`,
    [customer!.id, resellerUser!.id]
  );

  await query(
    `INSERT INTO audit_logs (actor_id, action, target_type, details)
     VALUES ($1, 'admin.login', 'session', '{"source":"seed"}'),
            ($1, 'product.create', 'product', '{"source":"seed"}')`,
    [admin!.id]
  );

  console.log("Seed complete");
  console.log("  Admin     admin@linkwavehub.com / Admin@12345");
  console.log("  Reseller  reseller@linkwavehub.com / Reseller@12345");
  console.log("  Customer  customer@linkwavehub.com / Customer@12345");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(async () => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
