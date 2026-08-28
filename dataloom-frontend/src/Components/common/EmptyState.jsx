import PropTypes from "prop-types";

/**
 * Shared empty-state placeholder.
 * Default layout matches the Homescreen empty projects card.
 * Pass `compact` to render title-only copy for table-cell empty rows.
 */
const EmptyState = ({ title, description, action, icon, compact = false }) => {
  if (compact) {
    return title;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border-2 border-dashed border-app-border bg-surface text-center">
      {icon ? (
        <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">{description}</p>
      ) : null}
      {action ?? null}
    </div>
  );
};

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
  icon: PropTypes.node,
  compact: PropTypes.bool,
};

export default EmptyState;
