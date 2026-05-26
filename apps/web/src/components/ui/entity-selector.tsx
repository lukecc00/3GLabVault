"use client";

import { useId, useMemo, useState } from "react";
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

const toneStyles: Record<
  EntitySelectorTone,
  {
    selectedCard: string;
    selectedIndicator: string;
    selectedBadge: string;
    filterActive: string;
    summaryButton: string;
  }
> = {
  sky: {
    selectedCard: "border-sky-400/30 bg-sky-400/10",
    selectedIndicator: "border-sky-300 bg-sky-300",
    selectedBadge: "border-sky-400/25 bg-sky-400/10 text-sky-100",
    filterActive: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    summaryButton: "border-sky-400/25 bg-sky-400/10 text-sky-100",
  },
  emerald: {
    selectedCard: "border-emerald-400/30 bg-emerald-400/10",
    selectedIndicator: "border-emerald-300 bg-emerald-300",
    selectedBadge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    filterActive: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    summaryButton: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  },
  amber: {
    selectedCard: "border-amber-400/35 bg-amber-400/10",
    selectedIndicator: "border-amber-300 bg-amber-300",
    selectedBadge: "border-amber-400/25 bg-amber-400/10 text-amber-100",
    filterActive: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    summaryButton: "border-amber-400/25 bg-amber-400/10 text-amber-100",
  },
  neutral: {
    selectedCard: "border-white/20 bg-white/8",
    selectedIndicator: "border-white/70 bg-white/70",
    selectedBadge: "border-white/15 bg-white/8 text-slate-100",
    filterActive: "border-white/20 bg-white/8 text-slate-100",
    summaryButton: "border-white/15 bg-white/8 text-slate-100",
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
  className?: string;
  listClassName?: string;
  disabled?: boolean;
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
  className,
  listClassName,
  disabled = false,
}: EntitySelectorProps) {
  const inputId = useId();
  const radioName = useId();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

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

  const selectedItems = selectedIds
    .map((id) => selectedItemMap.get(id))
    .filter((item): item is EntitySelectorOption => Boolean(item));

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

  return (
    <section className={cn("app-panel-muted p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-50">{title}</div>
          {description ? (
            <p className="mt-2 max-w-[58ch] text-xs leading-6 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        <div className="text-xs text-slate-400">
          {filteredItems.length}/{items.length}
        </div>
      </div>

      <label htmlFor={inputId} className="mt-4 block text-sm">
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
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            disabled={disabled}
            className={cn(
              "rounded-full border px-3 py-2 text-xs transition-colors duration-200",
              resolvedFilter === "all"
                ? styles.filterActive
                : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/5",
            )}
          >
            全部
          </button>
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              disabled={disabled}
              className={cn(
                "rounded-full border px-3 py-2 text-xs transition-colors duration-200",
                resolvedFilter === filter.id
                  ? styles.filterActive
                  : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/5",
              )}
            >
              {filter.label}
              <span className="ml-2 tabular-nums text-slate-400">{filter.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={cn("mt-4 max-h-80 space-y-4 overflow-y-auto pr-1", listClassName)}>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
            {emptyMessage}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
            {noResultsMessage}
          </div>
        ) : (
          groupedItems.map(([section, sectionItems]) => (
            <div key={section}>
              {section !== "默认分组" ? (
                <div className="mb-2 text-xs uppercase text-slate-500">{section}</div>
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
                          : "border-white/8 bg-white/3 hover:bg-white/5",
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
                          <div className="truncate text-sm font-medium text-slate-50">
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
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                        {item.description ? (
                          <div className="mt-1 text-xs leading-6 text-slate-400">
                            {item.description}
                          </div>
                        ) : null}
                        {item.filterTags && item.filterTags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.filterTags.map((tag) => (
                              <span
                                key={`${item.id}-${tag.id}`}
                                className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400"
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

      <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
        <div className="text-xs uppercase text-slate-500">{selectedTitle}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleSelection(item.id)}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors duration-200",
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
              </button>
            ))
          ) : (
            <span className="text-sm text-slate-400">{selectedEmptyLabel}</span>
          )}
        </div>
      </div>
    </section>
  );
}
