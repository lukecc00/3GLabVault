"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TurndownService from "turndown";
import { renderMarkdownToHtml } from "@/lib/markdown";

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

export function KnowledgeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (payload: { markdown: string; rawJson: unknown }) => void;
}) {
  const initialHtml = useMemo(() => renderMarkdownToHtml(value || ""), [value]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: "rounded-xl bg-zinc-950 p-4 text-zinc-100",
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: "list-disc pl-6",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal pl-6",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: "border-l-4 border-emerald-400/60 pl-4 text-zinc-300",
          },
        },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "min-h-[360px] rounded-2xl border border-white/10 bg-black/20 px-4 py-4 outline-none prose prose-invert max-w-none",
      },
    },
    onUpdate({ editor }) {
      onChange({
        markdown: turndown.turndown(editor.getHTML()),
        rawJson: editor.getJSON(),
      });
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentMarkdown = turndown.turndown(editor.getHTML());
    if (currentMarkdown.trim() === (value || "").trim()) {
      return;
    }

    editor.commands.setContent(initialHtml, { emitUpdate: false });
  }, [editor, initialHtml, value]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          加粗
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          斜体
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          列表
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          引用
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
        >
          代码块
        </button>
      </div>
      <div className="rounded-2xl">
        <EditorContent editor={editor} />
      </div>
      <p className="text-xs leading-6 text-zinc-400">
        支持 <code>#</code> 标题、<code>-</code> 列表、<code>&gt;</code>{" "}
        引用、<code>```</code> 代码块等 Markdown 快捷输入。
      </p>
    </div>
  );
}
