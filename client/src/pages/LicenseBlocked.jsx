import { useAuth } from "../context/AuthContext";
import BrandLogo from "../components/BrandLogo";

// Shown instead of the app when a client's license is expired or suspended.
export default function LicenseBlocked() {
  const { user, license, logout, refresh } = useAuth();
  const expired = license?.blockedReason === "EXPIRED";
  const contactEmail = import.meta.env.VITE_CONTACT_EMAIL;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <BrandLogo className="h-12" />
        </div>
        <h1 className="text-xl font-semibold dark:text-gray-100">{expired ? "Your license has expired" : "Your account is suspended"}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {expired
            ? `Access for ${user?.companyName || "your company"} ended on ${new Date(license.expiresAt).toLocaleDateString(undefined, { timeZone: "UTC" })}.`
            : `Access for ${user?.companyName || "your company"} has been turned off.`}{" "}
          Your data is safe and will be available again as soon as the license is renewed or reactivated.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}?subject=License%20for%20${encodeURIComponent(user?.companyName || "")}`}
              className="btn-primary"
            >
              Contact us to renew
            </a>
          )}
          <button
            onClick={() => refresh().catch(() => {})}
            className="btn-secondary"
          >
            I've renewed — check again
          </button>
          <button onClick={logout} className="text-sm font-medium text-gray-500 dark:text-gray-400 px-5 py-2.5 hover:underline">
            Log out
          </button>
        </div>
        {!contactEmail && <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Please contact your provider to renew.</p>}
      </div>
    </div>
  );
}
