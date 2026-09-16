// Formats a timestamp as a short relative string ("12 sec ago", "3 min
// ago") for the Live Map's "last updated" indicator (§11 of the product
// spec). Deliberately coarse — this is a glance-at-a-marker label, not a
// precise clock.
export const timeAgo = (timestamp) => {
  if (!timestamp) return 'never';

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
