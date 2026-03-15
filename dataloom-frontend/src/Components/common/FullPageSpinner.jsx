import LoadingSpinner from "./LoadingSpinner";

export default function FullPageSpinner({ message = "Loading..." }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <LoadingSpinner message={message} />
    </div>
  );
}
