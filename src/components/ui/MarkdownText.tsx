"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

function SmartAnchor({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const [sameOriginPath, setSameOriginPath] = useState<string | null>(null);

  useEffect(() => {
    if (!href || !href.startsWith("http")) return;
    try {
      const u = new URL(href);
      if (u.origin === window.location.origin) {
        setSameOriginPath(`${u.pathname}${u.search}${u.hash}`);
      }
    } catch {
      /* ignore */
    }
  }, [href]);

  const className =
    "text-accent underline underline-offset-2 hover:opacity-90";

  if (!href) return <span>{children}</span>;

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  if (sameOriginPath) {
    return (
      <Link href={sameOriginPath} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
    >
      {children}
    </a>
  );
}

type MarkdownTextProps = {
  children: string;
  className?: string;
};

export function MarkdownText({ children, className }: MarkdownTextProps) {
  return (
    <div className={className ?? "text-sm text-text-primary"}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          a: ({ href, children }) => (
            <SmartAnchor href={href}>{children}</SmartAnchor>
          ),
          pre: ({ children }) => (
            <pre className="rounded-lg bg-bg-secondary border border-border p-3 overflow-x-auto text-[0.85em] font-mono my-2">
              {children}
            </pre>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-bg-secondary px-1 py-0.5 text-[0.9em] font-mono">
                {children}
              </code>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
