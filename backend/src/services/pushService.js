const env = require('../config/env');
const logger = require('../utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Sends one push notification via Expo's push API. Best-effort, like
// mailService — a failed or skipped push never blocks the caller
// (creating the in-app Notification row, which is the source of truth;
// push is a convenience delivery channel on top of it). No-ops cleanly
// when the recipient has no registered pushToken, which is the common
// case for any account that hasn't opened the mobile app on a device
// with notifications configured.
const sendPush = async (pushToken, { title, message, data }) => {
  if (!pushToken) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.pushNotificationKey && { Authorization: `Bearer ${env.pushNotificationKey}` }),
      },
      body: JSON.stringify({ to: pushToken, title, body: message, data, sound: 'default' }),
    });

    if (!res.ok) {
      logger.error('Expo push request failed', { status: res.status });
      return;
    }

    const payload = await res.json();
    if (payload?.data?.status === 'error') {
      logger.error('Expo push rejected the token', { message: payload.data.message });
    }
  } catch (err) {
    logger.error('Expo push send failed', { message: err.message });
  }
};

module.exports = { sendPush };
