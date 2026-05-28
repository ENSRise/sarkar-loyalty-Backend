import PDFDocument from 'pdfkit';

const PDF_ROW_LIMIT = 10000;

// ─── CSV ───────────────────────────────────────────────────────────────────────

const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

/**
 * Stream CSV to response in batches to avoid loading millions of rows at once.
 * @param {object} res - Express response
 * @param {string} filename
 * @param {Array<{label:string, key:string}>} columns
 * @param {function(limit, offset): Promise<object[]>} fetchBatch - called until empty batch
 */
export const streamCSV = async (res, filename, columns, fetchBatch) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.write(columns.map(c => c.label).join(',') + '\n');

  const BATCH = 5000;
  let offset = 0;

  while (true) {
    const rows = await fetchBatch(BATCH, offset);
    if (!rows.length) break;

    for (const row of rows) {
      res.write(columns.map(c => escapeCSV(row[c.key])).join(',') + '\n');
    }

    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  res.end();
};

// ─── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Generate and pipe a PDF table to response.
 * Limited to PDF_ROW_LIMIT rows.
 * @param {object} res - Express response
 * @param {string} filename
 * @param {string} title
 * @param {Array<{label:string, key:string, width?:number}>} columns
 * @param {object[]} rows - plain objects (use raw:true in Sequelize)
 */
export const sendPDF = (res, filename, title, columns, rows) => {
  const limited = rows.length > PDF_ROW_LIMIT;
  const data = limited ? rows.slice(0, PDF_ROW_LIMIT) : rows;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width - 60;
  const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);

  // Pre-compute column x positions and widths
  const colDefs = (() => {
    let x = 30;
    return columns.map(c => {
      const w = Math.floor(((c.weight || 1) / totalWeight) * pageW);
      const def = { ...c, x, w };
      x += w;
      return def;
    });
  })();

  // Title block
  doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).font('Helvetica').text(
    `Generated: ${new Date().toLocaleString()}  |  Records: ${data.length}${limited ? ` (capped at ${PDF_ROW_LIMIT})` : ''}`,
    { align: 'center' }
  );
  doc.moveDown(0.6);

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(8);
    colDefs.forEach(col => {
      doc.text(col.label, col.x, y, { width: col.w - 4, lineBreak: false });
    });
    const lineY = y + 13;
    doc.moveTo(30, lineY).lineTo(30 + pageW, lineY).strokeColor('#333').stroke();
    return lineY + 4;
  };

  let y = drawHeader(doc.y);

  doc.font('Helvetica').fontSize(7);

  for (const row of data) {
    if (y > doc.page.height - 50) {
      doc.addPage();
      y = drawHeader(30);
      doc.font('Helvetica').fontSize(7);
    }

    colDefs.forEach(col => {
      const val = row[col.key] ?? '';
      doc.text(String(val), col.x, y, { width: col.w - 4, lineBreak: false });
    });

    y += 14;
  }

  doc.end();
};
