import {
  Tag, Briefcase, MessageSquare, Repeat, Handshake, RotateCcw, Percent, Landmark, PiggyBank, PlusCircle, Users, Monitor, Megaphone,
  FileBadge, Scale, Building, Plane, Utensils, CreditCard, Receipt, Shield, Wifi, Laptop, GraduationCap, Wallet, MoreHorizontal,
  Car, Gift, Heart, Home, ShoppingBag, Coffee, Phone, Globe, Truck, Zap, type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  tag: Tag,
  briefcase: Briefcase,
  "message-square": MessageSquare,
  repeat: Repeat,
  handshake: Handshake,
  "rotate-ccw": RotateCcw,
  percent: Percent,
  landmark: Landmark,
  "piggy-bank": PiggyBank,
  "plus-circle": PlusCircle,
  users: Users,
  monitor: Monitor,
  megaphone: Megaphone,
  "file-badge": FileBadge,
  scale: Scale,
  building: Building,
  plane: Plane,
  utensils: Utensils,
  "credit-card": CreditCard,
  receipt: Receipt,
  shield: Shield,
  wifi: Wifi,
  laptop: Laptop,
  "graduation-cap": GraduationCap,
  wallet: Wallet,
  "more-horizontal": MoreHorizontal,
  car: Car,
  gift: Gift,
  heart: Heart,
  home: Home,
  "shopping-bag": ShoppingBag,
  coffee: Coffee,
  phone: Phone,
  globe: Globe,
  truck: Truck,
  zap: Zap,
};

export const ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function iconFor(name: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[name ?? ""] ?? Tag;
}

export const CATEGORY_COLORS = ["#2f7a5c", "#3f8f6e", "#7fb59b", "#4fa3a8", "#6fb0c4", "#5b84b1", "#8e7cc3", "#a67c9e", "#c96f5b", "#b85c50", "#e08a3c", "#e0b15a", "#c9a227", "#a9b35a", "#b58863", "#94a39b"];
