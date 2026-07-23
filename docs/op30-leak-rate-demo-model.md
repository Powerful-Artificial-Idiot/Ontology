# OP30 Leak Rate Demo Model

## Governed Numeric Baseline

All values are synthetic demonstration data in canonical unit `sccm` (`cm3/min at standard conditions` is display-only).

| Boundary or observation | Value | Governance meaning |
| --- | ---: | --- |
| Product target | 0.18 sccm | Approved product specification |
| Product LSL | 0.00 sccm | Approved product specification |
| Product USL | 0.30 sccm | Product acceptance boundary |
| Control center line | 0.20 sccm | Internal process baseline |
| Warning limit | 0.24 sccm | Increased monitoring |
| Action limit | 0.27 sccm | Containment and verification |
| M220 range | 0.00-0.50 sccm | Measurement capability, not acceptance |
| Resolution | 0.01 sccm | Measurement capability |
| Latest mean | 0.22 sccm | Current valid 2026-W29 aggregate |
| Latest maximum | 0.28 sccm | Current valid 2026-W29 aggregate |
| Latest P95 | 0.27 sccm | Current valid 2026-W29 aggregate |
| Latest Cpk | 1.08 | Current valid 2026-W29 capability |
| Sample count | 2400 | Current valid 2026-W29 aggregate |

The product specification, internal control limits, and measurement-system range are separate concepts. A value of `0.33 sccm` is measurable by M220 but exceeds the product USL and is nonconforming.

## Control And Measurement

The governed method is automated air-decay testing at `500 +/- 5 kPa`, with 3.0-second stabilization, 5.0-second measurement, and 100% production inspection. M220 records GRR at 8.2% of tolerance, bias at 0.004 sccm, and valid calibration for this demo baseline.

Sampling includes 100% production inspection, one master-leak verification per shift, golden-sample verification after program or fixture changes, and five pieces per layered audit.

## Program Governance

`program.leak-test.v3-4` is approved, effective, and current. `program.leak-test.v3-5` is proposed, pending validation, and not effective. Required validation covers MSA confirmation, master-leak verification, a 30-piece correlation study, capability confirmation, and Quality approval.

## Reaction Sequence

Above `0.27 sccm`, the governed sequence is: hold the current lot, identify last known good, verify the master leak, inspect fixture seals, verify the program version, repeat the golden-sample test, perform re-screening when required, create a deviation, notify Quality Engineering, and release only after evidence approval. Above `0.30 sccm`, the product is additionally classified as nonconforming.
