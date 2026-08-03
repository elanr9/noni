import {
  ArrowRight,
  AtSign,
  Bell,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheckBig,
  CircleUserRound,
  Clock,
  DollarSign,
  Eye,
  Flame,
  House,
  Images,
  Inbox,
  LayoutList,
  Link,
  LogOut,
  MessageCircle,
  Mic,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Trash2,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react-native';

const ICONS = {
  house: House,
  'layout-list': LayoutList,
  'chart-column': ChartColumn,
  'circle-user-round': CircleUserRound,
  bell: Bell,
  play: Play,
  pause: Pause,
  video: Video,
  images: Images,
  mic: Mic,
  clock: Clock,
  'calendar-days': CalendarDays,
  'rotate-ccw': RotateCcw,
  sparkles: Sparkles,
  check: Check,
  plus: Plus,
  'arrow-right': ArrowRight,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  x: X,
  eye: Eye,
  flame: Flame,
  zap: Zap,
  users: Users,
  inbox: Inbox,
  'message-circle': MessageCircle,
  'share-2': Share2,
  'thumbs-up': ThumbsUp,
  'thumbs-down': ThumbsDown,
  'trending-up': TrendingUp,
  link: Link,
  'dollar-sign': DollarSign,
  'circle-check-big': CircleCheckBig,
  'circle-alert': CircleAlert,
  'trash-2': Trash2,
  'log-out': LogOut,
  settings: Settings,
  /** Instagram stand-in */
  'at-sign': AtSign,
  /** TikTok stand-in */
  'music-2': Music2,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size: number;
  color: string;
  strokeWidth?: number;
}

export function Icon({ name, size, color, strokeWidth = 2 }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
