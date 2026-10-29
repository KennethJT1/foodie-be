// Local bank list (Paystack's in production) and required documents (same as the frontend mock)
export const BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '057', name: 'Zenith Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '999992', name: 'OPay' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '214', name: 'First City Monument Bank' },
];

/** Documents each vendor type and every rider must upload (FR-VEN-01). */
export const REQUIRED_DOCUMENTS = {
  restaurant: [
    { type: 'government_id', label: 'Government ID (NIN, passport or driver’s licence)' },
    { type: 'cac_certificate', label: 'CAC certificate' },
    { type: 'food_permit', label: 'Food-handling permit' },
  ],
  home_cook: [{ type: 'government_id', label: 'Government ID (NIN, passport or driver’s licence)' }],
  rider: [
    { type: 'government_id', label: 'Government ID' },
    { type: 'drivers_licence', label: 'Driver’s or rider’s licence' },
    { type: 'vehicle_papers', label: 'Vehicle papers' },
    { type: 'guarantor_form', label: 'Signed guarantor form' },
  ],
};
