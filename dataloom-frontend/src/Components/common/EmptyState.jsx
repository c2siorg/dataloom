/**
 * Reusable empty state component with icon, title, description, and optional action button.
 * @param {Object} props
 * @param {string} [props.icon] - SVG icon name: 'folder', 'inbox', 'package'
 * @param {string} props.title - Main title text
 * @param {string} props.description - Descriptive message
 * @param {Object} [props.action] - Optional action button config
 * @param {string} props.action.label - Button text
 * @param {Function} props.action.onClick - Button click handler
 */
export default function EmptyState({ icon = "inbox", title, description, action }) {
    const icons = {
        folder: (
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
        ),
        inbox: (
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
        ),
        package: (
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
        ),
    };

    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-4">{icons[icon]}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-500 mb-6 max-w-sm">{description}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-md transition-colors duration-150"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}
