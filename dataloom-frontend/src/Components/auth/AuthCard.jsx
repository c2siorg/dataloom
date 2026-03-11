import { Link } from "react-router-dom";
import DataLoomLogo from "../common/DataLoomLogo";

export default function AuthCard({
  title,
  subtitle,
  footerText,
  footerLinkText,
  footerTo,
  children,
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 rounded-full bg-blue-50 p-3 text-blue-500">
            <DataLoomLogo className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
        </div>

        {children}

        <p className="mt-6 text-center text-sm text-gray-500">
          {footerText}{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" to={footerTo}>
            {footerLinkText}
          </Link>
        </p>
      </div>
    </div>
  );
}
