import webPush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import User from '../models/User.js';

export async function deliverPush(io, userId, conversationId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const user = await User.findById(userId).select('preferences');
  if (!user?.preferences?.pushNotifications || user.preferences.mutedConversations.some(id => String(id) === String(conversationId))) return;
  const activeSockets = await io.in(`conversation:${conversationId}`).fetchSockets();
  if (activeSockets.some(socket => socket.userId === String(userId))) return;
  try {
    webPush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } catch (error) {
    console.error('Push configuration is invalid:', error.message);
    return;
  }
  const subscriptions = await PushSubscription.find({ userId });
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload), { TTL: 60 });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await subscription.deleteOne();
      else console.error('Push delivery failed:', error.message);
    }
  }));
}
