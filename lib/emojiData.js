// Shared emoji set for the chat composer and reaction pickers.
// Categorised so a long list stays scannable -- a flat grid of 100+
// is harder to use than a short one.

export const EMOJI_CATEGORIES = [
  {
    key: "reactions",
    label: "Reactions",
    emojis: ["👍", "👎", "❤️", "🔥", "🎉", "👏", "🙏", "💯", "✅", "❌", "👀", "⚠️"],
  },
  {
    key: "smileys",
    label: "Smileys",
    emojis: [
      "😀", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊",
      "😍", "😘", "😋", "😎", "🤩", "🥳", "🤗", "🤔", "🤨", "😐",
      "😴", "😪", "😌", "😔", "😕", "🙁", "😢", "😭", "😤", "😠",
      "😰", "😱", "🤯", "😬", "🙄", "😏", "🤐", "🤢", "🤕", "😇",
    ],
  },
  {
    key: "people",
    label: "People",
    emojis: [
      "👋", "🤝", "✌️", "🤞", "👌", "🤙", "💪", "🫡", "🙌", "🤲",
      "🧑‍💻", "👨‍💼", "👩‍💼", "🧑‍🎨", "🕵️", "🤵", "💁", "🙋", "🤦", "🤷",
    ],
  },
  {
    key: "work",
    label: "Work",
    emojis: [
      "💼", "📁", "📂", "📄", "📝", "📊", "📈", "📉", "📌", "📎",
      "🗓️", "⏰", "⏳", "🔔", "🔍", "🔗", "🖥️", "💻", "📱", "🖨️",
      "✏️", "🖊️", "📢", "📣", "💡", "🔧", "⚙️", "🚀", "🎯", "🏆",
    ],
  },
  {
    key: "objects",
    label: "Objects & Symbols",
    emojis: [
      "💰", "💳", "🧾", "📦", "🎁", "☕", "🍕", "🎧", "📷", "🔒",
      "🔑", "⭐", "🌟", "✨", "💥", "❗", "❓", "➕", "➖", "🔴",
      "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟥", "🟩", "🟦",
    ],
  },
];

// The small set shown on the hover reaction bar before "more" is
// opened -- the ones people reach for most.
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];
