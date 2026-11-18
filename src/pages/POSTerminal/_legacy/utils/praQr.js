import QRCode from 'qrcode';

export const PRA_VERIFICATION_BASE = 'https://reg.pra.punjab.gov.pk/IMSFiscalReport/SearchPOSInvoice_Report.aspx';

export const praVerificationUrl = (invoiceNumber) => (
  invoiceNumber
    ? `${PRA_VERIFICATION_BASE}?PRAInvNo=${encodeURIComponent(String(invoiceNumber))}`
    : ''
);

// PRA requires the vendor to generate a QR containing the complete verification
// URL—not only the fiscal invoice number.
export const praQrSvg = (invoiceNumber, size = 132) => {
  const text = praVerificationUrl(invoiceNumber);
  if (!text) return '';
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const data = qr.modules.data;
    const cell = size / count;
    let rects = '';
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (data[row * count + column]) {
          rects += `<rect x="${(column * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`;
  } catch {
    return '';
  }
};
