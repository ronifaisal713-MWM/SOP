// Relative timestamps for notifications and activity feeds -- "5m ago"
// reads faster than a full date when scanning a list.
export function timeAgo(dateString) {
  if (!dateString) return "";

  const then = new Date(dateString).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);

  // Clock drift between browser and server can make a fresh row look
  // slightly in the future -- treat anything near-zero as "just now"
  // rather than showing a negative age.
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateString).toLocaleDateString();
}
