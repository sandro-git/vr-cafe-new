import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function notifyNewReservation({
  title,
  body,
  url,
}: {
  title: string;
  body: string;
  url: string;
}) {
  const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
  const privateVapidKey = process.env.PRIVATE_VAPID_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;

  if (!publicVapidKey || !privateVapidKey || !vapidEmail) {
    console.error("Missing VAPID env vars");
    return;
  }

  webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);

  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (error || !subscriptions?.length) return;

  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Expired subscription — remove it
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("Push send error:", err);
        }
      }
    })
  );
}
