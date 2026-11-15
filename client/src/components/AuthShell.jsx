import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";

// The centered card layout shared by the sign-in style pages.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" aria-label="Inventra home" className="inline-flex mb-3">
            <BrandLogo className="h-12" />
          </Link>
          <h1 className="text-xl font-semibold dark:text-gray-100">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">{footer}</div>}
      </div>
    </div>
  );
}
