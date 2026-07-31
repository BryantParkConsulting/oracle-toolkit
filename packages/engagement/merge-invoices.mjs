// One-off: attach 2026 invoice detail (BPC-only) to each client's primary SOW
// snapshot, then the caller republishes. Status: B=Paid · A=Open · D=Deposit.
import { readFileSync, writeFileSync } from 'node:fs';

const ST = { B: 'Paid', A: 'Open', D: 'Deposit' };
// [tranid, date, total, statusCode] — 2026 invoices, $0 lines dropped.
const INV = {
  overture: [['INV18105','Jan 15, 2026',2856,'B'],['INV18321','Jan 31, 2026',3094,'B'],['INV18484','Feb 05, 2026',19253,'B'],['INV18622','Feb 15, 2026',4959.75,'B'],['INV18880','Feb 28, 2026',3863.25,'B'],['INV19158','Mar 15, 2026',7773.25,'B'],['INV19280','Mar 31, 2026',885.5,'B'],['INV19418','Mar 31, 2026',5869.25,'B'],['INV19226','Apr 01, 2026',10350,'B'],['INV19703','Apr 15, 2026',5941.5,'B'],['INV19978','Apr 30, 2026',1517.25,'B'],['INV20214','May 15, 2026',1453.5,'B'],['INV20482','May 31, 2026',1343,'B'],['INV20810','Jun 15, 2026',13451.25,'A'],['INV20953','Jun 30, 2026',2587.5,'A'],['INV21194','Jun 30, 2026',2656.5,'A'],['INV21117','Jun 30, 2026',7373.75,'A']],
  squarespace: [['INV18446','Jan 31, 2026',6431.25,'B'],['INV19254','Mar 31, 2026',16476.25,'B'],['INV20031','Apr 01, 2026',73500,'A'],['INV19805','Apr 30, 2026',6125,'B'],['INV20074','Apr 30, 2026',1758.7,'A'],['INV20978','Jun 30, 2026',1648.88,'A']],
  pharmalogic: [['INV18362','Jan 31, 2026',765,'B'],['INV19209','Mar 09, 2026',11883,'B'],['INV19413','Mar 31, 2026',6366.5,'B'],['INV19603','Apr 15, 2026',7960.25,'B'],['INV19858','Apr 30, 2026',4921.5,'B'],['INV20144','May 15, 2026',8827.25,'B'],['INV20487','May 31, 2026',11504.75,'B'],['INV20705','Jun 15, 2026',8699.75,'B'],['INV21097','Jun 30, 2026',697,'B']],
  enfinity: [['INV18104','Jan 15, 2026',3323.5,'B'],['INV18276','Jan 31, 2026',7786,'B'],['INV18572','Feb 15, 2026',3255.5,'B'],['INV18820','Feb 28, 2026',4343.5,'B'],['INV19086','Mar 15, 2026',9528.5,'B'],['INV19380','Mar 31, 2026',10909.75,'B'],['INV19656','Apr 15, 2026',5610,'B'],['INV19921','Apr 30, 2026',13502.25,'A'],['INV20165','May 15, 2026',10820.5,'A'],['INV20356','May 31, 2026',8245,'A'],['INV20842','Jun 15, 2026',1151.75,'A'],['INV21176','Jun 30, 2026',110.5,'A']],
  swoop: [['INV18127','Jan 15, 2026',1466.25,'B'],['INV18133','Jan 15, 2026',1185.75,'B'],['INV18340','Jan 31, 2026',3319.25,'B'],['INV18649','Feb 15, 2026',2460.75,'B'],['INV18889','Feb 28, 2026',3017.5,'B'],['INV19095','Mar 15, 2026',1657.5,'B'],['INV19472','Mar 31, 2026',1797.75,'B'],['INV19731','Apr 15, 2026',306,'B'],['INV20014','Apr 30, 2026',569.5,'B'],['INV20212','May 15, 2026',1585.25,'B'],['INV20507','May 31, 2026',510,'B'],['INV21151','Jun 30, 2026',365.5,'A']],
  chime: [['INV17656','Jan 05, 2026',98312,'B'],['INV20080','May 12, 2026',98313,'B'],['INV20629','May 31, 2026',2205.29,'B'],['INV20577','Jun 08, 2026',98313,'B'],['INV21199','Jun 30, 2026',131.75,'D']],
  coursera: [['INV19233','Mar 27, 2026',44850,'B'],['INV19445','Mar 31, 2026',3380,'B'],['INV19574','Apr 15, 2026',25525,'B'],['INV19894','Apr 30, 2026',31502.5,'B'],['INV20137','May 15, 2026',34112.5,'B'],['INV20353','May 31, 2026',27597.5,'A'],['INV20840','Jun 15, 2026',20455,'B'],['INV21173','Jun 30, 2026',16377.5,'A']],
  // Symetri: no 2026 invoices (SOW1 closed 2025, SOW2 MS just started).
};

for (const [client, rows] of Object.entries(INV)) {
  const path = `clients/${client}/snapshot.json`;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const sows = Array.isArray(j.sows) ? j.sows : [j];
  sows[0].invoices = rows.map(([tranid, date, amount, code]) => ({ tranid, date, amount, status: ST[code] }));
  writeFileSync(path, JSON.stringify(Array.isArray(j.sows) ? { sows } : sows[0], null, 2));
  const paid = rows.filter(r => r[3] === 'B').reduce((a, r) => a + r[2], 0);
  console.log(`${client}: ${rows.length} invoices attached · $${paid.toLocaleString()} paid`);
}
