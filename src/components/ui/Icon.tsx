import {
  Bot,
  CheckCircle2,
  Circle,
  Code2,
  GitBranch,
  Globe,
  LogOut,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Variable,
  Workflow,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

import type { IconName } from "@/workflow/types";

/**
 * Single mapping from registry icon names to lucide components.
 * Adding a new icon = add an `IconName` literal in types.ts and a row here.
 */
const ICONS: Record<IconName, LucideIcon> = {
  sparkles: Sparkles,
  bot: Bot,
  globe: Globe,
  "code-2": Code2,
  send: Send,
  "shield-check": ShieldCheck,
  "git-branch": GitBranch,
  workflow: Workflow,
  variable: Variable,
  "log-out": LogOut,
  "check-circle-2": CheckCircle2,
  user: User,
  play: Play,
  circle: Circle,
};

interface IconProps extends LucideProps {
  name: IconName;
}

export function Icon({ name, ...rest }: IconProps) {
  const Cmp = ICONS[name] ?? Circle;
  return <Cmp {...rest} />;
}
