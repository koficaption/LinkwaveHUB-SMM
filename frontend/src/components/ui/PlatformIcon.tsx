import {
  Bell, Bookmark, Clock, Eye, Facebook, Heart, Instagram, MessageCircle, Music, Music2,
  Send, Share2, Smile, Twitter, UserPlus, Youtube, Globe, type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  Music2, Instagram, Youtube, Facebook, Twitter, Send, Music, Heart, Eye,
  MessageCircle, Share2, Bell, Clock, Bookmark, Smile, UserPlus, Globe,
};

export function PlatformIcon({ name, className, color }: { name?: string | null; className?: string; color?: string }) {
  const Icon = (name && map[name]) || Globe;
  return <Icon className={className} style={color ? { color } : undefined} />;
}
