"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { type TooltipHintAlign, TooltipHint } from "@/components/ui/tooltip-hint";
import { ApiError, requestApi } from "@/lib/api";
import { hydrateAuthorizedImages } from "@/lib/authorized-images";
import type { KnowledgeImageUploadResult } from "@/lib/contracts";
import { isKnowledgeAssetImageUrl, renderMarkdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "split" | "preview";

type ShortcutItem = {
  label: string;
  shortcut: string;
  note?: string;
};

type ColorOption = {
  label: string;
  value: string;
  previewClassName: string;
};

type SourceSelection = {
  start: number;
  end: number;
};

type SourceInsertOptions = {
  start?: number;
  end?: number;
  fallbackToEnd?: boolean;
};

const COLOR_SHORTCUT = "Cmd/Ctrl + Shift + E";

const TOOLBAR_SHORTCUTS = {
  bold: "Cmd/Ctrl + B",
  italic: "Cmd/Ctrl + I",
  underline: "Cmd/Ctrl + U",
  heading1: "Alt + 1",
  heading2: "Alt + 2",
  heading3: "Alt + 3",
  bulletList: "Cmd/Ctrl + Shift + 8",
  orderedList: "Cmd/Ctrl + Shift + 7",
  blockquote: "Cmd/Ctrl + Shift + .",
  codeBlock: "Cmd/Ctrl + Alt + C",
  inlineCode: "Win: Ctrl + Shift + C / Mac: Ctrl + Cmd + C",
  link: "Cmd/Ctrl + K",
  imageUrl: "Cmd/Ctrl + Shift + K",
  localImage: "Cmd/Ctrl + Shift + I",
  todoList: "Cmd/Ctrl + Alt + T",
  compareTable: "Cmd/Ctrl + Shift + T",
  hintBlock: "Cmd/Ctrl + Shift + H",
  divider: "Cmd/Ctrl + Alt + S",
  color: COLOR_SHORTCUT,
  undo: "Cmd/Ctrl + Z",
  redo: "Shift + Cmd/Ctrl + Z",
  clear: "Cmd/Ctrl + \\",
} as const;

type ToolbarShortcutHintProps = {
  label: string;
  shortcut: string;
  children: ReactNode;
  disabled?: boolean;
  align?: TooltipHintAlign;
};

function ToolbarShortcutHint({
  label,
  shortcut,
  children,
  disabled = false,
  align = "center",
}: ToolbarShortcutHintProps) {
  return (
    <TooltipHint
      align={align}
      focusable={disabled}
      ariaLabel={disabled ? `${label}，快捷键 ${shortcut}` : undefined}
      content={
        <>
          <span className="block font-medium text-white">{label}</span>
          <span className="block text-slate-300">快捷键 {shortcut}</span>
        </>
      }
    >
      {children}
    </TooltipHint>
  );
}

const COLOR_OPTIONS: ColorOption[] = [
  { label: "默认", value: "", previewClassName: "bg-slate-400/70" },
  { label: "蓝色", value: "#0ea5e9", previewClassName: "bg-sky-400" },
  { label: "绿色", value: "#10b981", previewClassName: "bg-emerald-400" },
  { label: "黄色", value: "#d97706", previewClassName: "bg-amber-400" },
  { label: "红色", value: "#f43f5e", previewClassName: "bg-rose-400" },
  { label: "紫色", value: "#8b5cf6", previewClassName: "bg-violet-400" },
];

const COLOR_CLASS_MAP: Record<string, string> = {
  "#0ea5e9": "md-color-sky",
  "rgb(14, 165, 233)": "md-color-sky",
  "#10b981": "md-color-emerald",
  "rgb(16, 185, 129)": "md-color-emerald",
  "#d97706": "md-color-amber",
  "rgb(217, 119, 6)": "md-color-amber",
  "#f43f5e": "md-color-rose",
  "rgb(244, 63, 94)": "md-color-rose",
  "#8b5cf6": "md-color-violet",
  "rgb(139, 92, 246)": "md-color-violet",
};

const SHORTCUT_GROUPS: Array<{ title: string; items: ShortcutItem[] }> = [
  {
    title: "飞书一致",
    items: [
      { label: "查看快捷键", shortcut: "Cmd/Ctrl + /" },
      { label: "加粗", shortcut: "Cmd/Ctrl + B" },
      { label: "斜体", shortcut: "Cmd/Ctrl + I" },
      { label: "链接", shortcut: "Cmd/Ctrl + K" },
      { label: "行内代码", shortcut: "Win: Ctrl + Shift + C / Mac: Ctrl + Cmd + C" },
      { label: "文字颜色", shortcut: COLOR_SHORTCUT, note: "打开颜色菜单后按 0-5 选择" },
      { label: "H1 / H2 / H3", shortcut: "Alt + 1/2/3", note: "同时兼容 Cmd/Ctrl + Alt + 1/2/3" },
      { label: "无序列表", shortcut: "Cmd/Ctrl + Shift + 8" },
      { label: "有序列表", shortcut: "Cmd/Ctrl + Shift + 7" },
      { label: "引用", shortcut: "Cmd/Ctrl + Shift + ." },
      { label: "代码块", shortcut: "Cmd/Ctrl + Alt + C" },
      { label: "待办清单", shortcut: "Cmd/Ctrl + Alt + T" },
      { label: "分隔线", shortcut: "Cmd/Ctrl + Alt + S" },
      { label: "撤销 / 重做", shortcut: "Cmd/Ctrl + Z / Shift + Cmd/Ctrl + Z" },
    ],
  },
  {
    title: "项目扩展",
    items: [
      { label: "图片链接", shortcut: "Cmd/Ctrl + Shift + K" },
      { label: "本地图片", shortcut: "Cmd/Ctrl + Shift + I" },
      { label: "对比表格", shortcut: "Cmd/Ctrl + Shift + T" },
      { label: "提示块", shortcut: "Cmd/Ctrl + Shift + H" },
    ],
  },
  {
    title: "Markdown 直输",
    items: [
      { label: "H1 / H2 / H3", shortcut: "# / ## / ### + Space" },
      { label: "无序列表", shortcut: "- + Space 或 * + Space" },
      { label: "有序列表", shortcut: "1. + Space" },
      { label: "待办清单", shortcut: "[] + Space" },
      { label: "引用", shortcut: "> + Space" },
      { label: "行内代码", shortcut: "`文本`" },
      { label: "代码块", shortcut: "``` + Space" },
      { label: "分隔线", shortcut: "--- 或 ***" },
      { label: "颜色文本", shortcut: "<span class=\"md-color-sky\">文本</span>" },
    ],
  },
];

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

turndown.use(gfm);

function cleanMarkdownAttribute(attribute: string | null) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, "\n").trim() : "";
}

