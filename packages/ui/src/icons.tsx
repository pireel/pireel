import {
  ArrowRight,
  Box,
  CheckIcon,
  Clapperboard,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Code2,
  Copy,
  Download,
  FileText,
  Filter,
  Flame,
  Folder,
  History,
  Home,
  Image as LucideImage,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Link2,
  Mic2,
  Music2,
  Paperclip,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  Video,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function makeIcon(Inner: LucideIcon, defaultStrokeWidth = 1.6) {
  return function Icon({ size = 16, strokeWidth, ...p }: IconProps) {
    return (
      <Inner
        size={size}
        strokeWidth={strokeWidth ?? defaultStrokeWidth}
        {...(p as React.ComponentProps<LucideIcon>)}
      />
    );
  };
}

export const IconHome = makeIcon(Home);
export const IconSkill = makeIcon(Box);
export const IconSop = makeIcon(Workflow);
export const IconRun = makeIcon(Play);
export const IconHistory = makeIcon(History);
export const IconSearch = makeIcon(Search);
export const IconPlus = makeIcon(Plus);
export const IconChevDown = makeIcon(ChevronDown);
export const IconChevRight = makeIcon(ChevronRight);
export const IconArrowRight = makeIcon(ArrowRight);
export const IconPlay = makeIcon(Play);
export const IconSparkle = makeIcon(Sparkles);
export const IconAsset = makeIcon(Folder);
export const IconTemplate = makeIcon(LayoutTemplate);
export const IconLibrary = makeIcon(LayoutGrid);
export const IconLayoutDashboard = makeIcon(LayoutDashboard);
export const IconLayoutGrid = makeIcon(LayoutGrid);
export const IconSettings = makeIcon(Settings);
export const IconTeam = makeIcon(Users);
export const IconBilling = makeIcon(CreditCard);
export const IconFilter = makeIcon(Filter);
export const IconFlame = makeIcon(Flame);
export const IconDownload = makeIcon(Download);
export const IconRefresh = makeIcon(RefreshCw);
export const IconClose = makeIcon(X, 1.8);
export const IconCheck = makeIcon(CheckIcon, 2);
export const IconCode = makeIcon(Code2);
export const IconShare = makeIcon(Share2);
export const IconCopy = makeIcon(Copy);
export const IconLink = makeIcon(Link2);
export const IconTrash = makeIcon(Trash2);
export const IconImage = makeIcon(LucideImage);
export const IconVideo = makeIcon(Video);
export const IconClip = makeIcon(Clapperboard);
export const IconBatch = makeIcon(LayoutGrid);

// Newly added for emoji → SVG migration.
export const IconAudio = makeIcon(Music2);
export const IconMic = makeIcon(Mic2);
export const IconPin = makeIcon(Pin);
export const IconAttach = makeIcon(Paperclip);
export const IconWarn = makeIcon(TriangleAlert);
export const IconEdit = makeIcon(Pencil);
export const IconDoc = makeIcon(FileText);
