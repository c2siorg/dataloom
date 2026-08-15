interface FormErrorAlertProps {
  message?: string | null;
}

const FormErrorAlert = ({ message }: FormErrorAlertProps) => {
  if (!message) return null;

  return (
    <div className="mt-3 p-3 bg-danger-bg border border-danger-border rounded-md text-sm text-danger">
      {message}
    </div>
  );
};

export default FormErrorAlert;
