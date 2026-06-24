/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { LogOut, User, Sparkles, Search } from "lucide-react";

interface NavbarProps {
  user: { name: string; email: string } | null;
  onLogout: () => void;
  activeTab: "dashboard" | "stats";
  setActiveTab: (tab: "dashboard" | "stats") => void;
}

export default function Navbar({ user, onLogout, activeTab, setActiveTab }: NavbarProps) {
  return (
    <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0 shadow-sm sticky top-0 z-50">
      
      {/* Brand Logo matching template design */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
          <Search className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-lg font-extrabold tracking-tight text-slate-800">
            Question Finder
          </span>
        </div>
      </div>

      {/* Navigation and Account links */}
      {user ? (
        <div className="flex items-center gap-6">
          <div className="flex gap-1.5 sm:gap-4 text-sm font-medium">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`transition-colors py-1 px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
                activeTab === "dashboard"
                  ? "text-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`transition-colors py-1 px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
                activeTab === "stats"
                  ? "text-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              System Statistics
            </button>
          </div>

          <div className="flex items-center gap-3 pl-4 sm:pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900 leading-none">{user.name}</div>
              <div className="text-[10px] text-slate-500 mt-1">Premium Student Portal</div>
            </div>
            <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shadow-sm relative group">
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
