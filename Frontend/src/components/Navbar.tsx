/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { LogOut, User, Sparkles, Search } from "lucide-react";

export type AppTab = "dashboard" | "history" | "stats";

interface NavbarProps {
  user: { name: string; email: string } | null;
  onLogout: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

export default function Navbar({ user, onLogout, activeTab, setActiveTab }: NavbarProps) {
  return (
    <nav className="min-h-16 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 sm:px-8 sm:py-0 shrink-0 shadow-sm sticky top-0 z-50">
      
      {/* Brand Logo matching template design */}
      <div className="flex w-full sm:w-auto items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
          <Search className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-800">
            Question Finder
          </span>
        </div>
      </div>

      {/* Navigation and Account links */}
      {user ? (
        <div className="flex w-full sm:w-auto flex-1 sm:flex-none items-center justify-between sm:justify-end gap-2 sm:gap-6 min-w-0">
          <div className="no-scrollbar flex gap-1.5 sm:gap-4 text-sm font-medium min-w-0 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`shrink-0 transition-colors py-1 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
                activeTab === "dashboard"
                  ? "text-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`shrink-0 transition-colors py-1 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
                activeTab === "history"
                  ? "text-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`shrink-0 transition-colors py-1 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
                activeTab === "stats"
                  ? "text-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="hidden sm:inline">System Statistics</span>
              <span className="sm:hidden">Stats</span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900 leading-none">{user.name}</div>
              
            </div>
            <div className="hidden min-[380px]:flex w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-full items-center justify-center text-indigo-600 shadow-sm relative group">
              <User className="w-4 h-4" />
              <div className="absolute right-0 top-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
            </div>
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50/50 rounded-lg transition-all border border-transparent hover:border-red-100 shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs font-mono bg-indigo-50 text-indigo-700 px-3.5 py-1.5 rounded-full font-bold border border-indigo-100">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Semantic Core Ready</span>
        </div>
      )}

    </nav>
  );
}
