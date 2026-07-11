import PropTypes from "prop-types";

const FormErrorAlert = ({ message }) => {
  if (!message) return null;

  return (
    <div className="mt-3 p-3 bg-danger-bg border border-danger-border rounded-md text-sm text-danger">
      {message}
    </div>
  );
};

FormErrorAlert.propTypes = {
  message: PropTypes.string,
};

export default FormErrorAlert;
