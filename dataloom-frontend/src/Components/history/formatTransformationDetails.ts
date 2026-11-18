export const formatTransformationDetails = (
  details: Record<string, unknown>,
): string => {
  if (!details || Object.keys(details).length === 0) {
    return "-";
  }

  const operationType =
    typeof details.operation_type === "string"
      ? details.operation_type
      : "";

  const parameters =
    details.parameters &&
    typeof details.parameters === "object"
      ? (details.parameters as Record<string, unknown>)
      : null;

  const formatLabel = (key: string): string => {
    return key
      .replace(/_params$/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (Array.isArray(value)) {
      return value.map(formatValue).join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const formatObject = (obj: Record<string, unknown>): string => {
    return Object.entries(obj)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => {
        return `${formatLabel(key)}: ${formatValue(value)}`;
      })
      .join(", ");
  };

  const formatFilter = (obj: Record<string, unknown>): string => {
    const column = obj.column;
    const condition = obj.condition;
    const value = obj.value;

    if (
      column !== undefined &&
      condition !== undefined &&
      value !== undefined
    ) {
      return `${String(column)} ${String(condition)} ${formatValue(value)}`;
    }

    return formatObject(obj);
  };

  const formatSort = (obj: Record<string, unknown>): string => {
    if (Array.isArray(obj.criteria)) {
      const criteria = obj.criteria
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null,
        )
        .map((item) => {
          const column = String(item.column ?? "");
          const direction = item.ascending === false ? "↓" : "↑";

          return `${column} ${direction}`;
        })
        .filter(Boolean);

      if (criteria.length > 0) {
        return `Sort by ${criteria.join(", ")}`;
      }
    }

    if (obj.column) {
      const direction = obj.ascending === false ? "↓" : "↑";
      return `Sort by ${String(obj.column)} ${direction}`;
    }

    return formatObject(obj);
  };

  const formatParameters = (
    params: Record<string, unknown>,
  ): string => {
    if (
      params.column !== undefined &&
      params.condition !== undefined &&
      params.value !== undefined
    ) {
      return formatFilter(params);
    }

    if (
      params.criteria !== undefined ||
      params.ascending !== undefined
    ) {
      return formatSort(params);
    }

    return formatObject(params);
  };

  if (parameters && Object.keys(parameters).length > 0) {
    return formatParameters(parameters);
  }

  const parameterFields = [
    "sort_params",
    "row_params",
    "add_col_params",
    "del_col_params",
    "fill_empty_params",
    "drop_duplicate",
    "adv_query",
    "pivot_query",
    "change_cell_value",
    "rename_col_params",
    "cast_data_type_params",
    "trim_whitespace_params",
    "drop_na_params",
    "melt_params",
    "sample_params",
    "groupby_params",
    "add_file_params",
    "formula_col_params",
  ];

  for (const field of parameterFields) {
    const value = details[field];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const params = value as Record<string, unknown>;

      if (field === "sort_params") {
        return formatSort(params);
      }

      return formatParameters(params);
    }
  }

  if (operationType) {
    return formatLabel(operationType);
  }

  return formatObject(details);
};