/* ========== GLOBAL STATE ========== */
let bankData = [];
let charts = {};
const $ = (id) => document.getElementById(id);
const fmt = (n) => (isNaN(n) ? "-" : Number(n).toLocaleString());
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const toPct = (v) => `${(v * 100).toFixed(0)}%`;
const STORAGE_KEY = "wealthwise_v2_state";

/* ========== INIT ========== */
window.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab, btn));
  });

  // Inputs default
  $("age").value = 28;
  $("creditScore").value = 720;
  $("annualIncome").value = 75000;
  $("currentMoney").value = 12000;
  $("assetValue").value = 35000;
  $("totalDebt").value = 28000;
  $("studentLoans").value = 18000;
  $("debtInterestRate").value = 5.5;
  $("expReturn").value = 7;
  $("inflation").value = 3;
  $("saveRate").value = 15;
  updateSliderLabels();

  // Events
  $("btnCompute").addEventListener("click", computePlan);
  ["expReturn","inflation","saveRate"].forEach(id => $(id).addEventListener("input", updateSliderLabels));
  $("sensitivity").addEventListener("change", computePlan);

  // File upload
  setupDragAndDrop();

  $("btnAnalyze").addEventListener("click", analyzeSpending);

  // Allocation
  ["allocCash","allocStocks","allocBonds","allocRE"].forEach(id=>{
    $(id).addEventListener("input", ()=> {
      $(id+"Label").textContent = $(id).value + "%";
      drawAllocCharts();
    });
  });
  $("btnAllocRecalc").addEventListener("click", drawAllocCharts);

  // Goals
  $("btnAddGoal").addEventListener("click", addOrUpdateGoal);
  $("btnSaveGoals").addEventListener("click", saveGoals);
  $("btnLoadGoals").addEventListener("click", loadGoals);

  // Profile
  $("btnSaveProfile").addEventListener("click", saveProfile);
  $("btnLoadProfile").addEventListener("click", loadProfile);

  // Snapshot
  $("btnSaveSnapshot").addEventListener("click", saveSnapshot);
  $("btnLoadSnapshot").addEventListener("click", loadSnapshot);

  // Export
  $("btnExport").addEventListener("click", exportPDF);

  // Modal
  $("modalClose").addEventListener("click", closeModal);
  window.addEventListener("click", (e)=>{ if(e.target===$("modal")) closeModal(); });

  // Load local state
  loadLocal();

  // First draw
  computePlan();
  drawAllocCharts();
});

