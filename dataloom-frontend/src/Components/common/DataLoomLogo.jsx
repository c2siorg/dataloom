/**
 * DataLoom logo — 2×2 interlaced bar weave pattern.
 * Uses currentColor so it inherits the parent's text color.
 * @param {Object} props
 * @param {string} [props.className] - Additional CSS classes for sizing.
 */
export default function DataLoomLogo({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* H1: over V1, under V2 */}
      <rect x="10" y="29" width="47" height="12" rx="6" />
      <rect x="73" y="29" width="17" height="12" rx="6" />

      {/* H2: under V1, over V2 */}
      <rect x="10" y="59" width="17" height="12" rx="6" />
      <rect x="43" y="59" width="47" height="12" rx="6" />

      {/* V1: under H1, over H2 */}
      <rect x="29" y="10" width="12" height="17" rx="6" />
      <rect x="29" y="43" width="12" height="47" rx="6" />

      {/* V2: over H1, under H2 */}
      <rect x="59" y="10" width="12" height="47" rx="6" />
      <rect x="59" y="73" width="12" height="17" rx="6" />
    </svg>
  );
}
