'use strict';
const now = new Date("2026-04-27T12:00:00Z");
const month = now.getUTCMonth() + 1;  // 4
const year  = now.getUTCFullYear();   // 2026
const lastClosedMonth = month === 1 ? 12 : month - 1;  // 3
const curTp  = `TP${month}`;          // TP4
const actTp  = `TP${lastClosedMonth}`;// TP3
const nextTp = `TP${month === 12 ? 1 : month + 1}`;
const curFy  = `FY${String(year).slice(-2)}`;  // FY26

const vars = [
  {name:"NSP_PER_ActCurrMo",   value:'"TP8"'},
  {name:"NSP_PER_ActCurrYr",   value:'"FY24"'},
  {name:"NSP_PER_FcstCurrMo",  value:'"TP9"'},
  {name:"NSP_PER_FcstCurrYr",  value:'"FY24"'},
  {name:"NSP_PER_FcstNextYr",  value:'"FY25"'},
  {name:"NSP_PER_PriorYr",     value:'"FY23"'},
  {name:"NSP_PER_PriorYr1",    value:'"FY22"'},
  {name:"NSP_PER_RptCurrMo",   value:'"TP8"'},
  {name:"NSP_PER_RptCurrYr",   value:'"FY24"'},
  {name:"NSP_PER_SyncStartYr", value:'"FY20"'},
  {name:"NSP_PER_SyncEndMonth",value:'"TP8"'},
  {name:"NSP_SYS_CurrentScenario",value:'"NSP_Forecast"'},
  {name:"NSP_FIN_AP",          value:'"2010"'},
  {name:"WF_Benefit",          value:'"No Employee"->"No Department"'},
];

for (const v of vars) {
  const n = v.name.toLowerCase();
  // describeVariable cadence detection
  let cadence = "unknown";
  if (/nsp_per_act.*mo$/.test(n))         cadence = "monthly";
  else if (/nsp_per_fcst.*mo$/.test(n))   cadence = "monthly";
  else if (/nsp_per_rpt.*mo$/.test(n))    cadence = "monthly";
  else if (/nsp_per_sync.*end.*mo/.test(n)) cadence = "monthly";
  else if (/nsp_per_act.*yr/.test(n))     cadence = "annually";
  else if (/nsp_per_fcst.*next.*yr/.test(n)) cadence = "annually";
  else if (/nsp_per_fcst.*yr/.test(n))    cadence = "annually";
  else if (/nsp_per_prior.*yr1/.test(n))  cadence = "annually";
  else if (/nsp_per_prior.*yr/.test(n))   cadence = "annually";
  else if (/nsp_per_rpt.*yr/.test(n))     cadence = "annually";
  else if (/nsp_per_sync.*end.*yr/.test(n)) cadence = "annually";
  else if (/nsp_per_sync.*start.*yr/.test(n)) cadence = "rare";
  else if (/nsp_per_sync.*start.*mo/.test(n)) cadence = "rare";
  else if (/nsp_sys_current.*scen/.test(n)) cadence = "rare";
  else if (/nsp_fin_/.test(n))            cadence = "static";
  else if (/^wf_/.test(n))               cadence = "static";

  // statusForVariable
  const raw = v.value.replace(/^"|"$/g, "").trim();
  let status = "";
  try {
    if (cadence === "static") {
      status = "Static";
    } else {
      // expectedTp
      const expectedTp = (/act.*mo$|rpt.*prior.*mo|sync.*end.*mo/.test(n)) ? actTp
                       : (/fcst.*mo$|rpt.*mo$|cur.*(per|month)/.test(n))   ? curTp
                       : curTp;
      // expectedFy
      const cy = parseInt(curFy.slice(2), 10);
      const expectedFy = /prior.*yr1$/.test(n)         ? `FY${String(cy-2).padStart(2,"0")}`
                       : /prior.*yr/.test(n)            ? `FY${String(cy-1).padStart(2,"0")}`
                       : /next.*yr|fcst.*next/.test(n)  ? `FY${String(cy+1).padStart(2,"0")}`
                       : curFy;
      // monthStatus
      const monthStatus = () => {
        if (/^TP\d+$/i.test(raw)) {
          const tpNum = parseInt(raw.slice(2), 10);
          const expNum = parseInt(expectedTp.slice(2), 10);
          const lag = expNum - tpNum;
          if (raw === expectedTp) return "OK";
          if (lag === 1) return "Roll";
          return `STALE-${Math.abs(lag)}mo`;
        }
        return null;
      };
      const annualStatus = () => {
        const m2 = raw.match(/^FY(\d{2,4})$/i);
        if (!m2) return null;
        if (raw === expectedFy) return "OK";
        const yy = parseInt(m2[1].length === 2 ? "20"+m2[1] : m2[1], 10);
        const expNum = parseInt(expectedFy.slice(2), 10);
        const expFull = 2000 + expNum;
        const lag = expFull - yy;
        if (lag === 1) return "Roll";
        if (lag >= 2)  return `STALE-${lag}yr`;
        if (lag < 0)   return `Future+${-lag}`;
        return null;
      };
      if      (cadence === "monthly")  status = monthStatus() || "Review";
      else if (cadence === "annually") status = annualStatus() || "Review";
      else if (cadence === "rare")     status = annualStatus() || monthStatus() || "Rarely";
      else status = "";
    }
  } catch(e) {
    status = `ERROR: ${e.message}`;
  }
  console.log(`${v.name.padEnd(30)} cadence=${cadence.padEnd(10)} val=${raw.padEnd(15)} → ${status}`);
}