/* ========== UI HELPERS ========== */
function switchTab(tabName, btn) {
  document.querySelectorAll(".tab-content").forEach((el)=>el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach((el)=>el.classList.remove("active"));
  $(tabName).classList.add("active");
  if (btn) btn.classList.add("active");
}

function updateSliderLabels(){
  $("expReturnLabel").textContent = (+$("expReturn").value).toFixed(1)+"%";
  $("inflationLabel").textContent = (+$("inflation").value).toFixed(1)+"%";
  $("saveRateLabel").textContent = (+$("saveRate").value)+"%";
  drawGrowthIfExists();
}

/* ========== CORE FINANCE LOGIC ========== */
function getIncomeCategory(income){
  if(income < 50000) return "low";
  if(income < 100000) return "medium";
  return "high";
}
function getAgeGroup(age){
  if(age < 25) return "young";
  if(age < 35) return "early-career";
  if(age < 50) return "mid-career";
  if(age < 65) return "pre-retirement";
  return "retirement";
}
function calcMonthlyDebtPayment(totalDebt, rate){
  if(totalDebt<=0) return 0;
  const r = rate/100/12, n=120;
  return totalDebt * (r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
}
function benchData(age, income){
  // Simple illustrative benchmarks (replace with real SCF/BLS when available)
  const saveRateMedian = income<50e3?0.06:income<100e3?0.10:0.15;
  const dtiMedian = 0.25;
  const netWorthTarget = income * (age/10); // rough heuristic
  return { saveRateMedian, dtiMedian, netWorthTarget };
}
function recommendedSaveRate(incomeCat, ageGroup, dti){
  let base = incomeCat==="low"?0.10:incomeCat==="medium"?0.15:0.20;
  if(ageGroup==="young") base+=0.02;
  if(ageGroup==="pre-retirement") base+=0.05;
  if(dti>0.3) base-=0.05;
  if(dti>0.5) base-=0.05;
  return Math.max(0.05, base);
}

function computePlan(){
  const age = +$("age").value||0;
  const credit = +$("creditScore").value||0;
  const currentMoney = +$("currentMoney").value||0;
  const assets = +$("assetValue").value||0;
  const income = +$("annualIncome").value||0;
  const debt = +$("totalDebt").value||0;
  const loans = +$("studentLoans").value||0;
  const rate = +$("debtInterestRate").value||6.5;

  if(!income){ alert("Enter your annual income"); return; }

  const monthlyIncome = income/12;
  const netWorth = currentMoney + assets - debt;
  const mpay = calcMonthlyDebtPayment(debt, rate);
  const dti = (mpay*12)/income;
  const incCat = getIncomeCategory(income);
  const ageGrp = getAgeGroup(age);

  // Sliders / sensitivity
  const expRet = +$("expReturn").value/100;
  const infl = +$("inflation").value/100;
  const userSaveRate = +$("saveRate").value/100;
  const sensitivity = $("sensitivity").value;
  const adj = sensitivity==="conservative"?-0.01:sensitivity==="aggressive"?+0.01:0;
  const finalReturn = clamp(expRet+adj, 0.03, 0.12);

  const recSaveRate = recommendedSaveRate(incCat, ageGrp, dti);
  const annualContrib = income * Math.max(userSaveRate, 0.05);

  // Benchmarks
  const b = benchData(age, income);

  // Cards
  $("summaryGrid").innerHTML = [
    card("Net Worth", `$${fmt(netWorth)}`),
    card("Emergency Fund Goal", `$${fmt(monthlyIncome*6)}`),
    card("Debt/Income (DTI)", `${(dti*100).toFixed(1)}%`),
    card("Recommended Savings Rate", `${(recSaveRate*100).toFixed(0)}%`),
    card("Your Savings Rate", `${(userSaveRate*100).toFixed(0)}%`),
    card("Monthly Target Savings", `$${fmt(annualContrib/12)}`)
  ].join("");

  drawGrowthChart(netWorth, annualContrib, finalReturn, infl);
  drawDebtChart(debt, rate);
  drawBenchmarksChart(userSaveRate, dti, netWorth, b);

  // Recs + budget
  const recs = buildRecommendations({age,credit,currentMoney,assets,income,debt,loans,dti,recSaveRate});
  renderRecommendations(recs);
  renderBudgetTable(income, userSaveRate);

  // Health Score + badges/streak
  const score = healthScore({saveRate:userSaveRate,dti,netWorth,age,credit});
  updateHealth(score);
  bumpStreak();

  // Save local
  saveLocal();
}

function card(title, value){
  return `<div class="summary-card"><h4>${title}</h4><div class="value">${value}</div></div>`;
}

/* ========== Charts ========== */
function drawGrowthChart(start, annualContrib, r, infl){
  const years = [1,2,3,4,5,10,20,30];
  const nominal=[], real=[];
  years.forEach(y=>{
    const fv = start*Math.pow(1+r,y) + annualContrib*((Math.pow(1+r,y)-1)/r);
    nominal.push(Math.round(fv));
    const rr = ((1+r)/(1+infl))-1;
    const rv = start*Math.pow(1+rr,y) + annualContrib*((Math.pow(1+rr,y)-1)/rr);
    real.push(Math.round(rv));
  });

  const ctx = $("growthChart").getContext("2d");
  if(charts.growth) charts.growth.destroy();
  charts.growth = new Chart(ctx,{
    type:"line",
    data:{
      labels:years.map(y=>"Y"+y),
      datasets:[
        {label:"Nominal", data:nominal, borderColor:"#2ecc71", backgroundColor:"rgba(46,204,113,0.1)", tension:0.3},
        {label:"Real (infl.-adj.)", data:real, borderColor:"#3498db", backgroundColor:"rgba(52,152,219,0.1)", tension:0.3}
      ]
    },
    options:{plugins:{legend:{position:"bottom"}}, scales:{y:{ticks:{callback:v=>"$"+(v/1000).toFixed(0)+"k"}}}}
  });
}
function drawGrowthIfExists(){
  if(charts.growth){
    computePlan();
  }
}
function drawDebtChart(totalDebt, rate){
  const r = rate/100/12;
  const n=120;
  const minPay = totalDebt?(totalDebt * (r * Math.pow(1+r,n))/(Math.pow(1+r,n)-1)):0;

  const years=[0,1,2,3,4,5,6,7,8,9,10];
  function sim(extra){
    let bal=totalDebt, pts=[];
    for(let y of years){
      let b=bal;
      for(let m=0;m<12;m++){
        if(b<=0) break;
        b = b*(1+r) - (minPay+extra);
      }
      pts.push(Math.max(0, Math.round(b)));
      bal = pts[pts.length-1];
    }
    return pts;
  }
  const min=sim(0), ex200=sim(200), ex500=sim(500);

  const ctx=$("debtChart").getContext("2d");
  if(charts.debt) charts.debt.destroy();
  charts.debt=new Chart(ctx,{
    type:"line",
    data:{labels:years.map(y=>"Year "+y), datasets:[
      {label:"Minimum", data:min, borderColor:"#e74c3c", backgroundColor:"rgba(231,76,60,0.1)", tension:0.3},
      {label:"+$200/mo", data:ex200, borderColor:"#f39c12", backgroundColor:"rgba(243,156,18,0.1)", tension:0.3},
      {label:"+$500/mo", data:ex500, borderColor:"#27ae60", backgroundColor:"rgba(39,174,96,0.1)", tension:0.3}
    ]},
    options:{plugins:{legend:{position:"bottom"}}, scales:{y:{ticks:{callback:v=>"$"+(v/1000).toFixed(0)+"k"}}}}
  });
}
function drawBenchmarksChart(saveRate, dti, netWorth, b){
  const labels=["Savings Rate","DTI (lower=better)","Net Worth/Target"];
  const yours=[saveRate, 1-dti, Math.min(1, netWorth/(b.netWorthTarget||1))];
  const peers=[b.saveRateMedian, 1-b.dtiMedian, 1]; // target normalized

  const ctx=$("benchmarksChart").getContext("2d");
  if(charts.bench) charts.bench.destroy();
  charts.bench=new Chart(ctx,{
    type:"radar",
    data:{
      labels,
      datasets:[
        {label:"You", data:yours, borderColor:"#8e44ad", backgroundColor:"rgba(142,68,173,0.2)"},
        {label:"Benchmark", data:peers, borderColor:"#95a5a6", backgroundColor:"rgba(149,165,166,0.2)"}
      ]
    },
    options:{scales:{r:{beginAtZero:true, max:1}}}
  });
}

/* ========== Recommendations & Budget ========== */
function buildRecommendations(ctx){
  const {age,credit,currentMoney,assets,income,debt,loans,dti,recSaveRate} = ctx;
  const recs = [];
  if(dti>0.4) recs.push({
    priority:"high",
    title:"⚠️ High Debt-to-Income",
    body:`DTI ${(dti*100).toFixed(1)}% — target < 30%. Consider consolidation/refi or +$200–$500/mo extra debt payments.`
  });
  if(currentMoney < (income/12)*6) recs.push({
    priority:"high",
    title:"🚨 Build Emergency Fund",
    body:`You need ~$${fmt(((income/12)*6-currentMoney))} more to reach 6 months. Move surplus to HYSA.`
  });
  if(credit<670) recs.push({
    priority:"high",
    title:"📈 Boost Credit Score",
    body:"Focus on on-time payments & <30% utilization. 50–100pt gain can lower APRs materially."
  });
  if(loans>income*0.5) recs.push({
    priority:"medium",
    title:"🎓 Student Loan Optimization",
    body:"Check IDR/PSLF options or refinance if stable income & high score."
  });
  recs.push({
    priority:"medium",
    title:"💰 Savings Rate",
    body:`Aim ≥ ${Math.round(recSaveRate*100)}% (you set ${(+$("saveRate").value)}%).`
  });
  return recs;
}
function renderRecommendations(recs){
  $("recList").innerHTML = recs.map(r=>`
    <div class="recommendation-card ${r.priority}">
      <h3>${r.title}</h3>
      <p>${r.body}</p>
    </div>
  `).join("") || "<p>No critical items — nice work!</p>";
}
function renderBudgetTable(income, saveRate){
  const monthly = income/12;
  const savings = monthly*saveRate;
  const needs = monthly*0.50;
  const wants = monthly*0.30;
  $("budgetTable").innerHTML = `
    <tr><th>Category</th><th>Recommended %</th><th>Amount</th></tr>
    <tr><td>Needs</td><td>50%</td><td>$${fmt(needs)}</td></tr>
    <tr><td>Wants</td><td>30%</td><td>$${fmt(wants)}</td></tr>
    <tr><td>Savings/Invest</td><td>${Math.round(saveRate*100)}%</td><td>$${fmt(savings)}</td></tr>
  `;
}

/* ========== Health Score, Badges, Streaks ========== */
function healthScore({saveRate, dti, netWorth, age, credit}){
  const sr = clamp(saveRate,0,0.4)/0.4;      // 0..1
  const dr = 1 - clamp(dti,0,0.6)/0.6;       // lower is better
  const nw = Math.tanh(netWorth/(age*10000+1)); // normalize
  const cr = clamp((credit-300)/550,0,1);
  const score = Math.round((sr*0.35 + dr*0.25 + nw*0.20 + cr*0.20) * 100);
  return score;
}
function updateHealth(score){
  $("healthBadge").textContent = `Score: ${score}/100`;
  const badges=[];
  if(score>=80) badges.push("🏆 Excellent");
  if(score>=60) badges.push("✅ On Track");
  if(score<60) badges.push("🛠️ Improve");
  if((+$("saveRate").value)>=20) badges.push("💾 Saver 20%");
  $("badgeTray").innerHTML = badges.map(b=>`<span class="badge">${b}</span>`).join("");
}
function bumpStreak(){
  const today = new Date().toISOString().slice(0,10);
  const key="ww_streak";
  const last = localStorage.getItem(key+"_last");
  let streak = +(localStorage.getItem(key)||0);
  if(last!==today){ streak+=1; localStorage.setItem(key, String(streak)); localStorage.setItem(key+"_last", today); }
  $("streakLabel").textContent = `Streak: ${streak}🔥`;
}

/* ========== Allocation ========== */
function targetAllocation(age, income){
  const stock = Math.max(20, 100-age); // 100-age rule
  const incCat = getIncomeCategory(income);
  if(incCat==="low"){
    return { Cash:10, Stocks: Math.max(25, stock*0.6), Bonds: Math.min(25, 100-stock), RE:5, EF:35 };
  } else if(incCat==="medium"){
    return { Cash:5, Stocks: Math.max(30, stock*0.6), Bonds: Math.min(20, 100-stock), RE:15, EF:20 };
  }
  return { Cash:5, Stocks: Math.max(25, stock*0.5), Bonds: Math.min(15, 100-stock), RE:20, EF:15 };
}
function drawAllocCharts(){
  const age= +$("age").value||30;
  const income = +$("annualIncome").value||80000;
  const tgt = targetAllocation(age, income);
  const cur = {
    Cash: +$("allocCash").value,
    Stocks: +$("allocStocks").value,
    Bonds: +$("allocBonds").value,
    RE: +$("allocRE").value,
  };
  const curSum = cur.Cash+cur.Stocks+cur.Bonds+cur.RE;
  // normalize to 100
  Object.keys(cur).forEach(k => cur[k] = Math.round((cur[k]/curSum)*100));

  drawPie("targetAllocChart", "Target", [tgt.Cash,tgt.Stocks,tgt.Bonds,tgt.RE,tgt.EF], ["Cash","Stocks","Bonds","RE/REITs","Emergency"]);
  drawPie("currentAllocChart", "Current", [cur.Cash,cur.Stocks,cur.Bonds,cur.RE], ["Cash","Stocks","Bonds","RE/REITs"]);
  // Gap (bar)
  const gapLabels = ["Cash","Stocks","Bonds","RE/REITs"];
  const gaps = [cur.Cash-tgt.Cash, cur.Stocks-tgt.Stocks, cur.Bonds-tgt.Bonds, cur.RE-tgt.RE];
  if(charts.allocGap) charts.allocGap.destroy();
  charts.allocGap = new Chart($("allocGapChart").getContext("2d"),{
    type:"bar",
    data:{labels:gapLabels,datasets:[{label:"% Gap (Current - Target)", data:gaps, backgroundColor:"#9b59b6"}]},
    options:{scales:{y:{ticks:{callback:v=>v+"%"}}}}
  });
}
function drawPie(canvasId, label, data, labels){
  if(charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId]=new Chart($(canvasId).getContext("2d"),{
    type:"doughnut",
    data:{labels, datasets:[{label, data, backgroundColor:["#34495e","#2ecc71","#f39c12","#9b59b6","#e74c3c"]}]},
    options:{plugins:{legend:{position:"bottom"}}}
  });
}

/* ========== CSV / Spending ========== */
function setupDragAndDrop(){
  const drop = $("dropArea");
  const file = $("csvFile");
  drop.addEventListener("click", ()=>file.click());
  drop.addEventListener("dragover", (e)=>{e.preventDefault(); drop.classList.add("dragover");});
  drop.addEventListener("dragleave", ()=>drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e)=>{
    e.preventDefault(); drop.classList.remove("dragover");
    if(e.dataTransfer.files?.length) parseCSV(e.dataTransfer.files[0]);
  });
  file.addEventListener("change", (e)=>{ if(e.target.files?.length) parseCSV(e.target.files[0]); });
}
function parseCSV(file){
  Papa.parse(file,{header:true,skipEmptyLines:true,complete:(res)=>{
    bankData = res.data;
    $("btnAnalyze").disabled = false;
    $("btnAnalyze").textContent = `🔍 Analyze ${bankData.length} Transactions`;
  }, error:(err)=> alert("CSV parse error: "+err.message)});
}
function analyzeSpending(){
  if(!bankData.length) return alert("Upload CSV first.");
  const out = spendAnalysis(bankData);
  renderSpending(out);
  saveLocal();
}
function spendAnalysis(rows){
  // categorize & aggregate
  const catMap = {
    "Coffee/Beverages": (d)=> /starbucks|coffee|dunkin/i.test(d),
    "Dining Out": (d)=> /restaurant|pizza|burger|doorDash|ubereats|delivery/i.test(d),
    "Subscriptions": (d)=> /netflix|spotify|hulu|subscription|prime/i.test(d),
    "Shopping": (d)=> /amazon|target|walmart|shopping/i.test(d),
    "Entertainment": (d)=> /movie|entertainment|game|steam/i.test(d),
    "Gas/Transport": (d)=> /gas|fuel|uber|lyft|shell|chevron/i.test(d),
    "Groceries": (d)=> /grocery|supermarket|whole foods|trader joe/i.test(d),
    "Utilities": (d)=> /electric|utility|water|internet|pg&e|att|comcast/i.test(d),
    "Other": ()=> true
  };
  const cats = Object.keys(catMap).reduce((o,k)=> (o[k]=[],o),{});
  let total=0;
  const dailySpend = {}; // yyyy-mm-dd -> sum
  const merchantMap = {}; // category -> merchant -> sum

  rows.forEach(r=>{
    const desc = (r.Description||r.description||"").toString();
    const amt = Math.abs(parseFloat(r.Amount||r.amount||0));
    const dateStr = (r.Date||r.date||"").toString();
    if(!amt) return;
    total += amt;

    const cat = Object.keys(catMap).find(k=>catMap[k](desc)) || "Other";
    cats[cat].push({desc, amt, date: dateStr});

    const dkey = normalizeDate(dateStr);
    if(dkey) dailySpend[dkey]=(dailySpend[dkey]||0)+amt;

    const merch = detectMerchant(desc);
    if(merch){
      merchantMap[cat] = merchantMap[cat]||{};
      merchantMap[cat][merch] = (merchantMap[cat][merch]||0)+amt;
    }
  });

  const totals = {};
  for(const k in cats) totals[k] = cats[k].reduce((s,t)=>s+t.amt,0);

  // insights
  const insights=[];
  if(totals["Dining Out"]>200) insights.push({priority:"high", title:"🍕 Dining Out", body:`$${fmt(totals["Dining Out"])} this period. Cut 30% to save ~$${fmt(totals["Dining Out"]*0.3)} /mo.`});
  if(totals["Coffee/Beverages"]>100) insights.push({priority:"medium", title:"☕ Coffee", body:`$${fmt(totals["Coffee/Beverages"])} — home brew could save ~$${fmt(totals["Coffee/Beverages"]*0.6)} /mo.`});
  if(totals["Subscriptions"]>50) insights.push({priority:"low", title:"📺 Subscriptions", body:`$${fmt(totals["Subscriptions"])} — audit & cancel unused services.`});

  return { totals, total, dailySpend, cats, merchantMap, insights };
}
function detectMerchant(desc){
  const m = desc.toLowerCase();
  if(m.includes("starbucks")) return "Starbucks";
  if(m.includes("amazon")) return "Amazon";
  if(m.includes("uber")) return "Uber";
  if(m.includes("lyft")) return "Lyft";
  if(m.includes("walmart")) return "Walmart";
  if(m.includes("target")) return "Target";
  return null;
}
function normalizeDate(d){
  // try ISO first
  if(!d) return null;
  const dt = new Date(d);
  if(isNaN(dt)) return null;
  const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,"0"), day=String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function renderSpending(a){
  // summary cards
  $("spendSummaryGrid").innerHTML = [
    card("Total Spending", `$${fmt(a.total)}`),
    card("Top Category", topCategory(a.totals)),
    card("Categories", Object.keys(a.totals).length)
  ].join("");

  // pie chart (category)
  const labels = Object.keys(a.totals), vals = Object.values(a.totals);
  if(charts.category) charts.category.destroy();
  charts.category = new Chart($("categoryChart").getContext("2d"),{
    type:"pie",
    data:{labels, datasets:[{data:vals, backgroundColor:["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#34495e","#e67e22","#1abc9c","#95a5a6"]}]},
    options:{
      plugins:{legend:{position:"bottom"}},
      onClick: (evt, els) => {
        if(els.length){
          const idx=els[0].index;
          const cat=labels[idx];
          openModalForCategory(cat, a.merchantMap[cat], a.cats[cat]);
        }
      }
    }
  });

  // monthly trends (aggregate by yyyy-mm)
  const byMonth={};
  Object.keys(a.dailySpend).forEach(d=>{
    const ym = d.slice(0,7);
    byMonth[ym]=(byMonth[ym]||0)+a.dailySpend[d];
  });
  const mLabels = Object.keys(byMonth).sort();
  const mVals = mLabels.map(k=>byMonth[k]);
  if(charts.trends) charts.trends.destroy();
  charts.trends = new Chart($("trendsChart").getContext("2d"),{
    type:"line",
    data:{labels:mLabels, datasets:[{label:"Monthly Spending", data:mVals, borderColor:"#3498db", backgroundColor:"rgba(52,152,219,0.1)", fill:true, tension:0.3}]},
    options:{plugins:{legend:{position:"bottom"}}, scales:{y:{beginAtZero:true}}}
  });

  // daily heatmap (simple grid 7xN weeks)
  renderHeatmap(a.dailySpend);

  // insights
  $("spendingInsights").innerHTML = a.insights.map(i=>`
    <div class="spending-insight ${i.priority}">
      <h3>${i.title}</h3>
      <p>${i.body}</p>
    </div>
  `).join("") || "<p>No major issues detected. 🎉</p>";
}
function topCategory(totals){
  let max=-1, cat="-";
  for(const k in totals){ if(totals[k]>max){ max=totals[k]; cat=k; } }
  return `${cat} ($${fmt(max)})`;
}
function renderHeatmap(daily){
  const days = Object.keys(daily).sort();
  const root = $("heatmap");
  root.innerHTML="";
  if(!days.length){ root.innerHTML="<p>No daily data</p>"; return; }
  const values = Object.values(daily);
  const max = Math.max(...values);
  days.forEach(date=>{
    const v=daily[date];
    const level = v===0?0: Math.ceil((v/max)*4); // 0..4
    const div=document.createElement("div");
    div.className = `heat cell lv${level}`;
    div.title = `${date}: $${fmt(v)}`;
    root.appendChild(div);
  });
}

/* ========== Drilldown Modal ========== */
function openModalForCategory(cat, merchants, txns){
  $("modalTitle").textContent = `${cat} — Top Merchants`;
  const merchantList = merchants ? Object.entries(merchants).sort((a,b)=>b[1]-a[1]).slice(0,10) : [];
  const topMerch = merchantList.map(([m,sum])=>`<li>${m}: $${fmt(sum)}</li>`).join("") || "<li>—</li>";
  const txList = (txns||[]).sort((a,b)=>b.amt-a.amt).slice(0,10).map(t=>`<li>$${fmt(t.amt)} — ${t.desc}</li>`).join("") || "<li>—</li>";
  $("modalBody").innerHTML = `
    <div class="grid two">
      <div><h4>Top Merchants</h4><ul>${topMerch}</ul></div>
      <div><h4>Largest Transactions</h4><ul>${txList}</ul></div>
    </div>
  `;
  $("modal").style.display="block";
}
function closeModal(){ $("modal").style.display="none"; }

/* ========== Goals ========== */
function addOrUpdateGoal(){
  const name = $("goalName").value.trim();
  const target = +$("goalTarget").value||0;
  const saved = +$("goalSaved").value||0;
  const monthly= +$("goalMonthly").value||0;
  if(!name||!target) return alert("Enter goal name & target.");
  const goals = getGoals();
  const idx = goals.findIndex(g=>g.name===name);
  const g = {name, target, saved, monthly};
  if(idx>=0) goals[idx]=g; else goals.push(g);
  setGoals(goals);
  renderGoals();
}
function timeToGoal(target, saved, monthly, r=0.05){
  // months to reach with contributions + simple compounding approx
  if(saved>=target) return 0;
  if(monthly<=0) return Infinity;
  const monthlyR = r/12;
  // FV = saved*(1+mr)^n + monthly * [((1+mr)^n -1)/mr]
  // solve n via search
  let lo=0, hi=600, n=0;
  while(lo<=hi){
    const mid=Math.floor((lo+hi)/2);
    const fv = saved*Math.pow(1+monthlyR, mid) + monthly*((Math.pow(1+monthlyR, mid)-1)/monthlyR);
    if(fv>=target){ n=mid; hi=mid-1; } else { lo=mid+1; }
  }
  return n;
}
function renderGoals(){
  const goals = getGoals();
  $("goalList").innerHTML = goals.map(g=>{
    const months = timeToGoal(g.target, g.saved, g.monthly, 0.05);
    const eta = months===Infinity? "—" : `${Math.floor(months/12)}y ${months%12}m`;
    const pct = Math.min(100, Math.round((g.saved/g.target)*100));
    return `
      <div class="goal-card">
        <h3>${g.name}</h3>
        <div class="progress"><div style="width:${pct}%;"></div></div>
        <p>Progress: ${pct}% — Saved $${fmt(g.saved)} / $${fmt(g.target)}</p>
        <p>Monthly: $${fmt(g.monthly)} — ETA: ${eta}</p>
      </div>
    `;
  }).join("") || "<p>No goals yet.</p>";
}
function getGoals(){
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  return s.goals||[];
}
function setGoals(goals){
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  s.goals = goals;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ========== Persistence (Local + API) ========== */
function saveLocal(){
  const state = {
    user_id: $("userId").value||"demo",
    profile: {
      age:+$("age").value, creditScore:+$("creditScore").value, annualIncome:+$("annualIncome").value,
      currentMoney:+$("currentMoney").value, assetValue:+$("assetValue").value,
      totalDebt:+$("totalDebt").value, studentLoans:+$("studentLoans").value, debtInterestRate:+$("debtInterestRate").value
    },
    settings: { expReturn:+$("expReturn").value, inflation:+$("inflation").value, saveRate:+$("saveRate").value, sensitivity:$("sensitivity").value }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({...state, goals:getGoals()}));
}
function loadLocal(){
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  if(!Object.keys(s).length) return;
  $("userId").value = s.user_id||"demo";
  if(s.profile){
    $("age").value=s.profile.age||28;
    $("creditScore").value=s.profile.creditScore||720;
    $("annualIncome").value=s.profile.annualIncome||75000;
    $("currentMoney").value=s.profile.currentMoney||12000;
    $("assetValue").value=s.profile.assetValue||35000;
    $("totalDebt").value=s.profile.totalDebt||28000;
    $("studentLoans").value=s.profile.studentLoans||18000;
    $("debtInterestRate").value=s.profile.debtInterestRate||5.5;
  }
  if(s.settings){
    $("expReturn").value=s.settings.expReturn||7;
    $("inflation").value=s.settings.inflation||3;
    $("saveRate").value=s.settings.saveRate||15;
    $("sensitivity").value=s.settings.sensitivity||"base";
  }
  renderGoals();
  updateSliderLabels();
}

/* Profile to backend */
async function saveProfile(){
  saveLocal();
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  const res = await fetch("/api/save_profile",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({user_id:s.user_id, ...s.profile, settings:s.settings})});
  if(res.ok) alert("Profile saved (cloud stub).");
}
async function loadProfile(){
  const user_id = $("userId").value||"demo";
  const res = await fetch(`/api/load_profile?user_id=${encodeURIComponent(user_id)}`);
  const data = await res.json();
  if(Object.keys(data).length){
    $("age").value=data.age||$("age").value;
    $("creditScore").value=data.creditScore||$("creditScore").value;
    $("annualIncome").value=data.annualIncome||$("annualIncome").value;
    $("currentMoney").value=data.currentMoney||$("currentMoney").value;
    $("assetValue").value=data.assetValue||$("assetValue").value;
    $("totalDebt").value=data.totalDebt||$("totalDebt").value;
    $("studentLoans").value=data.studentLoans||$("studentLoans").value;
    $("debtInterestRate").value=data.debtInterestRate||$("debtInterestRate").value;
    if(data.settings){
      $("expReturn").value=data.settings.expReturn||$("expReturn").value;
      $("inflation").value=data.settings.inflation||$("inflation").value;
      $("saveRate").value=data.settings.saveRate||$("saveRate").value;
      $("sensitivity").value=data.settings.sensitivity||$("sensitivity").value;
    }
    saveLocal();
    updateSliderLabels();
    computePlan();
    alert("Profile loaded.");
  } else {
    alert("No cloud profile found; using local.");
  }
}

/* Goals to backend */
async function saveGoals(){
  const user_id = $("userId").value||"demo";
  const goals = getGoals();
  const res = await fetch("/api/save_goals",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({user_id, goals})});
  if(res.ok) alert("Goals saved (cloud stub).");
}
async function loadGoals(){
  const user_id = $("userId").value||"demo";
  const res = await fetch(`/api/load_goals?user_id=${encodeURIComponent(user_id)}`);
  const data = await res.json();
  if(data.goals){
    setGoals(data.goals);
    renderGoals();
    alert("Goals loaded.");
  }
}

