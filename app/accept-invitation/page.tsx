"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api-client";

export default function AcceptInvitationPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const acceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      if (!token) {
        setError("Invitation link is missing or invalid.");
        return;
      }
      await api.team.acceptInvitation({ token, name, password });
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setAccepted(true);
    } catch (acceptError) {
      const message = acceptError instanceof ApiError
        ? acceptError.message
        : acceptError instanceof Error
          ? acceptError.message
          : "Unable to accept this invitation.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Accept team invitation</h1>
        {accepted ? (
          <div className="mt-5 grid gap-4">
            <p role="status" className="text-sm text-emerald-300">Invitation accepted. Your organization membership is ready.</p>
            <Link className="rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white" href="/#/teams">
              Open Team Management
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-300">
              Enter your name and password to accept the invitation. Use your existing account password if you already have an account.
            </p>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            <form className="mt-5 grid gap-4" onSubmit={(event) => void acceptInvitation(event)}>
              <label className="grid gap-1 text-sm">Name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">Password
                <input
                  required
                  minLength={8}
                  maxLength={128}
                  type="password"
                  autoComplete="new-password"
                  className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Accepting..." : "Accept Invitation"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
