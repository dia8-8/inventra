import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import AuthShell from "../components/AuthShell";
import { MailIcon } from "../components/icons";

export default function ForgotPassword() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSentTo(email.trim());
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const backToLogin = (
    <Link to="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
      ← Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle="If we have an account for that address, a reset link is on its way." footer={backToLogin}>
        <div className="card p-6 text-center space-y-4">
          <span className="mx-auto h-12 w-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center">
            <MailIcon className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            We sent instructions to <span className="font-medium text-gray-900 dark:text-gray-100 break-all">{sentTo}</span>. The link works for one hour.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Nothing there? Check your spam folder, or make sure you used the email you signed up with.</p>
          <button type="button" onClick={() => setSentTo("")} className="btn-secondary w-full">
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to reset it." footer={backToLogin}>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input id="email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-full" placeholder="you@company.com" />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
