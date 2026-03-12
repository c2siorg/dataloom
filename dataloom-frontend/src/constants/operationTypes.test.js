import * as ops from "../constants/operationTypes";

test("operation type constants match backend contract", () => {
  expect(ops.ADD_ROW).toBe("addRow");
  expect(ops.ADD_COLUMN).toBe("addCol");
  expect(ops.DELETE_ROW).toBe("delRow");
  expect(ops.DELETE_COLUMN).toBe("delCol");
  expect(ops.RENAME_COLUMN).toBe("renameCol");
  expect(ops.CHANGE_CELL_VALUE).toBe("changeCellValue");
  expect(ops.ADV_QUERY_FILTER).toBe("advQueryFilter");
  expect(ops.CAST_DATA_TYPE).toBe("castDataType");
  expect(ops.DROP_DUPLICATE).toBe("dropDuplicate");
  expect(ops.FILTER).toBe("filter");
  expect(ops.PIVOT_TABLES).toBe("pivotTables");
  expect(ops.SORT).toBe("sort");
  expect(ops.TRIM_WHITESPACE).toBe("trimWhitespace");
});
