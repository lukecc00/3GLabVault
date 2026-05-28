"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

export interface EntitySelectorTag {
  id: string;
  label: string;
}

export interface EntitySelectorOption {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  badges?: string[];
  filterTags?: EntitySelectorTag[];
  section?: string;
}

type EntitySelectorTone = "sky" | "emerald" | "amber" | "neutral";
type EntitySelectorVariant = "panel" | "floating";

const toneStyles: Record<
  EntitySelectorTone,
  {
    selectedCard: string;
    selectedIndicator: string;
    selectedBadge: string;
    filterActive: string;
    summaryButton: string;
    triggerSurface: string;
    triggerCount: string;
  }
> = {
  sky: {
    selectedCard: "border-sky-400/30 bg-sky-400/10",
    selectedIndicator: "border-sky-300 bg-sky-300",
    selectedBadge: "border-sky-400/25 bg-sky-400/10 text-[var(--accent-strong)]",
    filterActive: "border-sky-400/30 bg-sky-400/10 text-[var(--accent-strong)]",
    summaryButton: "border-sky-400/25 bg-sky-400/10 text-[var(--accent-strong)]",
    triggerSurface:
      "border-sky-400/20 bg-sky-400/[0.07] hover:border-sky-300/30 hover:bg-sky-400/[0.11]",
    triggerCount: "border-sky-400/25 bg-sky-400/10 text-[var(--accent-strong)]",
  },
  emerald: {
    selectedCard: "border-emerald-400/30 bg-emerald-400/10",
    selectedIndicator: "border-emerald-300 bg-emerald-300",
    selectedBadge: "border-emerald-400/25 bg-emerald-400/10 text-[var(--success-strong)]",
    filterActive: "border-emerald-400/30 bg-emerald-400/10 text-[var(--success-strong)]",
    summaryButton: "border-emerald-400/25 bg-emerald-400/10 text-[var(--success-strong)]",
    triggerSurface:
      "border-emerald-400/20 bg-emerald-400/[0.07] hover:border-emerald-300/30 hover:bg-emerald-400/[0.11]",
    triggerCount: "border-emerald-400/25 bg-emerald-400/10 text-[var(--success-strong)]",
  },
  amber: {
    selectedCard: "border-amber-400/35 bg-amber-400/10",
    selectedIndicator: "border-amber-300 bg-amber-300",
    selectedBadge: "border-amber-400/25 bg-amber-400/10 text-[var(--warning-strong)]",
    filterActive: "border-amber-400/30 bg-amber-400/10 text-[var(--warning-strong)]",
    summaryButton: "border-amber-400/25 bg-amber-400/10 text-[var(--warning-strong)]",
    triggerSurface:
      "border-amber-400/20 bg-amber-400/[0.07] hover:border-amber-300/30 hover:bg-amber-400/[0.11]",
    triggerCount: "border-amber-400/25 bg-amber-400/10 text-[var(--warning-strong)]",
  },
  neutral: {
    selectedCard: "border-border bg-surface-soft",
    selectedIndicator: "border-foreground-subtle bg-foreground-subtle",
    selectedBadge: "border-border bg-surface-soft text-foreground-strong",
    filterActive: "border-border bg-surface-soft text-foreground-strong",
    summaryButton: "border-border bg-surface-soft text-foreground-strong",
    triggerSurface:
      "border-border-soft bg-surface-soft hover:border-border hover:bg-surface-soft",
    triggerCount: "border-border bg-surface-soft text-foreground-strong",
  },
};

