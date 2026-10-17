import ReactMarkdown from "react-markdown";

/** No raw HTML, images, custom components, plugins, or arbitrary provider attributes. */
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={[
        "p",
        "h1",
        "h2",
        "h3",
        "ul",
        "ol",
        "li",
        "strong",
        "em",
        "code",
        "pre",
        "blockquote",
        "a",
        "br",
        "hr",
      ]}
      urlTransform={(url) => (/^https:\/\//i.test(url) ? url : "")}
      components={{
        a: ({ children, href }) =>
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
