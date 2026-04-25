import PropTypes from "prop-types";

const FormErrorAlert = ({ message }) => {
  if (!message) return null;

  return (
    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  );
};

FormErrorAlert.propTypes = {
  message: PropTypes.string,
};

export default FormErrorAlert;
