const DTYPE_STYLES: Record<string, string> = {
  int: "bg-blue-100 text-blue-700",
  float: "bg-teal-100 text-teal-700",
  str: "bg-green-100 text-green-700",
  datetime: "bg-purple-100 text-purple-700",
  bool: "bg-orange-100 text-orange-700",
};

interface DtypeBadgeProps {
  dtype?: string | null;
  className?: string;
}

const DtypeBadge = ({ dtype, className = "ml-1.5" }: DtypeBadgeProps) => {
  if (!dtype) return null;

  const style = DTYPE_STYLES[dtype] || "bg-gray-100 text-gray-700";

  return (
    <span
      className={`${className} inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${style}`}
    >
      {dtype}
    </span>
  );
};

export default DtypeBadge;
