/**
 * Loading spinner indicator.
 * @param {Object} props
 * @param {string} [props.message="Loading..."] - Text shown below spinner.
 */
export default function LoadingSpinner({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center p-8" aria-busy="true">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      <p className="mt-2 text-gray-500 text-sm">{message}</p>
    </div>
  );
}