function escapeMarkdownImageAlt(value: string) {
  return value.replace(/([\\[\]`*_])/g, "\\$1");
}

function escapeMarkdownLinkDestination(destination: string) {
  const escaped = destination.replace(/([<>()])/g, "\\$1");
  return escaped.includes(" ") ? `<${escaped}>` : escaped;
}

function escapeMarkdownLinkTitle(title: string) {
  return title.replace(/"/g, '\\"');
}

turndown.addRule("underlineTag", {
  filter: ["u"],
  replacement(content) {
    return `<u>${content}</u>`;
  },
});

turndown.addRule("knowledgeImage", {
  filter: ["img"],
  replacement(_content, node) {
    const element = node as HTMLElement;
    const canonicalSource = cleanMarkdownAttribute(element.getAttribute("data-auth-src"));
    const renderedSource = cleanMarkdownAttribute(element.getAttribute("src"));
    const source = canonicalSource || renderedSource;

    if (!source) {
      return "";
    }

    const resolvedSource =
      canonicalSource && isKnowledgeAssetImageUrl(canonicalSource)
        ? canonicalSource
        : source;
    const alt = escapeMarkdownImageAlt(cleanMarkdownAttribute(element.getAttribute("alt")));
    const title = cleanMarkdownAttribute(element.getAttribute("title"));
    const titlePart = title ? ` "${escapeMarkdownLinkTitle(title)}"` : "";

    return `![${alt}](${escapeMarkdownLinkDestination(resolvedSource)}${titlePart})`;
  },
});

turndown.addRule("colorSpan", {
  filter(node) {
    const element = node as HTMLElement;

    return (
      node.nodeName === "SPAN" &&
      (
        (typeof element.className === "string" && element.className.includes("md-color-")) ||
        typeof element.style?.color === "string"
      )
    );
  },
  replacement(content, node) {
    const element = node as HTMLElement;
    const className = element.className
      .split(/\s+/)
      .find((value) => value.startsWith("md-color-"));
    const styleColor = element.style?.color?.trim().toLowerCase();
    const normalizedClassName = styleColor ? COLOR_CLASS_MAP[styleColor] : undefined;

    if (!className) {
      if (!normalizedClassName) {
        return content;
      }

      return `<span class="${normalizedClassName}">${content}</span>`;
    }

    return `<span class="${className}">${content}</span>`;
  },
});

turndown.addRule("fencedCodeBlockWithLanguage", {
  filter(node) {
    const element = node as HTMLElement;
    const codeElement = element.firstElementChild as HTMLElement | null;

    return (
      node.nodeName === "PRE" &&
      codeElement?.nodeName === "CODE"
    );
  },
  replacement(_content, node) {
    const element = node as HTMLElement;
    const codeElement = element.firstElementChild as HTMLElement | null;
    const className = codeElement?.className ?? "";
    const language =
      className
        .split(/\s+/)
        .find((value) => value.startsWith("language-"))
        ?.replace("language-", "") ?? "";
    const code = codeElement?.textContent?.replace(/\n$/, "") ?? "";

    return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  },
});

function isPrimaryModifier(event: { metaKey: boolean; ctrlKey: boolean }) {
  return event.metaKey || event.ctrlKey;
}

function isMacInlineCodeShortcut(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}) {
  return (
    event.key.toLowerCase() === "c" &&
    event.metaKey &&
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function estimateReadMinutes(markdown: string) {
  const wordCount = markdown
    .replace(/[`*_#[\]()!>\-|]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(wordCount / 220));
}

function buildEditorSnapshot(markdown: string, rawJson: unknown) {
  const normalized = markdown.replace(/\r\n/g, "\n");

  return {
    schema: "knowledge-wysiwyg-editor",
    version: 3,
    lineCount: normalized ? normalized.split("\n").length : 0,
    characterCount: normalized.length,
    updatedAt: new Date().toISOString(),
    document: rawJson,
  };
}

function normalizeSourceSelection(
  sourceValue: string,
  selection: SourceSelection | null,
  options: SourceInsertOptions = {},
) {
  if (selection) {
    return selection;
  }

  if (
    typeof options.start === "number" &&
    typeof options.end === "number"
  ) {
    return {
      start: options.start,
      end: options.end,
    };
  }

  const position = options.fallbackToEnd ? sourceValue.length : 0;

  return {
    start: position,
    end: position,
  };
}

export function KnowledgeEditor({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string;
  onChange: (payload: { markdown: string; rawJson: unknown }) => void;
}) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<EditorMode>("visual");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const sourceValue = value || "";
  const initialHtml = useMemo(
    () =>
      renderMarkdownToHtml(sourceValue, {
        useAuthorizedImagePlaceholder: false,
        mode: "editor",
      }),
    [sourceValue],
  );
  const characterCount = sourceValue.length;
  const lineCount = sourceValue ? sourceValue.split(/\r?\n/).length : 0;
  const readMinutes = estimateReadMinutes(sourceValue);

  function emitMarkdown(nextMarkdown: string, selection?: SourceSelection) {
    onChange({
      markdown: nextMarkdown,
      rawJson: buildEditorSnapshot(nextMarkdown, editor?.getJSON() ?? null),
    });

    if (!selection) {
      return;
    }

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
    });
  }

  function insertIntoSource(
    builder: (selection: SourceSelection) => {
      markdown: string;
      selection: SourceSelection;
      feedback?: string | null;
    },
    options: SourceInsertOptions = {},
  ) {
    const selection = normalizeSourceSelection(
      sourceValue,
      textareaRef.current
        ? {
            start: textareaRef.current.selectionStart,
            end: textareaRef.current.selectionEnd,
          }
        : null,
      options,
    );
    const next = builder(selection);

    emitMarkdown(next.markdown, next.selection);
    setFeedback(next.feedback ?? null);
  }

  function wrapSource(before: string, after = before, placeholder = "内容") {
    insertIntoSource((selection) => {
      const selected = sourceValue.slice(selection.start, selection.end);
      const content = selected || placeholder;
      const markdown =
        sourceValue.slice(0, selection.start) +
        before +
        content +
        after +
        sourceValue.slice(selection.end);
      const start = selection.start + before.length;

      return {
        markdown,
        selection: {
          start,
          end: start + content.length,
        },
      };
    });
  }

  function prefixSourceLines(prefix: string, placeholder: string) {
    insertIntoSource((selection) => {
      const selected = sourceValue.slice(selection.start, selection.end);

      if (!selected) {
        const snippet = `${prefix}${placeholder}`;
        const markdown =
          sourceValue.slice(0, selection.start) +
          snippet +
          sourceValue.slice(selection.end);

        return {
          markdown,
          selection: {
            start: selection.start + prefix.length,
            end: selection.start + snippet.length,
          },
        };
      }

      const prefixed = selected
        .split("\n")
        .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
        .join("\n");
      const markdown =
        sourceValue.slice(0, selection.start) +
        prefixed +
        sourceValue.slice(selection.end);

      return {
        markdown,
        selection: {
          start: selection.start,
          end: selection.start + prefixed.length,
        },
      };
    });
  }

  function insertSourceBlock(template: string, options: SourceInsertOptions = {}) {
    insertIntoSource((selection) => {
      const prefix =
        selection.start > 0 && !sourceValue.slice(0, selection.start).endsWith("\n")
          ? "\n"
          : "";
      const suffix =
        selection.end < sourceValue.length &&
        !sourceValue.slice(selection.end).startsWith("\n")
          ? "\n"
          : "";
      const markdown =
        sourceValue.slice(0, selection.start) +
        prefix +
        template +
        suffix +
        sourceValue.slice(selection.end);
      const caret = selection.start + prefix.length + template.length;

      return {
        markdown,
        selection: {
          start: caret,
          end: caret,
        },
      };
    }, options);
  }

  function openShortcutDialog() {
    setShortcutDialogOpen(true);
    setFeedback("已打开快捷键说明。");
  }

  function toggleColorMenu() {
    setColorMenuOpen((current) => !current);
    setFeedback("颜色面板已打开，可直接点选颜色，也可继续按 0-5 直接选择。");
  }

  function applySourceColor(color: string) {
    if (!color) {
      setFeedback("默认颜色请直接使用普通文本，或删除已有颜色标记。");
      setColorMenuOpen(false);
      return;
    }

    const colorClassName = COLOR_CLASS_MAP[color.toLowerCase()];

    if (!colorClassName) {
      setFeedback("当前颜色暂不支持写入源码。");
      setColorMenuOpen(false);
      return;
    }

    wrapSource(`<span class="${colorClassName}">`, "</span>", "强调文本");
    setFeedback("已插入文字颜色。");
    setColorMenuOpen(false);
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: false,
        underline: false,
        blockquote: {
          HTMLAttributes: {
            class: "md-blockquote",
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: "md-list-disc",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "md-list-decimal",
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: "language-plaintext",
          },
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
      Placeholder.configure({
        placeholder: "直接开始写内容，正文会按最终样式实时呈现。",
      }),
      TextStyle,
      Color,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "markdown-content knowledge-editor-prosemirror min-h-[560px] max-w-none px-5 py-5 outline-none",
      },
      handleKeyDown(_view, event) {
        const key = event.key.toLowerCase();
        const hasPrimaryModifier = isPrimaryModifier(event);

        if (
          hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          key === "/"
        ) {
          event.preventDefault();
          openShortcutDialog();
          return true;
        }

        if (!editor) {
          return false;
        }

        if (colorMenuOpen && /^[0-5]$/.test(key)) {
          event.preventDefault();
          const option = COLOR_OPTIONS[Number(key)];

          if (option) {
            if (option.value) {
              editor.chain().focus().setColor(option.value).run();
              setFeedback(`已应用${option.label}文字。`);
            } else {
              editor.chain().focus().unsetColor().run();
              setFeedback("已恢复默认文字颜色。");
            }
          }

          setColorMenuOpen(false);
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "e") {
          event.preventDefault();
          toggleColorMenu();
          return true;
        }

        if (
          key === "1" &&
          ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
        ) {
          event.preventDefault();
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          return true;
        }

        if (
          key === "2" &&
          ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
        ) {
          event.preventDefault();
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          return true;
        }

        if (
          key === "3" &&
          ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
        ) {
          event.preventDefault();
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "8") {
          event.preventDefault();
          editor.chain().focus().toggleBulletList().run();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "7") {
          event.preventDefault();
          editor.chain().focus().toggleOrderedList().run();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === ".") {
          event.preventDefault();
          editor.chain().focus().toggleBlockquote().run();
          return true;
        }

        if (
          (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && key === "c") ||
          isMacInlineCodeShortcut(event)
        ) {
          event.preventDefault();
          editor.chain().focus().toggleCode().run();
          return true;
        }

        if (hasPrimaryModifier && event.altKey && key === "c") {
          event.preventDefault();
          insertCodeBlock();
          return true;
        }

        if (hasPrimaryModifier && event.altKey && key === "t") {
          event.preventDefault();
          editor.chain().focus().toggleTaskList().run();
          return true;
        }

        if (hasPrimaryModifier && event.altKey && key === "s") {
          event.preventDefault();
          editor.chain().focus().setHorizontalRule().run();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "k") {
          event.preventDefault();
          insertImageByUrl();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "i") {
          event.preventDefault();
          fileInputRef.current?.click();
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "t") {
          event.preventDefault();
          editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
          setFeedback("已插入对比表格。");
          return true;
        }

        if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "h") {
          event.preventDefault();
          editor
            .chain()
            .focus()
            .insertContent("<blockquote><p><strong>提示：</strong> 在这里写下重点说明。</p></blockquote>")
            .run();
          setFeedback("已插入提示块。");
          return true;
        }

        return false;
      },
    },
    onUpdate({ editor }) {
      const markdown = turndown.turndown(editor.getHTML());
      const rawDocument = editor.getJSON();

      onChange({
        markdown,
        rawJson: buildEditorSnapshot(markdown, rawDocument),
      });
    },
    immediatelyRender: false,
  });

  const activeEditorColor =
    typeof editor?.getAttributes("textStyle").color === "string"
      ? (editor?.getAttributes("textStyle").color as string)
      : "";
  const activeColorOption =
    COLOR_OPTIONS.find((option) =>
      mode === "split" ? option.value === "" : option.value === activeEditorColor,
    ) ?? COLOR_OPTIONS[0];

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentMarkdown = turndown.turndown(editor.getHTML()).trim();
    const incomingMarkdown = (value || "").trim();

    if (currentMarkdown === incomingMarkdown) {
      return;
    }

    editor.commands.setContent(initialHtml, { emitUpdate: false });
  }, [editor, initialHtml, value]);

  useEffect(() => {
    if (mode !== "visual") {
      return;
    }

    const container = editor?.view.dom;

    if (!(container instanceof HTMLElement)) {
      return;
    }

    let cleanup: (() => void) | undefined;
    const frameId = window.requestAnimationFrame(() => {
      cleanup = hydrateAuthorizedImages(container);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, [editor, mode, value]);

  function withEditor(action: () => void) {
    if (!editor) {
      return;
    }

    action();
    setFeedback(null);
  }

  function applyEditorColor(color: string) {
    if (!editor) {
      return;
    }

    if (!color) {
      editor.chain().focus().unsetColor().run();
      setFeedback("已恢复默认文字颜色。");
      setColorMenuOpen(false);
      return;
    }

    editor.chain().focus().setColor(color).run();
    setFeedback("已应用文字颜色。");
    setColorMenuOpen(false);
  }

  function insertLink() {
    if (mode === "split") {
      const url = window.prompt("输入链接地址", "https://");

      if (!url) {
        return;
      }

      wrapSource("[", `](${url.trim()})`, "链接文本");
      setFeedback("已插入链接。");
      return;
    }

    if (!editor) {
      return;
    }

    const url = window.prompt("输入链接地址", "https://");

    if (!url) {
      return;
    }

    const trimmedUrl = url.trim();

    if (editor.state.selection.empty) {
      const label = window.prompt("输入链接文本", "链接文本") || "链接文本";
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${trimmedUrl}">${label}</a>`)
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmedUrl }).run();
    }

    setFeedback("已插入链接。");
  }

  function insertImageByUrl() {
    const url = window.prompt("输入图片地址", "https://");

    if (!url) {
      return;
    }

    const alt = window.prompt("输入图片说明", "图片") || "图片";

    if (mode === "split") {
      insertSourceBlock(`![${alt.trim() || "图片"}](${url.trim()})`);
      setFeedback("已插入图片地址。");
      return;
    }

    if (!editor) {
      return;
    }

    editor.chain().focus().setImage({ src: url.trim(), alt: alt.trim() || "图片" }).run();
    setFeedback("已插入图片地址。");
  }

  function insertCodeBlock() {
    const language = (
      window.prompt("输入代码语言，例如 ts、tsx、python、bash", "ts") || "plaintext"
    ).trim();
    const code = window.prompt("输入代码内容", "// 在这里输入代码") || "// 在这里输入代码";

    if (mode === "split") {
      insertSourceBlock(`\`\`\`${language}\n${code}\n\`\`\``);
      setFeedback(`已插入 ${language || "plaintext"} 代码块。`);
      return;
    }

    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(
        `<pre><code class="language-${language || "plaintext"}">${code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</code></pre>`,
      )
      .run();
    setFeedback(`已插入 ${language || "plaintext"} 代码块。`);
  }

  async function handleLocalImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFeedback("只能插入图片文件。");
      event.target.value = "";
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setFeedback("单张图片请控制在 3MB 以内，上传后会自动做保真压缩。");
      event.target.value = "";
      return;
    }

    setIsUploadingImage(true);
    setFeedback("正在上传并压缩图片...");

    try {
      const formData = new FormData();
      formData.set("spaceId", spaceId);
      formData.set("file", file);

      const uploadedImage = await requestApi<KnowledgeImageUploadResult>(
        "/knowledge/pages/images",
        {
          method: "POST",
          body: formData,
        },
      );
      const alt = file.name.replace(/\.[^.]+$/, "") || "图片";

      if (mode === "split") {
        insertSourceBlock(`![${alt}](${uploadedImage.url})`);
      } else {
        if (!editor) {
          setFeedback("编辑器尚未准备好，请重试。");
          event.target.value = "";
          return;
        }

        editor.chain().focus().setImage({ src: uploadedImage.url, alt }).run();
      }

      setFeedback("图片已上传到 MinIO，并以资源地址插入正文。");
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : "图片上传失败，请重试。",
      );
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  function insertHintBlock() {
    if (mode === "split") {
      insertSourceBlock("> 提示\n>\n> 在这里写下重点说明。");
      setFeedback("已插入提示块。");
      return;
    }

    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent("<blockquote><p><strong>提示：</strong> 在这里写下重点说明。</p></blockquote>")
      .run();
    setFeedback("已插入提示块。");
  }

  function insertCompareTable() {
    if (mode === "split") {
      insertSourceBlock(
        "| 功能 | 说明 |\n| --- | --- |\n| 左侧能力 | 对应描述 |\n| 右侧能力 | 对应描述 |",
      );
      setFeedback("已插入对比表格。");
      return;
    }

    if (!editor) {
      return;
    }

    editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
    setFeedback("已插入对比表格。");
  }

  function insertTodoList() {
    if (mode === "split") {
      insertSourceBlock("- [ ] 第一项\n- [ ] 第二项\n- [x] 已完成");
      setFeedback("已插入待办清单。");
      return;
    }

    if (!editor) {
      return;
    }

    editor.chain().focus().toggleTaskList().run();
    setFeedback("已切换为待办清单。");
  }

  function handleSourceKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const key = event.key.toLowerCase();
    const hasPrimaryModifier = isPrimaryModifier(event);

    if (hasPrimaryModifier && !event.altKey && !event.shiftKey && key === "/") {
      event.preventDefault();
      openShortcutDialog();
      return;
    }

    if (colorMenuOpen && /^[0-5]$/.test(key)) {
      event.preventDefault();
      const option = COLOR_OPTIONS[Number(key)];

      if (option) {
        applySourceColor(option.value);
      }

      setColorMenuOpen(false);
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "e") {
      event.preventDefault();
      toggleColorMenu();
      return;
    }

    if (hasPrimaryModifier && !event.shiftKey && !event.altKey && key === "b") {
      event.preventDefault();
      wrapSource("**", "**", "加粗文本");
      return;
    }

    if (hasPrimaryModifier && !event.shiftKey && !event.altKey && key === "i") {
      event.preventDefault();
      wrapSource("*", "*", "斜体文本");
      return;
    }

    if (hasPrimaryModifier && !event.shiftKey && !event.altKey && key === "k") {
      event.preventDefault();
      insertLink();
      return;
    }

    if (
      (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && key === "c") ||
      isMacInlineCodeShortcut(event)
    ) {
      event.preventDefault();
      wrapSource("`", "`", "inline code");
      return;
    }

    if (
      key === "1" &&
      ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
    ) {
      event.preventDefault();
      prefixSourceLines("# ", "一级标题");
      return;
    }

    if (
      key === "2" &&
      ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
    ) {
      event.preventDefault();
      prefixSourceLines("## ", "二级标题");
      return;
    }

    if (
      key === "3" &&
      ((event.altKey && !hasPrimaryModifier) || (hasPrimaryModifier && event.altKey))
    ) {
      event.preventDefault();
      prefixSourceLines("### ", "三级标题");
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "8") {
      event.preventDefault();
      prefixSourceLines("- ", "列表项");
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "7") {
      event.preventDefault();
      prefixSourceLines("1. ", "列表项");
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === ".") {
      event.preventDefault();
      prefixSourceLines("> ", "引用内容");
      return;
    }

    if (hasPrimaryModifier && event.altKey && key === "c") {
      event.preventDefault();
      insertCodeBlock();
      return;
    }

    if (hasPrimaryModifier && event.altKey && key === "t") {
      event.preventDefault();
      insertTodoList();
      return;
    }

    if (hasPrimaryModifier && event.altKey && key === "s") {
      event.preventDefault();
      insertSourceBlock("---");
      setFeedback("已插入分隔线。");
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "k") {
      event.preventDefault();
      insertImageByUrl();
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "i") {
      event.preventDefault();
      fileInputRef.current?.click();
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "t") {
      event.preventDefault();
      insertCompareTable();
      return;
    }

    if (hasPrimaryModifier && event.shiftKey && !event.altKey && key === "h") {
      event.preventDefault();
      insertHintBlock();
    }
  }

  useEffect(() => {
    if (!shortcutDialogOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShortcutDialogOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcutDialogOpen]);

  useEffect(() => {
    if (!colorMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!colorMenuRef.current?.contains(event.target as Node)) {
        setColorMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColorMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [colorMenuOpen]);

  return (
    <div className="knowledge-editor-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="app-segmented-tabs knowledge-editor-mode-tabs">
            {[
              { key: "visual", label: "可视化编辑" },
              { key: "split", label: "分栏预览" },
              { key: "preview", label: "阅读预览" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key as EditorMode)}
                aria-pressed={mode === item.key}
                className={cn(
                  "app-segmented-tab knowledge-editor-mode-tab",
                  mode === item.key ? "is-active" : "",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <TooltipHint
            content={
              <span className="block text-foreground-muted">
              查看所有快捷键。点击按钮或按 `Cmd/Ctrl + /` 都可以打开说明。
              </span>
            }
            tooltipClassName="z-20 w-56 min-w-0 border-border bg-surface leading-6 text-foreground-muted shadow-xl"
          >
            <Button
              type="button"
              variant="toolbar"
              className="size-9 rounded-full px-0 text-sm"
              aria-label="查看快捷键说明"
              aria-haspopup="dialog"
              onClick={openShortcutDialog}
            >
              ?
            </Button>
          </TooltipHint>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
          <span>字符 {characterCount}</span>
          <span>行数 {lineCount}</span>
          <span>预计阅读 {readMinutes} 分钟</span>
        </div>
      </div>

      <div className="knowledge-editor-toolbar">
        <div className="flex flex-wrap gap-2">
          <ToolbarShortcutHint label="加粗" shortcut={TOOLBAR_SHORTCUTS.bold}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("bold") ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleBold().run())}
            >
              加粗
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="斜体" shortcut={TOOLBAR_SHORTCUTS.italic}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("italic") ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleItalic().run())}
            >
              斜体
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="下划线" shortcut={TOOLBAR_SHORTCUTS.underline}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("underline") ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleUnderline().run())}
            >
              下划线
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="H1" shortcut={TOOLBAR_SHORTCUTS.heading1}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("heading", { level: 1 }) ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
            >
              H1
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="H2" shortcut={TOOLBAR_SHORTCUTS.heading2}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("heading", { level: 2 }) ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
            >
              H2
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="H3" shortcut={TOOLBAR_SHORTCUTS.heading3}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("heading", { level: 3 }) ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
            >
              H3
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="无序列表" shortcut={TOOLBAR_SHORTCUTS.bulletList}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("bulletList") ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleBulletList().run())}
            >
              无序列表
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="有序列表" shortcut={TOOLBAR_SHORTCUTS.orderedList}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("orderedList") ? "bg-surface text-foreground-strong" : ""}
              onClick={() => withEditor(() => editor?.chain().focus().toggleOrderedList().run())}
            >
              有序列表
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="引用" shortcut={TOOLBAR_SHORTCUTS.blockquote}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("blockquote") ? "bg-surface text-foreground-strong" : ""}
              onClick={() =>
                mode === "split"
                  ? prefixSourceLines("> ", "引用内容")
                  : withEditor(() => editor?.chain().focus().toggleBlockquote().run())
              }
            >
              引用
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="代码块" shortcut={TOOLBAR_SHORTCUTS.codeBlock}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("codeBlock") ? "bg-surface text-foreground-strong" : ""}
              onClick={insertCodeBlock}
            >
              代码块
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="行内代码" shortcut={TOOLBAR_SHORTCUTS.inlineCode}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("code") ? "bg-surface text-foreground-strong" : ""}
              onClick={() =>
                mode === "split"
                  ? wrapSource("`", "`", "inline code")
                  : withEditor(() => editor?.chain().focus().toggleCode().run())
              }
            >
              行内代码
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="链接" shortcut={TOOLBAR_SHORTCUTS.link}>
            <Button type="button" variant="toolbar" onClick={insertLink}>
              链接
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="图片链接" shortcut={TOOLBAR_SHORTCUTS.imageUrl}>
            <Button type="button" variant="toolbar" onClick={insertImageByUrl}>
              图片链接
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint
            label={isUploadingImage ? "本地图片（上传中）" : "本地图片"}
            shortcut={TOOLBAR_SHORTCUTS.localImage}
            disabled={isUploadingImage}
          >
            <Button
              type="button"
              variant="toolbar"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? "上传中..." : "本地图片"}
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="待办清单" shortcut={TOOLBAR_SHORTCUTS.todoList}>
            <Button
              type="button"
              variant="toolbar"
              className={editor?.isActive("taskList") ? "bg-surface text-foreground-strong" : ""}
              onClick={insertTodoList}
            >
              待办清单
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="对比表格" shortcut={TOOLBAR_SHORTCUTS.compareTable}>
            <Button type="button" variant="toolbar" onClick={insertCompareTable}>
              对比表格
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="提示块" shortcut={TOOLBAR_SHORTCUTS.hintBlock}>
            <Button type="button" variant="toolbar" onClick={insertHintBlock}>
              提示块
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="分隔线" shortcut={TOOLBAR_SHORTCUTS.divider}>
            <Button
              type="button"
              variant="toolbar"
              onClick={() =>
                mode === "split"
                  ? insertSourceBlock("---")
                  : withEditor(() => editor?.chain().focus().setHorizontalRule().run())
              }
            >
              分隔线
            </Button>
          </ToolbarShortcutHint>
        </div>

        <div ref={colorMenuRef} className="relative flex flex-wrap items-center gap-2">
          <ToolbarShortcutHint label="文字颜色" shortcut={TOOLBAR_SHORTCUTS.color}>
            <Button
              type="button"
              variant="toolbar"
              aria-haspopup="dialog"
              aria-expanded={colorMenuOpen}
              onClick={toggleColorMenu}
              className="gap-2"
            >
              <span className={cn("knowledge-editor-color-dot", activeColorOption.previewClassName)} />
              文字颜色
            </Button>
          </ToolbarShortcutHint>
          <span className="text-xs text-foreground-muted">
            当前：{mode === "split" ? "源码模式" : activeColorOption.label}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_OPTIONS.map((option, index) => (
              <ToolbarShortcutHint
                key={`inline-${option.label}`}
                label={option.label}
                shortcut={`${TOOLBAR_SHORTCUTS.color} 打开后按 ${index}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    mode === "split"
                      ? applySourceColor(option.value)
                      : applyEditorColor(option.value)
                  }
                  className={cn(
                    "knowledge-editor-color-chip",
                    option.value &&
                      editor?.isActive("textStyle", { color: option.value })
                      ? "bg-surface text-foreground-strong"
                      : "",
                    !option.value ? "is-default" : "",
                  )}
                  aria-label={`${option.label}，快捷键序号 ${index}`}
                >
                  <span className={cn("knowledge-editor-color-dot", option.previewClassName)} />
                  {option.label}
                </button>
              </ToolbarShortcutHint>
            ))}
          </div>
          {colorMenuOpen ? (
            <div
              role="dialog"
              aria-label="文字颜色面板"
              className="knowledge-editor-color-panel"
            >
              <div className="knowledge-editor-color-panel-header">
                <div>
                  <div className="text-sm font-medium text-foreground-strong">文字颜色</div>
                  <div className="text-xs leading-6 text-foreground-muted">
                    快捷键为 `{COLOR_SHORTCUT}`，打开颜色面板后也可按 0-5 快速选择。
                  </div>
                </div>
                <ToolbarShortcutHint label="关闭颜色面板" shortcut="Esc" align="end">
                  <Button
                    type="button"
                    variant="toolbar"
                    className="size-8 rounded-full px-0"
                    aria-label="关闭颜色面板"
                    onClick={() => setColorMenuOpen(false)}
                  >
                    ×
                  </Button>
                </ToolbarShortcutHint>
              </div>
              <div className="knowledge-editor-color-grid">
                {COLOR_OPTIONS.map((option, index) => (
                  <ToolbarShortcutHint
                    key={option.label}
                    label={option.label}
                    shortcut={`${TOOLBAR_SHORTCUTS.color} 打开后按 ${index}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        mode === "split"
                          ? applySourceColor(option.value)
                          : applyEditorColor(option.value)
                      }
                      className={cn(
                        "knowledge-editor-color-card",
                        option.value &&
                          editor?.isActive("textStyle", { color: option.value })
                          ? "is-active"
                          : "",
                        !option.value ? "is-default" : "",
                      )}
                      aria-label={`${option.label}，快捷键序号 ${index}`}
                    >
                      <span className={cn("knowledge-editor-color-card-swatch", option.previewClassName)} />
                      <span className="text-sm font-medium text-foreground-strong">{option.label}</span>
                      <span className="text-[11px] text-foreground-muted">快捷键 {index}</span>
                    </button>
                  </ToolbarShortcutHint>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <ToolbarShortcutHint label="撤销" shortcut={TOOLBAR_SHORTCUTS.undo}>
            <Button
              type="button"
              variant="toolbar"
              onClick={() => withEditor(() => editor?.chain().focus().undo().run())}
            >
              撤销
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="重做" shortcut={TOOLBAR_SHORTCUTS.redo}>
            <Button
              type="button"
              variant="toolbar"
              onClick={() => withEditor(() => editor?.chain().focus().redo().run())}
            >
              重做
            </Button>
          </ToolbarShortcutHint>
          <ToolbarShortcutHint label="清除格式" shortcut={TOOLBAR_SHORTCUTS.clear}>
            <Button
              type="button"
              variant="toolbar"
              onClick={() =>
                withEditor(() =>
                  editor?.chain().focus().unsetLink().unsetAllMarks().clearNodes().run(),
                )
              }
            >
              清除格式
            </Button>
          </ToolbarShortcutHint>
        </div>
      </div>

      <div
        className={cn(
          "knowledge-editor-workspace",
          mode === "split" ? "is-split" : "is-single",
        )}
      >
        {mode === "visual" ? (
          <section className="knowledge-editor-pane">
            <div className="knowledge-editor-pane-header">
              <span className="font-medium text-foreground-strong">正文编辑</span>
              <span className="text-xs text-foreground-muted">
                支持 `Cmd/Ctrl + B`、`Cmd/Ctrl + I`、`Cmd/Ctrl + K`、`Alt + 1/2/3`
              </span>
            </div>
            <div className="knowledge-editor-surface">
              <EditorContent editor={editor} />
            </div>
          </section>
        ) : null}

        {mode === "split" ? (
          <>
            <section className="knowledge-editor-pane">
              <div className="knowledge-editor-pane-header">
                <span className="font-medium text-foreground-strong">Markdown 源码</span>
                <span className="text-xs text-foreground-muted">
                  支持 `Cmd/Ctrl + B`、`Cmd/Ctrl + I`、`Cmd/Ctrl + K`、`Alt + 1/2/3`
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={sourceValue}
                onChange={(event) =>
                  emitMarkdown(event.target.value, {
                    start: event.target.selectionStart,
                    end: event.target.selectionEnd,
                  })
                }
                onKeyDown={handleSourceKeyDown}
                className="knowledge-editor-textarea"
                spellCheck={false}
                placeholder="# 页面标题

用 Markdown 编写，右侧会实时展示渲染结构。

## 示例

```ts
const message = 'Hello 3GLab';
```"
              />
            </section>
            <section className="knowledge-editor-pane">
              <div className="knowledge-editor-pane-header">
                <span className="font-medium text-foreground-strong">渲染结构</span>
                <span className="text-xs text-foreground-muted">
                  左侧改 Markdown 后，右侧会立即刷新最终阅读态
                </span>
              </div>
              <MarkdownContent
                markdown={sourceValue}
                className="knowledge-editor-preview"
                emptyHtml={
                  '<p class="text-foreground-subtle">开始输入内容后，这里会实时渲染。</p>'
                }
              />
            </section>
          </>
        ) : null}

        {mode === "preview" ? (
          <section className="knowledge-editor-pane">
            <div className="knowledge-editor-pane-header">
              <span className="font-medium text-foreground-strong">阅读预览</span>
              <span className="text-xs text-foreground-muted">
                这里显示最终阅读态，便于确认代码块、图片和标题层级
              </span>
            </div>
            <MarkdownContent
              markdown={sourceValue}
              className="knowledge-editor-preview"
              emptyHtml={
                '<p class="text-foreground-subtle">开始输入内容后，这里会实时渲染。</p>'
              }
            />
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-foreground-muted">
          可视化编辑保持不变；分栏模式左侧是 Markdown 源码，右侧是渲染结构。
        </div>
        <div
          className={cn(
            "text-xs",
            feedback ? "text-accent-strong" : "text-foreground-subtle",
          )}
        >
          {feedback || "快捷键在可视化编辑和分栏源码区都可使用；按 Cmd/Ctrl + / 可随时查看完整说明。"}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLocalImageChange}
      />

      {shortcutDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShortcutDialogOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            className="w-full max-w-3xl rounded-[32px] border border-border bg-surface p-6 text-foreground-strong shadow-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id={dialogTitleId} className="text-2xl font-semibold text-balance">
                  编辑器快捷键
                </h2>
                <p
                  id={dialogDescriptionId}
                  className="mt-2 max-w-2xl text-sm leading-7 text-foreground-muted text-pretty"
                >
                  常规格式遵循飞书文档习惯；没有官方直达键的扩展功能，补充了项目内快捷键。
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShortcutDialogOpen(false)}
              >
                关闭
              </Button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {SHORTCUT_GROUPS.map((group) => (
                <section
                  key={group.title}
                  className="rounded-[24px] border border-border bg-surface-soft p-4"
                >
                  <h3 className="text-sm font-semibold text-foreground-strong">
                    {group.title}
                  </h3>
                  <div className="mt-4 space-y-3 text-sm">
                    {group.items.map((item) => (
                      <div key={`${group.title}-${item.label}`} className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-foreground-muted">{item.label}</span>
                          <code className="rounded-md bg-surface px-2 py-1 text-[11px] text-foreground-strong">
                            {item.shortcut}
                          </code>
                        </div>
                        {item.note ? (
                          <div className="text-xs leading-6 text-foreground-subtle text-pretty">
                            {item.note}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
