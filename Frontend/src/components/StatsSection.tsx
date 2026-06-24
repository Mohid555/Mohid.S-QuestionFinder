/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { BarChart3, Brain, Layers, GitCompare, Sparkles, RefreshCw } from "lucide-react";
import { TOPIC_THEMES } from "./QuestionBox";

const API_BASE_URL = window.location.port === "5000" ? "" : "http://localhost:5000";

interface StatsSectionProps {
  onRefreshTrigger?: number;
}

export default function StatsSection({ onRefreshTrigger }: StatsSectionProps) {
  const [stats, setStats] = useState<{
    totalQuestions: number;
    tagCounts: Record<string, number>;
    topics: string[];
  } | null>(null);
  
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch statistics");
      setStats({
        totalQuestions: Number(data.totalQuestions || 0),
        tagCounts: data.tagCounts || {},
        topics: Array.isArray(data.topics) ? data.topics : [],
      });
    } catch (err) {
      console.error("Failed to fetch statistics", err);
      setStats({ totalQuestions: 0, tagCounts: {}, topics: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [onRefreshTrigger]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-3xl">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-sm font-medium text-slate-400">Loading system stats...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Grid distributions list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Topic Frequency Distribution Chart */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-100">
          <div className="flex items-center gap-2.5 mb-5">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Subject Group Densities</h4>
          </div>

          {stats && (
            <div className="space-y-3.5">
              {stats.topics.map((topic) => {
                const count = stats.tagCounts[topic] || 0;
                // calculate ratio
                const ratio = stats.totalQuestions > 0 ? (count / stats.totalQuestions) * 100 : 0;
                const theme = TOPIC_THEMES[topic] || { text: "text-slate-700", bg: "bg-slate-100" };

                return (
                  <div key={topic} className="space-y-1">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-semibold text-slate-700">{topic}</span>
                      <span className="font-mono text-slate-400">
                        {count} questions ({Math.round(ratio)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-50 border border-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(ratio, count > 0 ? 3 : 0)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Explainability Block */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-5 text-indigo-650">
              <Brain className="w-5 h-5 animate-bounce" />
              <h4 className="text-sm font-bold uppercase tracking-wider">Under the Hood: Vector Math</h4>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <div className="flex gap-2 text-slate-700">
                <Layers className="w-8 h-8 text-indigo-600 bg-indigo-50 p-1.5 rounded-lg flex-shrink-0" />
                <div>
                  <strong className="text-slate-800">1. Generating Local Embeddings</strong>
                  <p className="mt-0.5">When you submit a question, the app simulates lightweight embeddings and runs local similarity heuristics to find related questions from the stored dataset.</p>
                </div>
              </div>

              <div className="flex gap-2 text-slate-700">
                <GitCompare className="w-8 h-8 text-slate-600 bg-slate-50 p-1.5 rounded-lg flex-shrink-0" />
                <div>
                  <strong className="text-slate-800">2. Similarity Heuristics</strong>
                  <p className="mt-0.5">The demo uses keyword-overlap heuristics to rank similar entries; in production you'd replace this with true vector comparisons.</p>
                </div>
              </div>

              <div className="flex gap-2 text-slate-700">
                <Sparkles className="w-8 h-8 text-amber-600 bg-amber-50 p-1.5 rounded-lg flex-shrink-0" />
                <div>
                  <strong className="text-slate-800">3. Rule-based Tagging</strong>
                  <p className="mt-0.5">This demo auto-tags using simple rule-based keyword matching. Replace with an external classifier if you need higher accuracy.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-50 text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
            <span>Local Database Storage: ONLINE</span>
          </div>

        </div>

      </div>

    </div>
  );
}
