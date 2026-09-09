import {
  ArrowLeftRight,
  ArrowRight,
  AtSign,
  Captions,
  Crop,
  Gauge,
  Redo2,
  Repeat,
  Scissors,
  Undo2,
  Volume2,
  VolumeX,
  Bell,
  CalendarDays,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ClipboardPaste,
  CircleAlert,
  CircleCheckBig,
  CircleUserRound,
  Clock,
  DollarSign,
  Download,
  Eye,
  Flame,
  GripVertical,
  Heart,
  House,
  Image as ImageFrame,
  ImagePlus,
  Images,
  Inbox,
  KeyRound,
  LayoutList,
  Megaphone,
  Link,
  LogOut,
  MessageCircle,
  Mic,
  Music2,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Shuffle,
  Sparkles,
  SwitchCamera,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Trash2,
  Users,
  Video,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface GlyphProps {
  size: number;
  color: string;
  strokeWidth: number;
}

/** Lucide dropped brand marks in 1.x, so the Instagram glyph is drawn in the same stroke style. */
function InstagramGlyph({ size, color, strokeWidth }: GlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={2} y={2} width={20} height={20} rx={5} ry={5} />
      <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <Circle cx={17.5} cy={6.5} r={0.5} fill={color} />
    </Svg>
  );
}

const ICONS = {
  house: House,
  'layout-list': LayoutList,
  'chart-column': ChartColumn,
  'circle-user-round': CircleUserRound,
  bell: Bell,
  play: Play,
  pause: Pause,
  video: Video,
  image: ImageFrame,
  'image-plus': ImagePlus,
  images: Images,
  'clipboard-paste': ClipboardPaste,
  search: Search,
  'sliders-horizontal': SlidersHorizontal,
  mic: Mic,
  clock: Clock,
  'calendar-days': CalendarDays,
  camera: Camera,
  'rotate-ccw': RotateCcw,
  sparkles: Sparkles,
  check: Check,
  plus: Plus,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevrons-up-down': ChevronsUpDown,
  x: X,
  eye: Eye,
  flame: Flame,
  'grip-vertical': GripVertical,
  megaphone: Megaphone,
  heart: Heart,
  zap: Zap,
  'zap-off': ZapOff,
  users: Users,
  inbox: Inbox,
  'key-round': KeyRound,
  'message-circle': MessageCircle,
  'share-2': Share2,
  shuffle: Shuffle,
  'thumbs-up': ThumbsUp,
  'thumbs-down': ThumbsDown,
  'trending-up': TrendingUp,
  link: Link,
  'dollar-sign': DollarSign,
  download: Download,
  pencil: Pencil,
  palette: Palette,
  send: Send,
  'switch-camera': SwitchCamera,
  'circle-check-big': CircleCheckBig,
  'circle-alert': CircleAlert,
  'trash-2': Trash2,
  'log-out': LogOut,
  settings: Settings,
  'at-sign': AtSign,
  instagram: InstagramGlyph,
  /** TikTok stand-in */
  'music-2': Music2,
  captions: Captions,
  crop: Crop,
  gauge: Gauge,
  'redo-2': Redo2,
  repeat: Repeat,
  scissors: Scissors,
  'undo-2': Undo2,
  'volume-2': Volume2,
  'volume-x': VolumeX,
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
