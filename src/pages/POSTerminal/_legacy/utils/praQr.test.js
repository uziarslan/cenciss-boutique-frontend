import { describe, expect, it } from 'vitest';
import { praQrSvg, praVerificationUrl } from './praQr';

describe('PRA receipt verification QR', () => {
  it('encodes the complete PRA verification URL', () => {
    expect(praVerificationUrl('126983DJCN820607')).toBe(
      'https://reg.pra.punjab.gov.pk/IMSFiscalReport/SearchPOSInvoice_Report.aspx?PRAInvNo=126983DJCN820607',
    );
  });

  it('renders a self-contained SVG for printing', () => {
    const svg = praQrSvg('126983DJCN820607', 132);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="132"');
    expect(svg).toContain('<rect');
  });
});
