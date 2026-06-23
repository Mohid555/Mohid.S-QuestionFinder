/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ACADEMIC_TOPICS } from "../types";

interface TagFilterProps {
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  tagCounts: Record<string, number> | null;
}

export default function TagFilter({ selectedTag, onSelectTag, tagCounts }: TagFilterProps) {
  // Sum up all question node values
  const totalCount = tagCounts ? Object.values(tagCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Topic Filters</h3>
      <div className="space-y-1 pr-1">
        {/* All/Reset Option */}
        <button
          onClick={() => onSelectTag(null)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
            selectedTag === null
              ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm"
              : "text-slate-600 hover:bg-slate-50 font-medium"
          }`}
        >
          <span>All Subjects</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
            selectedTag === null ? "bg-indigo-200 text-indigo-800" : "bg-slate-100 text-slate-500"
          }`}>
            {totalCount}
          </span>
        </button>

        {/* Categories List matching Sleek Interface exactly */}
        {ACADEMIC_TOPICS.map((topic) => {
          const isSelected = selectedTag === topic;
          const count = tagCounts ? tagCounts[topic] || 0 : 0;

          return (
            <button
              key={topic}
              onClick={() => onSelectTag(topic)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                isSelected
                  ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 font-medium"
              }`}
            >
              <span>{topic}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isSelected ? "bg-indigo-200 text-indigo-800" : "bg-slate-100 text-slate-500"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
