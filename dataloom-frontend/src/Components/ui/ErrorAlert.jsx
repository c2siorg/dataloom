/**
 * Error alert component for displaying error messages.
 * @module Components/ui/ErrorAlert
 */

/**
 * Displays an error message in a red alert box.
 * @param {Object} props
 * @param {string|null|undefined} props.message - Error message to display.
 * @returns {JSX.Element|null} Red alert box or null if no message.
 */
export default function ErrorAlert({ message }) {
    if (!message) return null;

    return (
        <div
            className="bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg px-4 py-3 text-red-800"
            role="alert"
        >
            {message}
        </div>
    );
}