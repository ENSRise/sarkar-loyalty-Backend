import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const PDF_ROW_LIMIT = 10000;

// ─── CSV ───────────────────────────────────────────────────────────────────────

const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

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

// ─── XLSX ──────────────────────────────────────────────────────────────────────

/**
 * Generate and pipe an XLSX (Excel) workbook to response.
 * @param {object}   res      - Express response
 * @param {string}   filename - e.g. "customers.xlsx"
 * @param {string}   title    - Sheet name / title row text
 * @param {Array<{label:string, key:string, width?:number, formatter?:function}>} columns
 * @param {object[]} rows     - plain objects (use raw:true in Sequelize)
 */
export const sendXLSX = async (res, filename, title, columns, rows) => {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Loyalty Sarkar';
  wb.created  = new Date();

  const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 2 }] });

  // ── Title row ──
  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = `${title}  |  Generated: ${new Date().toLocaleString('en-IN')}  |  Records: ${rows.length}`;
  titleCell.font  = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008060' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  // ── Header row ──
  const headerRow = ws.getRow(2);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font  = { bold: true, size: 10, color: { argb: 'FF1a1a1a' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF008060' } },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = col.width || 20;
  });
  headerRow.height = 28;

  // ── Data rows ──
  rows.forEach((row, rowIdx) => {
    const dataRow = ws.addRow(
      columns.map(col => {
        const raw = row[col.key];
        return col.formatter ? col.formatter(raw, row) : (raw ?? '');
      })
    );

    dataRow.height = 18;
    const isEven   = rowIdx % 2 === 0;

    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF9FAFB' } };
      cell.font      = { size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
    });
  });

  // ── Auto-freeze + send ──
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
};

// ─── Customer XLSX (two-sheet: Customers + Referral Details) ─────────────────

/**
 * Two-sheet customer workbook:
 *   Sheet 1 — "Customers"        : all customer rows
 *   Sheet 2 — "Referral Details" : one row per referral relationship
 */
export const sendCustomerXLSX = async (res, filename, columns, rows) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Loyalty Sarkar';
  wb.created = new Date();

  const GREEN  = 'FF008060';
  const WHITE  = 'FFFFFFFF';
  const GRAY   = 'FFF3F4F6';
  const STRIPE = 'FFF9FAFB';
  const LINE   = 'FFE5E7EB';

  const applyHeaderCell = (cell, value) => {
    cell.value = value;
    cell.font  = { bold: true, size: 10, color: { argb: 'FF1a1a1a' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
    cell.border = { bottom: { style: 'medium', color: { argb: GREEN } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };

  const applyTitleRow = (ws, colCount, text) => {
    ws.mergeCells(1, 1, 1, colCount);
    const c = ws.getCell('A1');
    c.value = text;
    c.font  = { bold: true, size: 11, color: { argb: WHITE } };
    c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 22;
  };

  const applyDataCell = (cell, isEven) => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? WHITE : STRIPE } };
    cell.font  = { size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
  };

  // ── Sheet 1: Customers ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Customers', { views: [{ state: 'frozen', ySplit: 2 }] });

  applyTitleRow(ws1, columns.length,
    `Customers  |  Generated: ${new Date().toLocaleString('en-IN')}  |  Records: ${rows.length}`);

  const hdr1 = ws1.getRow(2);
  columns.forEach((col, i) => {
    applyHeaderCell(hdr1.getCell(i + 1), col.label);
    ws1.getColumn(i + 1).width = col.width || 20;
  });
  hdr1.height = 28;

  rows.forEach((row, ri) => {
    const dr = ws1.addRow(
      columns.map(col => {
        const raw = row[col.key];
        return col.formatter ? col.formatter(raw, row) : (raw ?? '');
      })
    );
    dr.height = 18;
    dr.eachCell({ includeEmpty: true }, cell => applyDataCell(cell, ri % 2 === 0));
  });

  // ── Sheet 2: Referral Details ───────────────────────────────────────────────
  const refCols = [
    { label: 'Referrer Name',       width: 22 },
    { label: 'Referrer Phone',      width: 18 },
    { label: 'Referrer Tier',       width: 14 },
    { label: 'Referrer Wallet (₹)', width: 18 },
    { label: 'Referred Name',       width: 22 },
    { label: 'Referred Phone',      width: 18 },
    { label: 'Coupon Code',         width: 18 },
    { label: 'Shopify Customer ID', width: 24 },
  ];

  // Expand: one row per referred customer
  const refRows = [];
  rows.forEach(r => {
    const parts = (() => {
      if (!r.customerReferralPart) return [];
      try {
        const arr = typeof r.customerReferralPart === 'string'
          ? JSON.parse(r.customerReferralPart)
          : r.customerReferralPart;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();

    if (!parts.length) return;

    parts.forEach(ref => {
      refRows.push([
        `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        r.phone || '',
        r.currentTier || '',
        parseFloat(r.wallet || 0),
        ref.name       || '',
        ref.phonenumber || '',
        ref.couponCode  || '',
        ref.customer_id || '',
      ]);
    });
  });

  const ws2 = wb.addWorksheet('Referral Details', { views: [{ state: 'frozen', ySplit: 2 }] });

  applyTitleRow(ws2, refCols.length,
    `Referral Details  |  Generated: ${new Date().toLocaleString('en-IN')}  |  Total Referrals: ${refRows.length}`);

  const hdr2 = ws2.getRow(2);
  refCols.forEach((col, i) => {
    applyHeaderCell(hdr2.getCell(i + 1), col.label);
    ws2.getColumn(i + 1).width = col.width;
  });
  hdr2.height = 28;

  refRows.forEach((values, ri) => {
    const dr = ws2.addRow(values);
    dr.height = 18;
    dr.eachCell({ includeEmpty: true }, cell => applyDataCell(cell, ri % 2 === 0));
  });

  if (refRows.length === 0) {
    const emptyRow = ws2.addRow(['No referral data found']);
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 10 };
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
};

// ─── PDF ───────────────────────────────────────────────────────────────────────

export const sendPDF = (res, filename, title, columns, rows) => {
  const limited = rows.length > PDF_ROW_LIMIT;
  const data = limited ? rows.slice(0, PDF_ROW_LIMIT) : rows;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width - 60;
  const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);

  const colDefs = (() => {
    let x = 30;
    return columns.map(c => {
      const w = Math.floor(((c.weight || 1) / totalWeight) * pageW);
      const def = { ...c, x, w };
      x += w;
      return def;
    });
  })();

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
      const raw = row[col.key] ?? '';
      const val = col.formatter ? col.formatter(raw, row) : raw;
      doc.text(String(val), col.x, y, { width: col.w - 4, lineBreak: false });
    });

    y += 14;
  }

  doc.end();
};
