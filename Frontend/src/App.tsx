/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import Navbar, { AppTab } from "./components/Navbar";
import QuestionBox from "./components/QuestionBox";
import TagFilter from "./components/TagFilter";
import StatsSection from "./components/StatsSection";
import { ArrowRight, Building2, CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, Filter, GraduationCap, HelpCircle, History, Lock, Mail, PlusCircle, Search, Shield, Sparkles, X } from "lucide-react";
import { TOPIC_THEMES } from "./components/QuestionBox";
import { SimilarQuestionResult } from "./types";
import { API_BASE_URL } from "./config/api";

interface QuestionItem {
  id: string;
  text: string;
  tag: string;
  createdAt: string;
  userName?: string;
  similarQuestions?: SimilarQuestionResult[];
}

const PAGE_SIZE = 15;
const SESSION_USER_KEY = "qs_session_user";
const SESSION_ACTIVE_TAB_KEY = "qs_active_tab";

type SessionUser = { id: string; email: string; name: string };

function loadSessionUser() {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY) || sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.name === "string"
    ) {
      return parsed as SessionUser;
    }
  } catch {}
  return null;
}

function saveSessionUser(u: SessionUser | null) {
  try {
    if (u) {
      const serialized = JSON.stringify(u);
      localStorage.setItem(SESSION_USER_KEY, serialized);
      sessionStorage.setItem(SESSION_USER_KEY, serialized);
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {}
}

function loadActiveTab(): AppTab {
  try {
    const savedTab = localStorage.getItem(SESSION_ACTIVE_TAB_KEY) || sessionStorage.getItem(SESSION_ACTIVE_TAB_KEY);
    if (savedTab === "dashboard" || savedTab === "history" || savedTab === "stats") {
      return savedTab;
    }
  } catch {}
  return "dashboard";
}

function saveActiveTab(tab: AppTab | null) {
  try {
    if (tab) {
      localStorage.setItem(SESSION_ACTIVE_TAB_KEY, tab);
      sessionStorage.setItem(SESSION_ACTIVE_TAB_KEY, tab);
    } else {
      localStorage.removeItem(SESSION_ACTIVE_TAB_KEY);
      sessionStorage.removeItem(SESSION_ACTIVE_TAB_KEY);
    }
  } catch {}
}

function toDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const DEMO_EMAIL = "demo123@gmail.com";
const DEMO_PASSWORD = "demo123";

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(() => loadActiveTab());

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  // Start from session — empty on first load, restored if tab still open
  const [history, setHistory] = useState<QuestionItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [archivePage, setArchivePage] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionItem | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySubjectFilter, setHistorySubjectFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("");

  // Load submitted questions from MongoDB in real time
  useEffect(() => {
    if (!user) return;

    let isCurrent = true;
    const fetchSubmissions = async () => {
      setLoadingHistory(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/submissions`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load.");

        const mapped = (Array.isArray(data.submissions) ? data.submissions : []).map((s: any) => ({
          id: s.id || s._id,
          text: s.text,
          tag: s.tag,
          createdAt: s.createdAt,
          similarQuestions: Array.isArray(s.similarQuestions) ? s.similarQuestions : [],
          userName: s.userName,
        }));

        if (isCurrent) {
          setHistory(mapped);
          setArchivePage(0);
        }
      } catch (err) {
        console.warn("Could not fetch submissions; showing an empty dashboard.", err);
        if (isCurrent) {
          setHistory([]);
          setArchivePage(0);
        }
      } finally {
        if (isCurrent) setLoadingHistory(false);
      }
    };

    fetchSubmissions();
    // Re-fetch every time the user switches back to the tab
    window.addEventListener("focus", fetchSubmissions);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", fetchSubmissions);
    };
  }, [user, statsRefresh]);

  useEffect(() => {
    if (activeTab !== "dashboard") return;

    window.scrollTo({ left: 0, top: 0 });
    window.requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      document.querySelectorAll<HTMLElement>("[data-reset-scroll]").forEach((element) => {
        element.scrollLeft = 0;
      });
    });
  }, [activeTab]);

  useEffect(() => {
    if (user) saveActiveTab(activeTab);
  }, [activeTab, user]);

  const handleStartSession = () => {
    const newUser = {
      id: "sess-" + Math.random().toString(36).slice(2, 9),
      email: "mohammedmohid810@gmail.com",
      name: "Sir",
    };
    setUser(newUser);
    saveSessionUser(newUser);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail.trim()) { setLoginError("Please enter your email address."); return; }
    if (!loginPassword) { setLoginError("Please enter your password."); return; }
    if (loginEmail.trim().toLowerCase() !== DEMO_EMAIL.toLowerCase() || loginPassword !== DEMO_PASSWORD) {
      setLoginError("Invalid email or password. Use the demo credentials below.");
      return;
    }
    setLoginLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setLoginLoading(false);
    handleStartSession();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    if (!signupName.trim()) {
      setSignupError("Please enter your full name.");
      return;
    }

    if (!signupEmail.trim()) {
      setSignupError("Please enter your email address.");
      return;
    }

    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match.");
      return;
    }

    setSignupLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setSignupLoading(false);

    const newUser = {
      id: "user-" + Math.random().toString(36).slice(2, 9),
      email: signupEmail.trim().toLowerCase(),
      name: signupName.trim(),
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
    saveSessionUser(null);
    saveActiveTab(null);
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
  const subjectOptions = Object.keys(tagCounts).sort((a, b) => a.localeCompare(b));

  const filteredHistory = selectedTag
    ? history.filter((q) => q.tag === selectedTag)
    : history;

  const reportHistory = history.filter((item) => {
    const matchesSubject = historySubjectFilter === "all" || item.tag === historySubjectFilter;
    const matchesDate = !historyDateFilter || toDateKey(item.createdAt) === historyDateFilter;
    return matchesSubject && matchesDate;
  });

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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 w-full flex-1 mt-4 sm:mt-6 flex flex-col pb-6 sm:pb-8">

        {/* ── Login Screen ── */}
        {!user ? (
          <div className="flex flex-col items-center justify-center flex-1 py-6 sm:py-10 animate-fade-in">
            <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
              <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                <section className="bg-slate-950 p-7 sm:p-10 text-white flex flex-col justify-between">
                  <div>
                    <div className="mb-8 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-950/30">
                        <Search className="h-6 w-6" />
                      </div>
                      <div>
                        <h1 className="text-xl font-extrabold tracking-tight">Question Finder</h1>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Study question portal</p>
                      </div>
                    </div>

                    <h2 className="max-w-sm text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                      Sign in to manage academic questions with confidence.
                    </h2>
                    <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                      Classify questions, retrieve similar study material, and keep your submitted question history in one organized dashboard.
                    </p>

                    <div className="mt-8 grid gap-3">
                      {[
                        { icon: <Sparkles className="h-4 w-4" />, label: "Semantic matching for related questions" },
                        { icon: <Shield className="h-4 w-4" />, label: "Automatic topic classification" },
                        { icon: <GraduationCap className="h-4 w-4" />, label: "Saved question history with matches" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
                            {item.icon}
                          </div>
                          <span className="text-sm font-semibold text-slate-100">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-10 border-t border-white/10 pt-5">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Presented by</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-extrabold text-slate-950">M</div>
                      <div>
                        <p className="text-sm font-bold">Mohid S</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <Building2 className="h-3.5 w-3.5" />
                          Nandha Engineering College
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="p-6 sm:p-10">
                  <div className="mx-auto flex w-full max-w-md flex-col">
                    <div className="mb-6">
                      <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Secure access</p>
                      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
                        {authMode === "login" ? "Login to your account" : "Create your account"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {authMode === "login"
                          ? "Use the demo account below or sign in with your credentials."
                          : "Sign up to enter the project dashboard immediately."}
                      </p>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => { setAuthMode("login"); setLoginError(null); setSignupError(null); }}
                        className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                          authMode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Login
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode("signup"); setLoginError(null); setSignupError(null); }}
                        className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                          authMode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Sign up
                      </button>
                    </div>

                    {authMode === "login" ? (
                      <form onSubmit={handleLogin} className="space-y-4" noValidate>
                        {loginError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            {loginError}
                          </div>
                        )}

                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="login-email">
                            Email address
                          </label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="login-email"
                              type="email"
                              autoComplete="email"
                              value={loginEmail}
                              onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                              placeholder="you@example.com"
                              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="login-password">
                            Password
                          </label>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="login-password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              value={loginPassword}
                              onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                              placeholder="Enter your password"
                              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-11 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-700"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={loginLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-indigo-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-70"
                        >
                          {loginLoading ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                              <span>Signing in...</span>
                            </>
                          ) : (
                            <>
                              <span>Login</span>
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleSignup} className="space-y-4" noValidate>
                        {signupError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            {signupError}
                          </div>
                        )}

                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="signup-name">
                            Full name
                          </label>
                          <input
                            id="signup-name"
                            type="text"
                            autoComplete="name"
                            value={signupName}
                            onChange={(e) => { setSignupName(e.target.value); setSignupError(null); }}
                            placeholder="Enter your name"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="signup-email">
                            Email address
                          </label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="signup-email"
                              type="email"
                              autoComplete="email"
                              value={signupEmail}
                              onChange={(e) => { setSignupEmail(e.target.value); setSignupError(null); }}
                              placeholder="you@example.com"
                              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="signup-password">
                              Password
                            </label>
                            <div className="relative">
                              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                id="signup-password"
                                type={showSignupPassword ? "text" : "password"}
                                autoComplete="new-password"
                                value={signupPassword}
                                onChange={(e) => { setSignupPassword(e.target.value); setSignupError(null); }}
                                placeholder="Minimum 6"
                                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="signup-confirm-password">
                              Confirm
                            </label>
                            <div className="relative">
                              <input
                                id="signup-confirm-password"
                                type={showSignupPassword ? "text" : "password"}
                                autoComplete="new-password"
                                value={signupConfirmPassword}
                                onChange={(e) => { setSignupConfirmPassword(e.target.value); setSignupError(null); }}
                                placeholder="Repeat password"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                              />
                              <button
                                type="button"
                                onClick={() => setShowSignupPassword((v) => !v)}
                                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-700"
                                aria-label={showSignupPassword ? "Hide password" : "Show password"}
                              >
                                {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={signupLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-slate-200 transition-all hover:bg-slate-800 disabled:opacity-70"
                        >
                          {signupLoading ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                              <span>Creating account...</span>
                            </>
                          ) : (
                            <>
                              <span>Create account</span>
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </form>
                    )}

                    <div className="mt-7 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600">
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-700">Demo account to login</span>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                          Click to paste
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("login");
                          setLoginEmail(DEMO_EMAIL);
                          setLoginPassword(DEMO_PASSWORD);
                          setLoginError(null);
                        }}
                        className="grid w-full gap-2 rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-left transition-all hover:border-indigo-300"
                        title="Click to paste demo email and password into the login fields"
                      >
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <Mail className="h-3.5 w-3.5 text-indigo-500" />
                          {DEMO_EMAIL}
                        </span>
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <Lock className="h-3.5 w-3.5 text-indigo-500" />
                          Password: {DEMO_PASSWORD}
                        </span>
                        <span className="mt-1 text-[11px] font-bold text-indigo-500">
                          Tap here to fill both login fields automatically.
                        </span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <p className="mt-5 text-center font-mono text-[11px] text-slate-400">
              Built for academic project demonstration - Nandha Engineering College
            </p>
          </div>
        ) : (
          /* ── Student Workspace ── */
          <div className="flex flex-col gap-6 flex-1">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 p-2.5 rounded-2xl">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Question Finder</h2>
                  <p className="text-xs text-slate-400">Welcome, <span className="font-semibold text-slate-600">{user.name}</span>.</p>
                </div>
              </div>
            </div>

            {/* Dashboard Tab */}
            {activeTab === "dashboard" && (
              <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:items-stretch">

                {/* Left Sidebar — no scroll */}
                <aside
                  className="w-full lg:w-72 bg-white border border-slate-200 flex flex-col p-4 sm:p-6 lg:shrink-0 rounded-3xl shadow-sm overflow-hidden"
                >
                  {/* Topic Filters — only shows tags from session questions */}
                  <div className="mb-5 sm:mb-6 border-t border-slate-100 pt-5 pr-1 max-h-[280px] overflow-y-auto lg:max-h-none lg:overflow-visible">
                    <TagFilter
                      selectedTag={selectedTag}
                      onSelectTag={handleTagChange}
                      tagCounts={tagCounts}
                    />
                  </div>

                  {/* Session metric cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 sm:gap-4 lg:gap-5 mt-2 lg:mt-8">
                    <div className="min-h-[112px] lg:min-h-[136px] p-4 sm:p-5 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                      <div className="text-xs font-bold text-slate-700">Saved Questions</div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">{history.length}</div>
                      <div className="text-xs text-slate-500 mt-2">Synced from MongoDB</div>
                    </div>

                    <div className="min-h-[112px] lg:min-h-[136px] p-4 sm:p-5 bg-white rounded-2xl border border-slate-100 flex flex-col justify-center">
                      <div className="text-xs font-bold text-slate-700">Topics Covered</div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">{Object.keys(tagCounts).length}</div>
                      <div className="text-xs text-slate-500 mt-2">Distinct subjects this session</div>
                    </div>

                    <div className="min-h-[112px] lg:min-h-[136px] p-4 sm:p-5 bg-white rounded-2xl border border-slate-100 flex flex-col justify-center">
                      <div className="text-xs font-bold text-slate-700">Matches Found</div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">{Math.max(0, Math.floor(history.length * 0.8))}</div>
                      <div className="text-xs text-slate-500 mt-2">Similar questions retrieved</div>
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
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-4 sm:px-6 pt-5 sm:pt-6 pb-4 shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <History className="w-4 h-4 text-slate-500" />
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                            Submitted Questions — {filteredHistory.length} Record{filteredHistory.length !== 1 ? "s" : ""}
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
                        className="px-4 sm:px-6 py-4 overflow-y-auto flex-1"
                        style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}
                      >
                        {loadingHistory ? (
                          <div className="flex min-h-[230px] flex-col items-center justify-center text-center py-16">
                            <div className="study-loader study-loader-soft" aria-hidden="true">
                              <span></span>
                              <span></span>
                              <span></span>
                            </div>
                            <p className="mt-5 text-sm font-semibold text-slate-500">Loading questions...</p>
                            <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-slate-100">
                              <div className="loading-bar h-full rounded-full"></div>
                            </div>
                          </div>
                        ) : history.length === 0 ? (
                          <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl px-6 bg-slate-50/50">
                            <PlusCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 font-semibold">No submissions yet</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                              Submit a question above — it will be saved to MongoDB and appear here instantly.
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
                                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 transition-all duration-150 flex flex-col justify-between text-left cursor-pointer min-w-0"
                                >
                                  <div>
                                    <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${theme.bg} ${theme.text} border ${theme.border} max-w-full truncate`}>
                                        {item.tag}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-800 leading-normal mb-3 break-words">
                                      "{item.text}"
                                    </p>
                                  </div>
                                  <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-400 font-mono">
                                    <span>{new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="border-t border-slate-100 px-4 sm:px-6 py-4 shrink-0 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                          <button
                            onClick={() => setArchivePage((p) => Math.max(0, p - 1))}
                            disabled={archivePage === 0}
                            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Previous
                          </button>

                          <div className="hidden sm:flex items-center gap-1.5">
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
                            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <span className="basis-full sm:basis-auto text-center text-[10px] text-slate-400 font-mono sm:ml-1">
                            Page {archivePage + 1} / {totalPages}
                          </span>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div className="animate-fade-in space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-indigo-600" />
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-600">Previous Reports</span>
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">Question History</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                        Review submitted questions, detected subjects, saved matches, and submission dates.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Date
                        </span>
                        <input
                          type="date"
                          value={historyDateFilter}
                          onChange={(event) => setHistoryDateFilter(event.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <Filter className="h-3.5 w-3.5" />
                          Subject
                        </span>
                        <select
                          value={historySubjectFilter}
                          onChange={(event) => setHistorySubjectFilter(event.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                        >
                          <option value="all">All subjects</option>
                          {subjectOptions.map((subject) => (
                            <option key={subject} value={subject}>{subject}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <div className="text-sm font-bold text-slate-700">
                      Showing {reportHistory.length} of {history.length} report{history.length !== 1 ? "s" : ""}
                    </div>
                    {(historyDateFilter || historySubjectFilter !== "all") && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryDateFilter("");
                          setHistorySubjectFilter("all");
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  {loadingHistory ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                      <div className="study-loader study-loader-soft" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <p className="mt-5 text-sm font-semibold text-slate-500">Loading previous reports...</p>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
                      <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">No previous reports found</p>
                      <p className="mt-1 text-xs text-slate-400">Submitted questions will appear here after they are saved.</p>
                    </div>
                  ) : reportHistory.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
                      <Filter className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">No reports match these filters</p>
                      <p className="mt-1 text-xs text-slate-400">Try another date or subject.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {reportHistory.map((item) => {
                        const theme = TOPIC_THEMES[item.tag] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
                        const matchCount = item.similarQuestions?.length || 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedQuestion(item)}
                            className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md sm:p-5"
                          >
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                              <span className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${theme.bg} ${theme.text} ${theme.border}`}>
                                {item.tag}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                                {new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </div>

                            <p className="text-sm font-bold leading-6 text-slate-800 break-words">
                              "{item.text}"
                            </p>

                            <div className="mt-5 border-t border-slate-100 pt-4">
                              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Matches</div>
                                <div className="mt-1 text-sm font-extrabold text-slate-900">{matchCount}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-md px-3 sm:px-4 py-4 sm:py-8"
          onClick={() => setSelectedQuestion(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] overflow-hidden rounded-2xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl animate-fade-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 sm:gap-4 border-b border-slate-100 px-4 sm:px-6 py-4 sm:py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Previous Question</span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug break-words">"{selectedQuestion.text}"</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
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

            <div className="px-4 sm:px-6 py-5 overflow-y-auto max-h-[64vh] sm:max-h-[58vh]">
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
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                          <p className="text-sm font-semibold leading-relaxed text-slate-800 break-words">"{match.text}"</p>
                          <span className="shrink-0 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold font-mono text-indigo-600">
                            {percent}%
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-400">
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
