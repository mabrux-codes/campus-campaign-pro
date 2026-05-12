export const SOCIAL_PLATFORMS = [
  "Instagram", "TikTok", "YouTube", "Facebook", "X (Twitter)", "LinkedIn", "Snapchat", "Threads", "Pinterest", "Twitch",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function handlePlaceholder(p: string) {
  switch (p) {
    case "Instagram": return "@handle or instagram.com/handle";
    case "TikTok": return "@handle or tiktok.com/@handle";
    case "YouTube": return "Channel URL or @handle";
    case "Facebook": return "Page URL";
    case "X (Twitter)": return "@handle or x.com/handle";
    case "LinkedIn": return "Profile URL";
    case "Snapchat": return "@username";
    case "Threads": return "@handle";
    case "Pinterest": return "pinterest.com/handle";
    case "Twitch": return "twitch.tv/handle";
    default: return "Handle or URL";
  }
}