interface EntitySelectorProps {
  title: string;
  description?: string;
  items: EntitySelectorOption[];
  selectedIds: string[];
  onSelectionChange: (nextSelectedIds: string[]) => void;
  selectionMode?: "single" | "multiple";
  searchPlaceholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  selectedTitle?: string;
  selectedEmptyLabel?: string;
  tone?: EntitySelectorTone;
  variant?: EntitySelectorVariant;
  floatingLayout?: "card" | "inline" | "toolbar";
  floatingActionLabel?: string;
  floatingSummaryClassName?: string;
  floatingSummaryMaxItems?: number;
  className?: string;
  listClassName?: string;
  disabled?: boolean;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function buildFloatingSummary(
  selectedItems: EntitySelectorOption[],
  selectedEmptyLabel: string,
  maxItems: number,
) {
  if (selectedItems.length === 0) {
    return selectedEmptyLabel;
  }

  const labels = selectedItems.slice(0, maxItems).map((item) => item.label);
  const overflowCount = selectedItems.length - labels.length;

  return overflowCount > 0
    ? `${labels.join("、")} +${overflowCount}`
    : labels.join("、");
}

interface EntitySelectorListProps {
  title: string;
  inputId: string;
  radioName: string;
  items: EntitySelectorOption[];
  filteredItems: EntitySelectorOption[];
  groupedItems: Array<[string, EntitySelectorOption[]]>;
  filters: Array<{ id: string; label: string; count: number }>;
  resolvedFilter: string;
  styles: (typeof toneStyles)[EntitySelectorTone];
  selectionMode: "single" | "multiple";
  disabled: boolean;
  emptyMessage: string;
  noResultsMessage: string;
  query: string;
  searchPlaceholder: string;
  listClassName?: string;
  selectedIds: string[];
  setQuery: (value: string) => void;
  setActiveFilter: (value: string) => void;
  toggleSelection: (id: string) => void;
}

function EntitySelectorList({
  title,
  inputId,
  radioName,
  items,
  filteredItems,
  groupedItems,
  filters,
  resolvedFilter,
  styles,
  selectionMode,
  disabled,
  emptyMessage,
  noResultsMessage,
  query,
  searchPlaceholder,
  listClassName,
  selectedIds,
  setQuery,
  setActiveFilter,
  toggleSelection,
}: EntitySelectorListProps) {
  return (
    <>
      <label htmlFor={inputId} className="block text-sm">
        <span className="sr-only">{`${title}搜索`}</span>
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="app-input"
          placeholder={searchPlaceholder}
          disabled={disabled}
        />
      </label>

      {filters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <ChipButton
            type="button"
            onClick={() => setActiveFilter("all")}
            disabled={disabled}
            className={resolvedFilter === "all" ? styles.filterActive : "text-foreground-muted"}
          >
            全部
          </ChipButton>
          {filters.map((filter) => (
            <ChipButton
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              disabled={disabled}
              className={resolvedFilter === filter.id ? styles.filterActive : "text-foreground-muted"}
            >
              {filter.label}
              <span className="ml-2 tabular-nums text-foreground-soft">{filter.count}</span>
            </ChipButton>
          ))}
        </div>
      ) : null}

      <div className={cn("mt-4 max-h-80 space-y-4 overflow-y-auto pr-1", listClassName)}>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-sm text-foreground-soft">
            {emptyMessage}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-sm text-foreground-soft">
            {noResultsMessage}
          </div>
        ) : (
          groupedItems.map(([section, sectionItems]) => (
            <div key={section}>
              {section !== "默认分组" ? (
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-foreground-subtle">
                  {section}
                </div>
              ) : null}
              <div className="space-y-2">
                {sectionItems.map((item) => {
                  const checked = selectedIds.includes(item.id);

                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition-colors duration-200",
                        checked
                          ? styles.selectedCard
                          : "border-border-soft bg-surface hover:bg-surface-soft",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type={selectionMode === "single" ? "radio" : "checkbox"}
                        name={selectionMode === "single" ? radioName : undefined}
                        checked={checked}
                        onChange={() => toggleSelection(item.id)}
                        className="mt-1"
                        disabled={disabled}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground-strong">
                            {item.label}
                          </div>
                          {checked ? (
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                styles.selectedBadge,
                              )}
                            >
                              已选择
                            </span>
                          ) : null}
                          {item.badges?.map((badge) => (
                            <span
                              key={badge}
                              className="rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-foreground-muted"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                        {item.description ? (
                          <div className="mt-1 text-xs leading-6 text-foreground-soft">
                            {item.description}
                          </div>
                        ) : null}
                        {item.filterTags && item.filterTags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.filterTags.map((tag) => (
                              <span
                                key={`${item.id}-${tag.id}`}
                                className="rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-foreground-soft"
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function EntitySelector({
  title,
  description,
  items,
  selectedIds,
  onSelectionChange,
  selectionMode = "multiple",
  searchPlaceholder = "搜索名称、邮箱、编码或标签",
  emptyMessage = "暂无可选项",
  noResultsMessage = "没有匹配结果，试试更换搜索词或筛选条件",
  selectedTitle = "已选项",
  selectedEmptyLabel = "暂未选择任何内容",
  tone = "sky",
  variant = "panel",
  floatingLayout = "card",
  floatingActionLabel = "管理",
  floatingSummaryClassName,
  floatingSummaryMaxItems = 2,
  className,
  listClassName,
  disabled = false,
}: EntitySelectorProps) {
  const inputId = useId();
  const dialogId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const radioName = useId();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const styles = toneStyles[tone];

  const filters = useMemo(() => {
    const filterMap = new Map<string, { id: string; label: string; count: number }>();

    for (const item of items) {
      for (const tag of item.filterTags ?? []) {
        const existing = filterMap.get(tag.id);
        if (existing) {
          existing.count += 1;
        } else {
          filterMap.set(tag.id, { ...tag, count: 1 });
        }
      }
    }

    return Array.from(filterMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "zh-CN"),
    );
  }, [items]);

  const resolvedFilter = filters.some((filter) => filter.id === activeFilter)
    ? activeFilter
    : "all";

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          item.label,
          item.description,
          ...(item.keywords ?? []),
          ...(item.badges ?? []),
          ...(item.filterTags?.map((tag) => tag.label) ?? []),
          item.section,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesFilter =
        resolvedFilter === "all" ||
        (item.filterTags ?? []).some((tag) => tag.id === resolvedFilter);

      return matchesQuery && matchesFilter;
    });
  }, [items, normalizedQuery, resolvedFilter]);

  const groupedItems = useMemo(() => {
    const sectionMap = new Map<string, EntitySelectorOption[]>();

    for (const item of filteredItems) {
      const key = item.section?.trim() || "默认分组";
      if (!sectionMap.has(key)) {
        sectionMap.set(key, []);
      }
      sectionMap.get(key)?.push(item);
    }

    return Array.from(sectionMap.entries());
  }, [filteredItems]);

  const selectedItemMap = useMemo(() => {
    return new Map(items.map((item) => [item.id, item] as const));
  }, [items]);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => selectedItemMap.get(id))
        .filter((item): item is EntitySelectorOption => Boolean(item)),
    [selectedIds, selectedItemMap],
  );

  const floatingSummary = buildFloatingSummary(
    selectedItems,
    selectedEmptyLabel,
    floatingSummaryMaxItems,
  );

  function toggleSelection(id: string) {
    if (disabled) {
      return;
    }

    if (selectionMode === "single") {
      onSelectionChange(selectedIds.includes(id) ? [] : [id]);
      return;
    }

    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  useEffect(() => {
    if (variant !== "floating" || !open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (!containerRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(containerRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusableElements.indexOf(
        document.activeElement as HTMLElement,
      );

      if (event.shiftKey) {
        const previousIndex =
          currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        focusableElements[previousIndex]?.focus();
        event.preventDefault();
        return;
      }

      const nextIndex =
        currentIndex === -1 || currentIndex === focusableElements.length - 1
          ? 0
          : currentIndex + 1;
      focusableElements[nextIndex]?.focus();
      event.preventDefault();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousActiveElementRef.current?.focus();
    };
  }, [open, variant]);

  if (variant === "floating") {
    return (
      <>
        {floatingLayout === "inline" ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            className={cn(
              "w-full rounded-[24px] border px-4 py-4 text-left transition-all duration-200",
              styles.triggerSurface,
              disabled && "cursor-not-allowed opacity-60",
              className,
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? dialogId : undefined}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="text-sm font-medium text-foreground-strong">{title}</div>
                  <div className="text-xs tabular-nums text-foreground-soft">
                    {selectedItems.length}/{items.length}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedItems.length > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        styles.triggerCount,
                      )}
                    >
                      {selectedItems.length} 项
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border-soft px-3 py-1.5 text-xs text-foreground-strong">
                    {floatingActionLabel}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    "line-clamp-3 min-h-[5.25rem] text-sm leading-7 text-foreground-strong",
                    floatingSummaryClassName,
                  )}
                >
                  {floatingSummary}
                </div>
                {description ? (
                  <div className="mt-2 line-clamp-1 text-xs leading-5 text-foreground-soft">
                    {description}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
        ) : floatingLayout === "toolbar" ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            className={cn(
              "flex h-11 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left transition-all duration-200",
              styles.triggerSurface,
              disabled && "cursor-not-allowed opacity-60",
              className,
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? dialogId : undefined}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground-strong">
                {floatingSummary}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedItems.length > 0 ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    styles.triggerCount,
                  )}
                >
                  {selectedItems.length}
                </span>
              ) : null}
              <span className="text-xs text-foreground-soft">{floatingActionLabel}</span>
            </div>
          </button>
        ) : (
          <section className={cn("app-panel-muted p-4", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground-strong">{title}</div>
                {description ? (
                  <p className="mt-2 max-w-[58ch] text-xs leading-6 text-foreground-soft">
                    {description}
                  </p>
                ) : null}
              </div>
              <div className="text-xs tabular-nums text-foreground-soft">
                {selectedItems.length}/{items.length}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={disabled}
              className={cn(
                "mt-4 flex w-full items-start justify-between gap-4 rounded-[24px] border px-4 py-4 text-left transition-all duration-200",
                styles.triggerSurface,
                disabled && "cursor-not-allowed opacity-60",
              )}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? dialogId : undefined}
            >
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                  {selectedTitle}
                </div>
                <div className="mt-2 line-clamp-2 text-sm leading-6 text-foreground-strong">
                  {floatingSummary}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedItems.length > 0 ? (
                  <div
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
                      styles.triggerCount,
                    )}
                  >
                    {selectedItems.length} 项
                  </div>
                ) : null}
                <span className="rounded-full border border-border-soft px-3 py-1.5 text-xs text-foreground-strong">
                  {floatingActionLabel}
                </span>
              </div>
            </button>
          </section>
        )}

        {open ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              id={dialogId}
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              aria-describedby={description ? dialogDescriptionId : undefined}
              className="mx-auto flex min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-border-soft bg-surface shadow-2xl max-h-[calc(100dvh-3rem)]"
            >
              <div className="border-b border-border-soft px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="app-eyebrow app-eyebrow-neutral">选择器</div>
                    <h2
                      id={dialogTitleId}
                      className="mt-4 text-2xl font-semibold text-balance text-foreground-strong"
                    >
                      {title}
                    </h2>
                    {description ? (
                      <p
                        id={dialogDescriptionId}
                        className="mt-3 max-w-[62ch] text-sm leading-7 text-foreground-muted"
                      >
                        {description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    onClick={() => setOpen(false)}
                    variant="secondary"
                  >
                    完成
                  </Button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.75fr)]">
                <div className="flex min-h-0 flex-col border-b border-border-soft px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
                  <label htmlFor={inputId} className="block text-sm">
                    <span className="sr-only">{`${title}搜索`}</span>
                    <input
                      id={inputId}
                      ref={inputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="app-input"
                      placeholder={searchPlaceholder}
                      disabled={disabled}
                    />
                  </label>

                  {filters.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ChipButton
                        type="button"
                        onClick={() => setActiveFilter("all")}
                        disabled={disabled}
                        className={
                          resolvedFilter === "all" ? styles.filterActive : "text-foreground-muted"
                        }
                      >
                        全部
                      </ChipButton>
                      {filters.map((filter) => (
                        <ChipButton
                          key={filter.id}
                          type="button"
                          onClick={() => setActiveFilter(filter.id)}
                          disabled={disabled}
                          className={
                            resolvedFilter === filter.id
                              ? styles.filterActive
                              : "text-foreground-muted"
                          }
                        >
                          {filter.label}
                          <span className="ml-2 tabular-nums text-foreground-soft">
                            {filter.count}
                          </span>
                        </ChipButton>
                      ))}
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1",
                      listClassName,
                    )}
                  >
                    {items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-sm text-foreground-soft">
                        {emptyMessage}
                      </div>
                    ) : filteredItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-sm text-foreground-soft">
                        {noResultsMessage}
                      </div>
                    ) : (
                      groupedItems.map(([section, sectionItems]) => (
                        <div key={section}>
                          {section !== "默认分组" ? (
                            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-foreground-subtle">
                              {section}
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            {sectionItems.map((item) => {
                              const checked = selectedIds.includes(item.id);

                              return (
                                <label
                                  key={item.id}
                                  className={cn(
                                    "flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition-colors duration-200",
                                    checked
                                      ? styles.selectedCard
                                      : "border-border-soft bg-surface hover:bg-surface-soft",
                                    disabled && "cursor-not-allowed opacity-60",
                                  )}
                                >
                                  <input
                                    type={
                                      selectionMode === "single" ? "radio" : "checkbox"
                                    }
                                    name={
                                      selectionMode === "single" ? radioName : undefined
                                    }
                                    checked={checked}
                                    onChange={() => toggleSelection(item.id)}
                                    className="mt-1"
                                    disabled={disabled}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="truncate text-sm font-medium text-foreground-strong">
                                        {item.label}
                                      </div>
                                      {checked ? (
                                        <span
                                          className={cn(
                                            "rounded-full border px-2 py-0.5 text-[11px]",
                                            styles.selectedBadge,
                                          )}
                                        >
                                          已选择
                                        </span>
                                      ) : null}
                                      {item.badges?.map((badge) => (
                                        <span
                                          key={badge}
                                          className="rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-foreground-muted"
                                        >
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                    {item.description ? (
                                      <div className="mt-1 text-xs leading-6 text-foreground-soft">
                                        {item.description}
                                      </div>
                                    ) : null}
                                    {item.filterTags && item.filterTags.length > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {item.filterTags.map((tag) => (
                                          <span
                                            key={`${item.id}-${tag.id}`}
                                            className="rounded-full border border-border-soft px-2 py-0.5 text-[11px] text-foreground-soft"
                                          >
                                            {tag.label}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <aside className="flex min-h-0 flex-col px-5 py-5 lg:px-6">
                  <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-border-soft bg-surface p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                          {selectedTitle}
                        </div>
                        <div className="mt-2 text-sm text-foreground-muted">
                          {selectedItems.length > 0
                            ? `已选择 ${selectedItems.length} 项`
                            : selectedEmptyLabel}
                        </div>
                      </div>
                      {selectedItems.length > 0 ? (
                        <ChipButton
                          type="button"
                          onClick={() => onSelectionChange([])}
                          className="text-foreground-muted"
                        >
                          清空
                        </ChipButton>
                      ) : null}
                    </div>

                    <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pb-4 pr-1">
                      {selectedItems.length > 0 ? (
                        selectedItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleSelection(item.id)}
                            disabled={disabled}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition-colors duration-200",
                              styles.summaryButton,
                            )}
                            aria-label={`移除 ${item.label}`}
                          >
                            <span className="truncate">{item.label}</span>
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full border",
                                styles.selectedIndicator,
                              )}
                            />
                          </button>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-sm text-foreground-soft">
                          暂未选择任何内容，左侧搜索后即可加入。
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className={cn("app-panel-muted p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground-strong">{title}</div>
          {description ? (
            <p className="mt-2 max-w-[58ch] text-xs leading-6 text-foreground-soft">
              {description}
            </p>
          ) : null}
        </div>
        <div className="text-xs text-foreground-soft">
          {filteredItems.length}/{items.length}
        </div>
      </div>

      <EntitySelectorList
        title={title}
        inputId={inputId}
        radioName={radioName}
        items={items}
        filteredItems={filteredItems}
        groupedItems={groupedItems}
        filters={filters}
        resolvedFilter={resolvedFilter}
        styles={styles}
        selectionMode={selectionMode}
        disabled={disabled}
        emptyMessage={emptyMessage}
        noResultsMessage={noResultsMessage}
        query={query}
        searchPlaceholder={searchPlaceholder}
        listClassName={listClassName}
        selectedIds={selectedIds}
        setQuery={setQuery}
        setActiveFilter={setActiveFilter}
        toggleSelection={toggleSelection}
      />

      <div className="mt-4 rounded-2xl border border-border-soft bg-surface px-4 py-3 shadow-[var(--shadow-panel-muted)]">
        <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">
          {selectedTitle}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <ChipButton
                key={item.id}
                type="button"
                onClick={() => toggleSelection(item.id)}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-2",
                  styles.summaryButton,
                )}
                aria-label={`移除 ${item.label}`}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "size-1.5 rounded-full border",
                    styles.selectedIndicator,
                  )}
                />
              </ChipButton>
            ))
          ) : (
            <span className="text-sm text-foreground-soft">{selectedEmptyLabel}</span>
          )}
        </div>
      </div>
    </section>
  );
}
