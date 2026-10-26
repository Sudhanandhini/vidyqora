import ExcelJS from 'exceljs';

const NAVY = 'FF062A52';
const SAND = 'FFD9C39B';

/**
 * Stream an .xlsx with a title block, filter summary and styled header.
 * columns: [{ header, key, width }]
 */
export async function sendExcel(res, { filename, title, filters = '', columns, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vidyqora';
  const ws = wb.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 4 }] });
  const n = Math.max(columns.length, 2);

  ws.mergeCells(1, 1, 1, n);
  ws.getCell('A1').value = `${process.env.INSTITUTION_NAME || 'Vidyqora'} - ${title}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, n);
  ws.getCell('A2').value = `${filters ? `${filters}   |   ` : ''}Generated ${new Date().toLocaleString('en-IN')}`;
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF555555' } };

  ws.getRow(4).values = columns.map((c) => c.header);
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 16 }));
  const head = ws.getRow(4);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.border = { bottom: { style: 'medium', color: { argb: SAND } } };
  });

  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    if (i % 2) row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } }; });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');