/* Snapshot (health) */
async function saveSnapshot(){
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  const scoreText = $("healthBadge").textContent;
  const payload = { user_id: s.user_id||"demo", at: new Date().toISOString(), health: scoreText, badges: $("badgeTray").innerText };
  const res = await fetch("/api/save_snapshot",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
  if(res.ok) alert("Snapshot saved (cloud stub).");
}
async function loadSnapshot(){
  const user_id = $("userId").value||"demo";
  const res = await fetch(`/api/load_snapshot?user_id=${encodeURIComponent(user_id)}`);
  const data = await res.json();
  $("snapshotViewer").textContent = JSON.stringify(data, null, 2);
}

/* ========== Export PDF ========== */
async function exportPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"px", format:"a4"});
  const el = document.querySelector(".container");
  const canvas = await html2canvas(el, {scale:1});
  const img = canvas.toDataURL("image/png");
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // scale to width
  const imgW = pageW, imgH = canvas.height * (pageW/canvas.width);
  let y=0, remaining = imgH;
  let position = 0;
  while(remaining>0){
    doc.addImage(img, "PNG", 0, position ? 0 : 10, imgW, imgH);
    remaining -= pageH;
    if(remaining>0){ doc.addPage(); position += pageH; }
  }
  doc.save("WealthWise_Report.pdf");
}
