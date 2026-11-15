import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import AuthShell from "../components/AuthShell";
import { AlertIcon, CheckCircleIcon, EyeIcon, EyeOffIcon } from "../components/icons";

const backToLogin = (
  <Link to="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
    ← Back to sign in
  </Link>
);

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [status, setStatus] = useState("checking"); // checking | ready | invalid | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Find out right away whether the emailed link is still good
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    api
      .get("/auth/reset-password/check", { params: { token } })
      .then(({ data }) => setStatus(data.valid ? "ready" : "invalid"))
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("The two passwords do not match");
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setStatus("done");
    } catch (err) {
      if (err.response?.status === 400 && /invalid or has expired/i.test(err.response?.data?.error || "")) setStatus("invalid");
      else setError(err.response?.data?.error || "Could not reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <AuthShell title="Reset your password">
        <div className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
          Checking your link…
        </div>
      </AuthShell>
    );
  }

  if (status === "invalid") {
    return (
      <AuthShell title="This link is not valid" subtitle="It may have expired or already been used." footer={backToLogin}>
        <div className="card p-6 text-center space-y-4">
          <span className="mx-auto h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center">
            <AlertIcon className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-600 dark:text-gray-300">Reset links work once and expire after an hour. Request a new one to continue.</p>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (status === "done") {
    return (
      <AuthShell title="Password updated" subtitle="You can now sign in with your new password.">
        <div className="card p-6 text-center space-y-4">
          <span className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
            <CheckCircleIcon className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-600 dark:text-gray-300">For your security, any devices that were signed in have been signed out.</p>
          <button type="button" onClick={() => navigate("/login")} className="btn-primary w-full">
            Go to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  const missing = 8 - password.length;
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something at least 8 characters long." footer={backToLogin}>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {error && (
          <div role="alert" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              required
              autoFocus
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full pr-10"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {password.length > 0 && missing > 0 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {missing} more character{missing === 1 ? "" : "s"} needed
            </p>
          )}
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input w-full"
            placeholder="Type it again"
          />
          {confirm && password !== confirm && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Passwords do not match yet</p>}
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Saving…" : "Reset password"}
        </button>
      </form>
    </AuthShell>
  );
}
