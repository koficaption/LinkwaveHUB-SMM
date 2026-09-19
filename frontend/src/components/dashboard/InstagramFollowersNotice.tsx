import { isInstagramFollowers } from "@/utils/instagramNotice";

export function InstagramFollowersNotice({
  product,
}: {
  product?: {
    name?: string | null;
    platform_name?: string | null;
    category_name?: string | null;
  } | null;
}) {
  if (!isInstagramFollowers(product)) return null;
  return (
    <div className="rounded-2xl bg-slate-900 px-4 py-4 text-sm leading-relaxed text-white dark:bg-black">
      <p className="font-extrabold uppercase tracking-wide">Important update for Instagram Followers</p>
      <p className="mt-2">
        Disable the <strong>Flag for review</strong> feature on your Instagram profile settings for follower orders.
      </p>
      <p className="mt-2 text-slate-200">
        ⚙️ Go to: <strong>Settings and privacy → Follow and invite friends → Turn off Flag for review</strong>.
        If it stays on, new followers can land on a review list and you must approve them one by one.
      </p>
    </div>
  );
}
