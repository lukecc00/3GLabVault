import hljs from "highlight.js";
import { marked, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedSchemes = ["http", "https", "mailto"];
const knowledgeAssetPathname = "/api/knowledge/pages/assets";
const markdownColorClassMap: Record<string, string> = {
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
const markdownColorStyleMap: Record<string, string> = {
  "md-color-sky": "#0ea5e9",
  "md-color-emerald": "#10b981",
  "md-color-amber": "#d97706",
  "md-color-rose": "#f43f5e",
  "md-color-violet": "#8b5cf6",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildMarkdownHeadingId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function highlightCode(code: string, language?: string) {
  const normalizedLanguage = language?.trim().toLowerCase();

  if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
    return {
      language: normalizedLanguage,
      html: hljs.highlight(code, { language: normalizedLanguage }).value,
    };
  }

  const auto = hljs.highlightAuto(code);

  return {
    language: auto.language ?? "text",
    html: auto.value || escapeHtml(code),
  };
}

export function isKnowledgeAssetImageUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  if (trimmedValue.startsWith(knowledgeAssetPathname)) {
    return true;
  }

  if (!/^https?:\/\//i.test(trimmedValue)) {
    return false;
  }

  try {
    const url = new URL(trimmedValue);
    return url.pathname === knowledgeAssetPathname;
  } catch {
    return false;
  }
}

function normalizeMarkdownColorSpans(html: string) {
  return html.replace(/<span([^>]*)style=(["'])([^"']*?)\2([^>]*)>/gi, (match, before, _quote, styleValue, after) => {
    const colorMatch = styleValue.match(/color\s*:\s*([^;]+)/i);
    const normalizedColor = colorMatch?.[1]?.trim().toLowerCase();
    const mappedClassName = normalizedColor ? markdownColorClassMap[normalizedColor] : undefined;

    if (!mappedClassName) {
      return match;
    }

    const existingClassMatch = `${before} ${after}`.match(/class=(["'])([^"']*?)\1/i);
    const existingClasses = existingClassMatch?.[2]?.trim();
    const mergedClasses = [existingClasses, mappedClassName].filter(Boolean).join(" ");
    const attributesWithoutClass = `${before} ${after}`
      .replace(/\sclass=(["'])([^"']*?)\1/i, "")
      .trim();
    const classAttribute = ` class="${escapeHtml(mergedClasses)}"`;

    return `<span${classAttribute}${attributesWithoutClass ? ` ${attributesWithoutClass}` : ""}>`;
  });
}

function convertMarkdownColorClassesToInlineStyles(html: string) {
  return html.replace(/<span([^>]*)>/gi, (match, attributes) => {
    const classMatch = attributes.match(/\sclass=(["'])([^"']*?)\1/i);
    const styleMatch = attributes.match(/\sstyle=(["'])([^"']*?)\1/i);
    const classNames = classMatch?.[2]?.split(/\s+/).filter(Boolean) ?? [];
    const markdownColorClassName = classNames.find(
      (value: string) => value in markdownColorStyleMap,
    );

    if (!markdownColorClassName) {
      return match;
    }

    const remainingClassNames = classNames.filter(
      (value: string) => value !== markdownColorClassName,
    );
    const normalizedStyleValue = styleMatch?.[2]?.trim().replace(/;+\s*$/, "") ?? "";
    const colorStyle = `color:${markdownColorStyleMap[markdownColorClassName]}`;
    const nextStyleValue = normalizedStyleValue
      ? `${normalizedStyleValue}; ${colorStyle}`
      : colorStyle;
    const attributesWithoutClassOrStyle = attributes
      .replace(/\sclass=(["'])([^"']*?)\1/i, "")
      .replace(/\sstyle=(["'])([^"']*?)\1/i, "")
      .trim();
    const classAttribute = remainingClassNames.length > 0
      ? ` class="${escapeHtml(remainingClassNames.join(" "))}"`
      : "";
    const styleAttribute = ` style="${escapeHtml(nextStyleValue)}"`;

    return `<span${classAttribute}${styleAttribute}${attributesWithoutClassOrStyle ? ` ${attributesWithoutClassOrStyle}` : ""}>`;
  });
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

function createMarkdownRenderer(options?: {
  useAuthorizedImagePlaceholder?: boolean;
  mode?: "display" | "editor";
}) {
  const renderer = new marked.Renderer();
  const headingCounts = new Map<string, number>();
  const useAuthorizedImagePlaceholder = options?.useAuthorizedImagePlaceholder ?? true;
  const mode = options?.mode ?? "display";

  renderer.heading = function heading({ tokens, depth }: Tokens.Heading) {
    const inlineContent = this.parser.parseInline(tokens);
    const baseId = buildMarkdownHeadingId(inlineContent) || `heading-${depth}`;
    const currentCount = headingCounts.get(baseId) ?? 0;
    const nextCount = currentCount + 1;
    headingCounts.set(baseId, nextCount);
    const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;

    return `<h${depth} id="${id}">${inlineContent}</h${depth}>`;
  };

  renderer.code = function code({ text, lang }: Tokens.Code) {
    if (mode === "editor") {
      const normalizedLanguage = lang?.trim().toLowerCase() || "plaintext";

      return `<pre><code class="language-${escapeHtml(normalizedLanguage)}">${escapeHtml(text)}</code></pre>`;
    }

    const { language, html } = highlightCode(text, lang);
    const languageLabel = language.toUpperCase();

    return `
      <div class="md-code-block">
        <div class="md-code-block-bar">
          <span class="md-code-block-language">${escapeHtml(languageLabel)}</span>
        </div>
        <pre class="hljs"><code class="hljs language-${escapeHtml(language)}">${html}</code></pre>
      </div>
    `;
  };

  renderer.image = function image({ href, title, text }: Tokens.Image) {
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const escapedHref = escapeHtml(href);

    if (isKnowledgeAssetImageUrl(href)) {
      if (useAuthorizedImagePlaceholder) {
        return `<img src="" data-auth-src="${escapedHref}" alt="${escapeHtml(text || "图片")}"${titleAttribute} loading="lazy" decoding="async" />`;
      }

      return `<img src="${escapedHref}" data-auth-src="${escapedHref}" alt="${escapeHtml(text || "图片")}"${titleAttribute} loading="lazy" decoding="async" />`;
    }

    return `<img src="${escapedHref}" alt="${escapeHtml(text || "图片")}"${titleAttribute} loading="lazy" decoding="async" />`;
  };

  return renderer;
}

export function renderMarkdownToHtml(
  markdown: string,
  options?: {
    useAuthorizedImagePlaceholder?: boolean;
    mode?: "display" | "editor";
  },
): string {
  const html = marked.parse(markdown || "", {
    renderer: createMarkdownRenderer(options),
  }) as string;
  const normalizedHtml =
    options?.mode === "editor"
      ? convertMarkdownColorClassesToInlineStyles(html)
      : normalizeMarkdownColorSpans(html);

  return sanitizeHtml(normalizedHtml, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "img",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
      "div",
      "input",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "loading", "decoding", "data-auth-src"],
      input: ["type", "checked", "disabled"],
      span: ["class", "style"],
      "*": ["class", "id"],
    },
    allowedStyles: {
      span: {
        color: [
          /^#0ea5e9$/i,
          /^#10b981$/i,
          /^#d97706$/i,
          /^#f43f5e$/i,
          /^#8b5cf6$/i,
        ],
      },
    },
    allowedSchemes,
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}

export function renderMarkdownToPlainText(markdown: string): string {
  const html = renderMarkdownToHtml(markdown);

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|blockquote|pre|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
