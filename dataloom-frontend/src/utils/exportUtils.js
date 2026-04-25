import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const escapeCsvValue = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

const buildCsv = (columns, rows) => {
  const header = columns.map(escapeCsvValue).join(",");
  const body = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  return [header, body].filter(Boolean).join("\n");
};

export const downloadCsv = (filename, columns, rows) => {
  const csv = buildCsv(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const downloadJson = (filename, columns, rows) => {
  const json = rows.map((row) =>
    columns.reduce((acc, column, index) => {
      acc[column] = row[index];
      return acc;
    }, {}),
  );
  const blob = new Blob([JSON.stringify(json, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const downloadExcel = (filename, columns, rows) => {
  const sheetData = [columns, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ExportData");
  XLSX.writeFile(workbook, filename);
};

export const downloadPdf = (filename, columns, rows, title = "Dataset Export") => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 35);
  autoTable(doc, {
    startY: 50,
    head: [columns],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename);
};
