"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  Globe2,
  Lock,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Users
} from "lucide-react";

const STORAGE_KEY = "the-hive-analytics-dashboard-key";
const numberFormatter = new Intl.NumberFormat("en-US");

function getStoredAuthKey() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeAuthKey(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The state still works for this page load if storage is unavailable.
  }
}

function clearStoredAuthKey() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function formatNumber(value) {
  return numberFormatter.format(value || 0);
}

function formatDuration(seconds) {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${total}s`;
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="analytics-card">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function DataTable({ title, rows, columns, empty = "No data yet" }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      {rows?.length ? (
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="analytics-empty">{empty}</div>
      )}
    </section>
  );
}

export default function AnalyticsDashboard() {
  const [password, setPassword] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [hours, setHours] = useState("24");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthKey(getStoredAuthKey());
  }, []);

  const totals = summary?.totals || {};
  const avgEngaged = useMemo(() => {
    if (!totals.sessions) {
      return 0;
    }

    return Math.round((Number(totals.engaged_seconds) || 0) / totals.sessions);
  }, [totals.engaged_seconds, totals.sessions]);

  async function loadSummary(nextKey = authKey) {
    if (!nextKey) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/analytics/summary?hours=${encodeURIComponent(hours)}`, {
        headers: {
          Authorization: `Bearer ${nextKey}`
        },
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Analytics failed to load.");
      }

      setSummary(payload);
    } catch (loadError) {
      setError(loadError.message);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authKey) {
      loadSummary(authKey);
    }
  }, [authKey, hours]);

  function handleLogin(event) {
    event.preventDefault();
    const nextKey = password.trim();
    if (!nextKey) {
      return;
    }

    storeAuthKey(nextKey);
    setAuthKey(nextKey);
    setPassword("");
  }

  function handleLogout() {
    clearStoredAuthKey();
    setAuthKey("");
    setSummary(null);
  }

  return (
    <main className="analytics-page">
      <header className="analytics-hero">
        <div>
          <div className="section-kicker">
            <BarChart3 size={18} aria-hidden="true" />
            The Hive analytics
          </div>
          <h1>Club traffic dashboard</h1>
          <p>Self-hosted visits, engagement, devices, referrers, and page events.</p>
        </div>

        {authKey ? (
          <div className="analytics-controls">
            <select value={hours} onChange={(event) => setHours(event.target.value)} aria-label="Time window">
              <option value="1">Last hour</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
            </select>
            <button type="button" onClick={() => loadSummary()} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" onClick={handleLogout}>
              <Lock size={16} aria-hidden="true" />
              Lock
            </button>
          </div>
        ) : null}
      </header>

      {!authKey ? (
        <form className="analytics-login" onSubmit={handleLogin}>
          <Lock size={22} aria-hidden="true" />
          <strong>Analytics password</strong>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Enter dashboard key"
            autoComplete="current-password"
          />
          <button type="submit">Open dashboard</button>
        </form>
      ) : (
        <>
          {error ? <div className="error-banner">{error}</div> : null}

          <section className="analytics-cards">
            <StatCard icon={Users} label="Visitors" value={formatNumber(totals.visitors)} />
            <StatCard icon={Activity} label="Sessions" value={formatNumber(totals.sessions)} />
            <StatCard icon={MousePointerClick} label="Page views" value={formatNumber(totals.page_views)} />
            <StatCard icon={Clock} label="Engagement" value={formatDuration(totals.engaged_seconds)} hint={`${formatDuration(avgEngaged)} avg/session`} />
          </section>

          {summary ? (
            <div className="analytics-grid">
              <DataTable
                title="Events"
                rows={summary.events}
                columns={[
                  { key: "name", label: "Event" },
                  { key: "count", label: "Count", render: (row) => formatNumber(row.count) }
                ]}
              />
              <DataTable
                title="Countries"
                rows={summary.countries}
                columns={[
                  { key: "country", label: "Country" },
                  { key: "visitors", label: "Visitors", render: (row) => formatNumber(row.visitors) },
                  { key: "events", label: "Events", render: (row) => formatNumber(row.events) }
                ]}
              />
              <DataTable
                title="Devices"
                rows={summary.devices}
                columns={[
                  { key: "device", label: "Device", render: (row) => <><Smartphone size={14} aria-hidden="true" /> {row.device}</> },
                  { key: "visitors", label: "Visitors", render: (row) => formatNumber(row.visitors) },
                  { key: "events", label: "Events", render: (row) => formatNumber(row.events) }
                ]}
              />
              <DataTable
                title="Top pages"
                rows={summary.topPages}
                columns={[
                  { key: "path", label: "Path" },
                  { key: "page_views", label: "Views", render: (row) => formatNumber(row.page_views) },
                  { key: "visitors", label: "Visitors", render: (row) => formatNumber(row.visitors) }
                ]}
              />
              <DataTable
                title="Referrers"
                rows={summary.referrers}
                columns={[
                  { key: "referrer", label: "Referrer", render: (row) => <><Globe2 size={14} aria-hidden="true" /> {row.referrer}</> },
                  { key: "page_views", label: "Views", render: (row) => formatNumber(row.page_views) }
                ]}
              />
            </div>
          ) : loading ? (
            <div className="loading-stack">
              <span />
              <span />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
