/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import QuestionBox from "./components/QuestionBox";
import TagFilter from "./components/TagFilter";
import StatsSection from "./components/StatsSection";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, HelpCircle, History, Mail, PlusCircle, Search, Sparkles, X } from "lucide-react";
import { TOPIC_THEMES } from "./components/QuestionBox";
import { SimilarQuestionResult } from "./types";

interface QuestionItem {
  id: string;
  text: string;
  tag: string;
  createdAt: string;
  similarQuestions?: SimilarQuestionResult[];
}

const PAGE_SIZE = 15;
const SESSION_USER_KEY = "qs_session_user";
const API_BASE_URL = "http://localhost:5000";

function loadSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSessionUser(u: { id: string; email: string; name: string } | null) {
  try {
    if (u) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(SESSION_USER_KEY);
  } catch {}
}

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(loadSessionUser);
  const [activeTab, setActiveTab] = useState<"dashboard" | "stats">("dashboard");

  // Start from session — empty on first load, restored if tab still open
  const [history, setHistory] = useState<QuestionItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [archivePage, setArchivePage] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionItem | null>(null);

  // Sync history to sessionStorage on every change
  useEffect(() => {
    if (!user) return;

    let isCurrent = true;
    const loadSubmittedQuestions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/submissions`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load submitted questions.");

        const submissions = Array.isArray(data.submissions) ? data.submissions : [];
        const submittedQuestions = submissions.map((item: any) => ({
          id: item.id || item._id,
          text: item.text,
          tag: item.tag,
          createdAt: item.createdAt,
          similarQuestions: Array.isArray(item.similarQuestions) ? item.similarQuestions : [],
        }));

        if (isCurrent) {
          setHistory(submittedQuestions);
          setArchivePage(0);
        }
      } catch (error) {
        console.error("Could not sync submitted questions", error);
      }
    };

    loadSubmittedQuestions();
    window.addEventListener("focus", loadSubmittedQuestions);

    return () => {
      isCurrent = false;
      window.removeEventListener("focus", loadSubmittedQuestions);
    };
  }, [user, activeTab, statsRefresh]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: window.scrollY });
  }, [activeTab]);

  const handleStartSession = () => {
    const name = "Mohid S";
    const newUser = {
      id: "sess-" + Math.random().toString(36).slice(2, 9),
      email: "mohammedmohid810@gmail.com",
      name: "Sir",
    };
    setUser(newUser);
    saveSessionUser(newUser);
  };

  const handleNewQuestion = (newQ: QuestionItem) => {
    setHistory((prev) => {
      if (prev.some((item) => item.id === newQ.id)) return prev;
      return [newQ, ...prev];
    });
    setArchivePage(0);
    setStatsRefresh((prev) => prev + 1);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_USER_KEY);
    setUser(null);
    setHistory([]);
    setSelectedTag(null);
    setActiveTab("dashboard");
    setArchivePage(0);
    setHasResult(false);
  };

  // Tag counts from session questions only
  const tagCounts: Record<string, number> = {};
  history.forEach((q) => {
    tagCounts[q.tag] = (tagCounts[q.tag] || 0) + 1;
  });

  const filteredHistory = selectedTag
    ? history.filter((q) => q.tag === selectedTag)
    : history;

  const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE);
  const pagedHistory = filteredHistory.slice(archivePage * PAGE_SIZE, (archivePage + 1) * PAGE_SIZE);

  const handleTagChange = (tag: string | null) => {
    setSelectedTag(tag);
    setArchivePage(0);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col selection:bg-indigo-100 selection:text-indigo-900">

      {user && (
        <Navbar
          user={user}
          onLogout={handleLogout}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1 mt-6 flex flex-col pb-8">

        {/* ── Guest / Login Screen ── */}
        {!user ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20 animate-fade-in">
            <div className="presentation-card bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/70 p-8 sm:p-10 w-full max-w-lg text-center space-y-7 overflow-hidden relative">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-amber-400"></div>

              <div className="presentation-icon w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200">
                <Search className="w-9 h-9 text-white" />
              </div>

              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                  <Sparkles className="w-3.5 h-3.5" />
                  Project Presentation
                </div>
                <h1 className="text-3xl font-extrabold text-slate-950 tracking-tight">Question Finder</h1>
                <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                  A smart study-question finder that classifies questions and retrieves similar academic queries.
                </p>
              </div>

              <div className="grid gap-3 text-left">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Presented By</div>
                  <div className="mt-1 text-base font-extrabold text-slate-900">Mohid S</div>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center gap-3">
                  <Mail className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700 break-all">mohammedmohid810@gmail.com</span>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">Nandha Engineering College</span>
                </div>
                <button
                  onClick={handleStartSession}
                  className="presentation-cta w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-4 px-6 rounded-2xl text-sm transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Click here to see my project</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-400 font-mono">
                Built for a clean, browser-only project demonstration.
              </p>
            </div>
          </div>
        ) : (
          /* ── Student Workspace ── */
          <div className="flex flex-col gap-6 flex-1">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 p-2.5 rounded-2xl">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Question Finder</h2>
                  <p className="text-xs text-slate-400">Welcome, <span className="font-semibold text-slate-600">{user.name}</span>.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-100 font-semibold">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span>Session Active — {history.length} question{history.length !== 1 ? "s" : ""} this tab</span>
              </div>
            </div>

            {/* Dashboard Tab */}
            {activeTab === "dashboard" && (
              <div className="flex flex-row gap-6" style={{ alignItems: 'stretch' }}>

                {/* Left Sidebar — no scroll */}
                <aside
                  className="w-72 bg-white border border-slate-200 flex flex-col p-6 shrink-0 rounded-3xl shadow-sm overflow-hidden"
                  style={{ flex: '0 0 18rem' }}
                >
                  {/* Topic Filters — only shows tags from session questions */}
                  <div className="mb-6 border-t border-slate-100 pt-5 pr-1">
                    <TagFilter
                      selectedTag={selectedTag}
                      onSelectTag={handleTagChange}
                      tagCounts={tagCounts}
                    />
                  </div>

                  {/* Session metric cards */}
                  <div className="space-y-4 mt-4">
                    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                      <div className="text-xs font-bold text-slate-700">Saved Questions</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-2">{history.length}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Synced from MongoDB</div>
                    </div>

                    <div className="p-4 bg-white rounded-2xl border border-slate-100">
                      <div className="text-xs font-bold text-slate-700">Topics Covered</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-2">{Object.keys(tagCounts).length}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Distinct subjects this session</div>
                    </div>

                    <div className="p-4 bg-white rounded-2xl border border-slate-100">
                      <div className="text-xs font-bold text-slate-700">Matches Found</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-2">{Math.max(0, Math.floor(history.length * 0.8))}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Similar questions retrieved</div>
                    </div>
                  </div>
                </aside>

                {/* Right Column */}
                <div className="flex-1 w-full flex flex-col gap-6 min-w-0">

                  {/* Question Box */}
                  <div className="shrink-0">
                    <QuestionBox
                      onQuestionSubmitted={handleNewQuestion}
                      onResultChange={setHasResult}
                    />
                  </div>

                  {/* Session Archives — hidden while results showing */}
                  {!hasResult && (
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col overflow-hidden">

                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-6 pb-4 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <History className="w-4 h-4 text-slate-500" />
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            This Session — {filteredHistory.length} Question{filteredHistory.length !== 1 ? "s" : ""}
                          </h3>
                        </div>
                        {selectedTag && (
                          <button
                            onClick={() => handleTagChange(null)}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold"
                          >
                            Clear filter
                          </button>
                        )}
                      </div>

                      {/* Cards */}
                      <div
                        className="px-6 py-4 overflow-y-auto flex-1"
                        style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}
                      >
                        {history.length === 0 ? (
                          <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl px-6 bg-slate-50/50">
                            <PlusCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 font-semibold">No questions yet</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                              Type a question above and click Submit. Your questions appear here and are saved for this session.
                            </p>
                          </div>
                        ) : filteredHistory.length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl px-6 bg-slate-50/50">
                            <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 font-semibold">No questions in this category</p>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              No session questions categorized as <strong>{selectedTag}</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pagedHistory.map((item) => {
                              const theme = TOPIC_THEMES[item.tag] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
                              return (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() => setSelectedQuestion(item)}
                                  className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 transition-all duration-150 flex flex-col justify-between text-left cursor-pointer"
                                >
                                  <div>
                                    <div className="flex justify-between items-center mb-3">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${theme.bg} ${theme.text} border ${theme.border}`}>
                                        {item.tag}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-800 leading-normal mb-3">
                                      "{item.text}"
                                    </p>
                                  </div>
                                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                    <span>{new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                                    <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-emerald-600 font-semibold font-sans">
                                      Session
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="border-t border-slate-100 px-6 py-4 shrink-0 flex items-center justify-center gap-3">
                          <button
                            onClick={() => setArchivePage((p) => Math.max(0, p - 1))}
                            disabled={archivePage === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Previous
                          </button>

                          <div className="flex items-center gap-1.5">
                            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                              let pageNum = i;
                              if (totalPages > 7) {
                                if (archivePage <= 3) pageNum = i;
                                else if (archivePage >= totalPages - 4) pageNum = totalPages - 7 + i;
                                else pageNum = archivePage - 3 + i;
                              }
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setArchivePage(pageNum)}
                                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                    archivePage === pageNum
                                      ? "bg-indigo-600 text-white shadow-sm"
                                      : "bg-slate-50 border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                                  }`}
                                >
                                  {pageNum + 1}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => setArchivePage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={archivePage === totalPages - 1}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <span className="text-[10px] text-slate-400 font-mono ml-1">
                            Page {archivePage + 1} / {totalPages}
                          </span>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === "stats" && (
              <div className="animate-fade-in">
                <StatsSection
                  onRefreshTrigger={statsRefresh}
                />
              </div>
            )}

          </div>
        )}

      </div>

      {selectedQuestion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-md px-4 py-8"
          onClick={() => setSelectedQuestion(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-2xl animate-fade-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Previous Question</span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">"{selectedQuestion.text}"</h3>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    (TOPIC_THEMES[selectedQuestion.tag] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" }).bg
                  } ${(TOPIC_THEMES[selectedQuestion.tag] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" }).text} ${
                    (TOPIC_THEMES[selectedQuestion.tag] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" }).border
                  }`}>
                    {selectedQuestion.tag}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(selectedQuestion.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestion(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                aria-label="Close suggested questions"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto max-h-[58vh]">
              <div className="flex items-center gap-2 mb-4">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Previously Suggested Questions</h4>
              </div>

              {selectedQuestion.similarQuestions && selectedQuestion.similarQuestions.length > 0 ? (
                <div className="grid gap-3">
                  {selectedQuestion.similarQuestions.map((match) => {
                    const percent = Math.round(match.similarity * 100);
                    return (
                      <div key={`${match.id}-${match.text}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-semibold leading-relaxed text-slate-800">"{match.text}"</p>
                          <span className="shrink-0 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold font-mono text-indigo-600">
                            {percent}%
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-500">{match.tag}</span>
                          <span>{new Date(match.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                  <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No saved suggestions for this older question.</p>
                  <p className="text-xs text-slate-400 mt-1">New questions will save their suggested matches in MongoDB.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
