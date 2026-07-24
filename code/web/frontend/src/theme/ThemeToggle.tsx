import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const ICON: Record<ThemeMode, typeof IconSun> = {
  system: IconDeviceDesktop,
  dark: IconMoon,
  light: IconSun,
};
const LABEL: Record<ThemeMode, string> = { system: "시스템", dark: "다크", light: "라이트" };

/** system → dark → light 순환. Tabler 아이콘 전용(하드룰). */
export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = ICON[mode];
  return (
    <button
      type="button"
      onClick={cycle}
      title={`테마: ${LABEL[mode]} (클릭해 전환)`}
      aria-label={`테마 ${LABEL[mode]}, 클릭해 전환`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-fg hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon size={16} stroke={1.75} />
      <span className="mono text-sm">{LABEL[mode]}</span>
    </button>
  );
}
