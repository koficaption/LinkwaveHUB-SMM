import { query, queryOne } from "../db.js";

export async function adminOverview() {
  const row = await queryOne<{
    total_users: string;
    total_customers: string;
    total_resellers: string;
    total_orders: string;
    pending_orders: string;
    completed_orders: string;
    failed_orders: string;
    total_revenue: string;
    total_profit: string;
    wallet_deposits: string;
    today_revenue: string;
    today_orders: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
      (SELECT COUNT(*) FROM users WHERE role = 'reseller') AS total_resellers,
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed') AS completed_orders,
      (SELECT COUNT(*) FROM orders WHERE status IN ('failed','cancelled')) AS failed_orders,
      (SELECT COALESCE(SUM(charge),0) FROM orders WHERE status NOT IN ('cancelled','refunded','failed')) AS total_revenue,
      (SELECT COALESCE(SUM(profit),0) FROM orders WHERE status NOT IN ('cancelled','refunded','failed')) AS total_profit,
      (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type = 'deposit') AS wallet_deposits,
      (SELECT COALESCE(SUM(charge),0) FROM orders WHERE created_at::date = CURRENT_DATE AND status NOT IN ('cancelled','refunded','failed')) AS today_revenue,
      (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE) AS today_orders
  `);
  return {
    totalUsers: Number(row?.total_users ?? 0),
    totalCustomers: Number(row?.total_customers ?? 0),
    totalResellers: Number(row?.total_resellers ?? 0),
    totalOrders: Number(row?.total_orders ?? 0),
    pendingOrders: Number(row?.pending_orders ?? 0),
    completedOrders: Number(row?.completed_orders ?? 0),
    failedOrders: Number(row?.failed_orders ?? 0),
    totalRevenue: Number(row?.total_revenue ?? 0),
    totalProfit: Number(row?.total_profit ?? 0),
    walletDeposits: Number(row?.wallet_deposits ?? 0),
    todayRevenue: Number(row?.today_revenue ?? 0),
    todayOrders: Number(row?.today_orders ?? 0),
  };
}

export async function revenueChart(range: "today" | "7d" | "30d" | "12m") {
  if (range === "today") {
    return query(
      `SELECT to_char(date_trunc('hour', created_at), 'HH24:00') AS label,
              COALESCE(SUM(charge),0)::float AS revenue,
              COUNT(*)::int AS orders
       FROM orders
       WHERE created_at >= CURRENT_DATE AND status NOT IN ('cancelled','refunded','failed')
       GROUP BY 1 ORDER BY 1`
    );
  }
  if (range === "12m") {
    return query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS label,
              COALESCE(SUM(charge),0)::float AS revenue,
              COUNT(*)::int AS orders
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '12 months' AND status NOT IN ('cancelled','refunded','failed')
       GROUP BY date_trunc('month', created_at)
       ORDER BY date_trunc('month', created_at)`
    );
  }
  const days = range === "7d" ? 7 : 30;
  return query(
    `SELECT to_char(d::date, 'Mon DD') AS label,
            COALESCE(SUM(o.charge),0)::float AS revenue,
            COUNT(o.id)::int AS orders
     FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day'::interval) d
     LEFT JOIN orders o ON o.created_at::date = d::date AND o.status NOT IN ('cancelled','refunded','failed')
     GROUP BY d ORDER BY d`,
    [days]
  );
}

export async function ordersByStatus() {
  return query(
    `SELECT status AS name, COUNT(*)::int AS value FROM orders GROUP BY status ORDER BY value DESC`
  );
}

export async function salesByPlatform() {
  return query(
    `SELECT pl.name, COALESCE(SUM(o.charge),0)::float AS revenue, COUNT(o.id)::int AS orders
     FROM platforms pl
     LEFT JOIN products p ON p.platform_id = pl.id
     LEFT JOIN orders o ON o.product_id = p.id AND o.status NOT IN ('cancelled','refunded','failed')
     GROUP BY pl.id, pl.name
     ORDER BY revenue DESC`
  );
}

export async function productPerformance() {
  const mostOrdered = await query(
    `SELECT p.name, COUNT(o.id)::int AS orders, COALESCE(SUM(o.charge),0)::float AS revenue, COALESCE(SUM(o.profit),0)::float AS profit
     FROM products p LEFT JOIN orders o ON o.product_id = p.id
     GROUP BY p.id, p.name ORDER BY orders DESC LIMIT 8`
  );
  const highestRevenue = [...mostOrdered].sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const highestProfit = [...mostOrdered].sort((a, b) => Number(b.profit) - Number(a.profit));
  const byRevenue = await query(
    `SELECT p.name, COUNT(o.id)::int AS orders, COALESCE(SUM(o.charge),0)::float AS revenue, COALESCE(SUM(o.profit),0)::float AS profit
     FROM products p LEFT JOIN orders o ON o.product_id = p.id
     GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 8`
  );
  const byProfit = await query(
    `SELECT p.name, COUNT(o.id)::int AS orders, COALESCE(SUM(o.charge),0)::float AS revenue, COALESCE(SUM(o.profit),0)::float AS profit
     FROM products p LEFT JOIN orders o ON o.product_id = p.id
     GROUP BY p.id, p.name ORDER BY profit DESC LIMIT 8`
  );
  return { mostOrdered, highestRevenue: byRevenue, highestProfit: byProfit };
}

export async function listAuditLogs(page = 1, limit = 40) {
  const offset = (Math.max(1, page) - 1) * limit;
  const count = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM audit_logs`);
  const items = await query(
    `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { items, total: Number(count?.count ?? 0), page, limit };
}
