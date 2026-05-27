"use client";

import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "./theme-provider";

const themeOptions: Array<{
  value: ThemeMode;
  label: string;
  icon: (className?: string) => React.JSX.Element;
}> = [
  { value: "system", label: "系统", icon: MonitorIcon },
  { value: "light", label: "日间", icon: SunIcon },
  { value: "dark", label: "夜间", icon: MoonIcon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("app-theme-toggle", className)}>
      <div className="app-segmented-control" role="group" aria-label="主题设置">
        {themeOptions.map((option) => {
          const isActive = theme === option.value;
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className={cn("app-segmented-control-button", isActive && "is-active")}
              onClick={() => setTheme(option.value)}
            >
              <span className="app-theme-button-icon" aria-hidden="true">
                <Icon className={cn("app-theme-icon", isActive && "is-active")} />
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M20.2 15.1A8.6 8.6 0 1 1 12.9 3.8a7.1 7.1 0 0 0 7.3 11.3Z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.5" />
      <path d="M8.5 19.5h7M12 16.25v3.25" />
    </svg>
  );
}
