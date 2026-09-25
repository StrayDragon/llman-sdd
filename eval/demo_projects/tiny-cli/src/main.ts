const bill = Number(process.argv[2]);
const pct = Number(process.argv[3]);
if (!Number.isFinite(bill) || !Number.isFinite(pct)) {
  process.exit(1);
}
process.stderr.write('not implemented\n');
process.exit(1);
