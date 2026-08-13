import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

const localUrl = process.env.DATABASE_URL || "";
const liveUrl = process.env.LIVE_DATABASE_URL || process.argv[2] || "";

function isRemote(url: string) {
  return Boolean(url) && !/(@|\/\/)(127\.0\.0\.1|localhost)\b/i.test(url);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  if (!localUrl) throw new Error("DATABASE_URL is missing (local source database).");
  if (!liveUrl) {
    throw new Error(
      "Pass the hosted Postgres URI as LIVE_DATABASE_URL or the first argument.\n" +
        "Create a project at https://supabase.com/dashboard then copy Settings → Database → URI."
    );
  }
  if (!isRemote(liveUrl)) {
    throw new Error("LIVE_DATABASE_URL must be a hosted database, not localhost.");
  }

  console.log("1/2 Applying migrations on the live database…");
  await run("npm", ["run", "migrate"], { DATABASE_URL: liveUrl });

  console.log("2/2 Copying local data (users, catalog, wallets, settings) to live…");
  await new Promise<void>((resolve, reject) => {
    const copy = spawn(
      "bash",
      [
        "-lc",
        `set -o pipefail
         {
           printf '%s\\n' "BEGIN;" "SET session_replication_role = replica;" \\
             "TRUNCATE TABLE affiliate_commissions, audit_logs, notifications, order_items, order_status_history, orders, payments, reseller_products, reseller_applications, support_messages, support_tickets, wallet_transactions, wallets, products, platform_categories, categories, platforms, payment_methods, providers, resellers, password_reset_tokens, users, settings RESTART IDENTITY CASCADE;"
           pg_dump "$LOCAL_URL" --data-only --no-owner --no-acl --exclude-table=schema_migrations
           printf '%s\\n' "COMMIT;"
         } | psql "$LIVE_URL" -v ON_ERROR_STOP=1 -q`,
      ],
      {
        env: {
          ...process.env,
          LOCAL_URL: localUrl,
          LIVE_URL: liveUrl,
          PGSSLMODE: "require",
        },
        stdio: "inherit",
      }
    );
    copy.on("error", reject);
    copy.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`data copy exited with ${code}`));
    });
  });

  console.log("Live database is ready.");
  console.log("Set DATABASE_URL in .env to the same hosted URI, keep ENCRYPTION_KEY unchanged (provider keys), then restart the API.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
