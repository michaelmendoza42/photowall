// Lens distortion profiles, matched on the EXIF LensModel string.
// Coefficients are Lensfun's (https://github.com/lensfun/lensfun, data/db,
// CC BY-SA 3.0), "ptlens" model. A real build would load the whole Lensfun
// database server-side; the prototype carries the one lens it needs.

const PROFILES = [
  {
    match: /^16mm F1\.4 DC DN \| Contemporary 017$/,
    name: 'Sigma 16mm f/1.4 DC DN Contemporary',
    // mil-sigma.xml, calibrated at crop factor 1.534 (same as Sony APS-C), focal 16.
    a: 0.013, b: -0.039, c: 0.003,
  },
];

export function lensProfile(lensModel) {
  return (lensModel && PROFILES.find((p) => p.match.test(lensModel.trim()))) || null;
}
