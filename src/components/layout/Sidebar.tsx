"use client";

import {
  Library,
  Link2,
  FileText,
  FileImage,
  Type,
  Tag,
} from "lucide-react";
import type { ContentType } from "@/types/database";

export type FilterType = "all" | ContentType;

interface SidebarProps {
  tags: { name: string; count: number }[];
  activeFilter: FilterType;
  activeTag: string | null;
  onFilterChange: (filter: FilterType) => void;
  onTagSelect: (tag: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_FILTERS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <Library size={16} /> },
  { key: "link", label: "Links", icon: <Link2 size={16} /> },
  { key: "selected_text", label: "Text", icon: <Type size={16} /> },
  { key: "pdf", label: "PDFs", icon: <FileText size={16} /> },
  { key: "image", label: "Images", icon: <FileImage size={16} /> },
];

export default function Sidebar({
  tags,
  activeFilter,
  activeTag,
  onFilterChange,
  onTagSelect,
  isOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`
          fixed lg:static top-14 left-0 bottom-0 z-20
          w-[220px] bg-bg-secondary border-r border-border
          flex flex-col py-4 overflow-y-auto
          transition-transform duration-200
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="px-4 mb-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            <Tag size={12} />
            Tags
          </div>
          {tags.length === 0 ? (
            <p className="text-xs text-text-tertiary px-1 mb-3">(none)</p>
          ) : (
            <div className="space-y-0.5 mb-3">
              {tags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => {
                    onTagSelect(activeTag === tag.name ? null : tag.name);
                    onClose();
                  }}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                    activeTag === tag.name
                      ? "bg-accent-light text-accent font-medium"
                      : "text-text-primary hover:bg-bg-hover"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-4 border-t border-border mb-3" />

        <div className="px-4 space-y-0.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                onFilterChange(f.key);
                onTagSelect(null);
                onClose();
              }}
              className={`w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center gap-2 transition-colors ${
                activeFilter === f.key && !activeTag
                  ? "bg-bg-hover text-accent font-medium"
                  : "text-text-primary hover:bg-bg-hover"
              }`}
            >
              <span className="text-text-secondary">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
