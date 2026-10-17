"use client";

import { FormEvent, useState } from "react";
import { useAppState } from "@/context/StateContext";

export function AuthView() {
  const { authError, signIn, register } = useAppState();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const authenticated = isRegistering
        ? await register({
            name,
            organizationName: organizationName.trim() || undefined,
            email,
            password,
          })
        : await signIn(email, password);
      if (!authenticated) setError(authError);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 font-bold">
            B
          </div>
          <h1 className="text-2xl font-semibold">BoomiSolutions</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isRegistering ? "Create your workspace account" : "Sign in to your workspace"}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {isRegistering && (
            <>
              <label className="block space-y-1 text-sm">
                <span>Name</span>
                <input
                  required
                  minLength={2}
                  autoComplete="name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Organization name (optional)</span>
                <input
                  minLength={2}
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Password</span>
            <input
              required
              minLength={8}
              type="password"
              autoComplete={isRegistering ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {(error || authError) && (
            <p role="alert" className="rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">
              {error ?? authError}
            </p>
          )}
          <button
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
          >
            {pending ? "Please wait..." : isRegistering ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="mt-6 w-full text-sm text-indigo-300 hover:text-indigo-200"
          onClick={() => {
            setIsRegistering((value) => !value);
            setError(null);
          }}
        >
          {isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
