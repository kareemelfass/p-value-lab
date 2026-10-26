"use strict";

/* All displays share the same subject-level KM engine. Events at a tied time
   are counted before censored observations leave the risk set. */
const $ = s => document.querySelector(s);
const pct = x => (100 * x).toFixed(1) + "%";
const num = x => Number(x).toLocaleString("en-US");
const z95 = 1.959963984540054;
const PATIENTS = [
  {id:"A",t:2,status:"event"}, {id:"B",t:3,status:"event"},
  {id:"C",t:4,status:"censor"}, {id:"D",t:5,status:"event"},
  {id:"E",t:5,status:"event"}, {id:"F",t:7,status:"censor"},
  {id:"G",t:8,status:"event"}, {id:"H",t:10,status:"censor"}
];

function confidence(S,greenwood) {
  if (S >= 1) return [1,1];
  if (S <= 0) return [0,0]; // Illustrations avoid this boundary case.
  const a = Math.log(-Math.log(S));
  const b = z95 * Math.sqrt(greenwood) / Math.abs(Math.log(S));
  return [Math.exp(-Math.exp(a+b)), Math.exp(-Math.exp(a-b))];
}
function km(observations,total) {
  const times = [...new Set(observations.map(p=>p.t))].sort((a,b)=>a-b);
  let n=total, S=1, g=0, prevE=0, prevC=0;
  return times.map(t => {
    const at=observations.filter(p=>p.t===t);
    const d=at.filter(p=>p.status==="event").length;
    const c=at.filter(p=>p.status==="censor").length;
    const before=S;
    const factor=d ? (n-d)/n : 1;
    if (d && n>d) g += d/(n*(n-d));
    S *= factor;
    const row={t,n,d,c,after:n-d-c,before,factor,S,g,
      earlierEvents:prevE,earlierCensors:prevC,ci:confidence(S,g)};
    prevE += d; prevC += c; n-=d+c;
    return row;
  });
}
const MAIN = km(PATIENTS,PATIENTS.length);
let activeStep=0;

/* Every table uses visible arithmetic. Events/censorings are observations, not computations. */
const dp = x => (100*x).toFixed(1);
const g5 = x => Number(x.toFixed(5)).toString();
const formula = (expression,result) => '<span class="math-expression">'+expression+' = <strong>'+result+'</strong></span>';
function riskBeforeEq(r,total){return formula(total+' − '+r.earlierEvents+' − '+r.earlierCensors, String(r.n))}
function riskAfterEq(r){return formula(r.n+' − '+r.d+' − '+r.c,String(r.after))}
function stepEq(r){return formula('('+r.n+' − '+r.d+')/'+r.n,pct(r.factor))}
function survivalEq(r){return formula(pct(r.before)+' × '+pct(r.factor),pct(r.S))}
function previousG(r){return r.d && r.n>r.d ? r.g-r.d/(r.n*(r.n-r.d)) : r.g}
function varianceEq(r) {
  if(!r.d)return formula(g5(r.g)+' + 0 (no event)',g5(r.g));
  if(r.n===r.d)return 'Boundary: S = 0; Greenwood term undefined';
  return formula(g5(previousG(r))+' + '+r.d+'/('+r.n+' × '+(r.n-r.d)+')',g5(r.g));
}
function ciEq(r) {
  if(r.S===1)return 'S = 100%; no event yet';
  if(r.S===0)return 'S = 0%; boundary';
  const full='CI = exp{−exp[ln(−ln '+r.S.toFixed(4)+') ± 1.96 × √'+g5(r.g)+'/|ln '+r.S.toFixed(4)+'|]}';
  return '<span class="math-expression">CI(S='+pct(r.S)+', G='+g5(r.g)+') = <strong>'+pct(r.ci[0])+' to '+pct(r.ci[1])+'</strong></span>'+
         '<details class="ci-detail"><summary>Show substituted formula</summary><div>'+full+'</div></details>';
}
function fullProductEq(rows){
  const factorRows=rows.filter(r=>r.d);
  const factors=factorRows.map(r=>'('+r.n+' − '+r.d+')/'+r.n).join(' × ');
  return '100% × '+factors+' = <strong>'+pct(factorRows[factorRows.length-1].S)+'</strong>';
}
function equationCells(r,total){
  return '<td>'+riskBeforeEq(r,total)+'</td>'+
    '<td>'+r.d+'</td><td>'+r.c+'</td>'+
    '<td>'+riskAfterEq(r)+'</td>'+
    '<td>'+stepEq(r)+'</td>'+
    '<td>'+survivalEq(r)+'</td>'+
    '<td>'+varianceEq(r)+'</td>'+
    '<td>'+ciEq(r)+'</td>';
}
function cumulativeProducts(rows,step){
  const relevant=rows.slice(0,step+1);
  return '<div class="product-terms">'+
    '<span class="product-term start">100%</span>'+
    relevant.filter(r=>r.d).map(r=>{
      const now=r===rows[step];
      return '<span class="product-sign">×</span><span class="product-term '+(now?'highlight':'')+'">'+
          '<small>Month '+r.t+'</small><strong>('+r.n+' − '+r.d+')/'+r.n+'</strong>'+
          '<small> = '+pct(r.factor)+'</small></span>';
    }).join('')+
    '<span class="product-sign">=</span><span class="product-result">'+pct(rows[step].S)+'</span>'+
    '</div>';
}


/* SVG plots use explicit horizontal and vertical coordinates for KM steps. */
function plotSeries(rows,attr,end,x,y) {
  let pts=[[0,1]],last=1;
  rows.forEach(r=>{
    const value=attr==="lower"?r.ci[0]:attr==="upper"?r.ci[1]:r.S;
    pts.push([r.t,last],[r.t,value]);
    last=value;
  });
  pts.push([end,last]);
  return pts.map(p=>[x(p[0]),y(p[1])]);
}
function pathD(points) {
  return points.map((p,i)=>(i?"L":"M")+p[0].toFixed(2)+","+p[1].toFixed(2)).join(" ");
}
function plotSurvival(id,series,end,showConfidence) {
  const svg=$(id);
  const L=65,T=21,R=18,B=53,W=760,H=340;
  const x=t=>L+(W-L-R)*t/end;
  const y=v=>T+(H-T-B)*(1-v);
  let html='<rect x="'+L+'" y="'+T+'" width="'+(W-L-R)+'" height="'+(H-T-B)+'" fill="#fff"/>';
  [0,.25,.5,.75,1].forEach(v=>{
    html+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#e5eaf1"/>';
    html+='<text x="'+(L-12)+'" y="'+(y(v)+4)+'" text-anchor="end" fill="#57677d" font-size="13">'+Math.round(v*100)+'%</text>';
  });
  for(let t=0;t<=end;t+=2){
    html+='<text x="'+x(t)+'" y="'+(H-28)+'" text-anchor="middle" fill="#57677d" font-size="13">'+t+'</text>';
  }
  html+='<text x="'+(W/2)+'" y="'+(H-6)+'" text-anchor="middle" fill="#57677d" font-size="14">Time (months)</text>';
  html+='<line x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#8490a5"/>';
  html+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+(H-B)+'" y2="'+(H-B)+'" stroke="#8490a5"/>';
  if(showConfidence){
    series.forEach(s=>{
      if(!s.band)return;
      const up=plotSeries(s.rows,"upper",s.end===undefined?end:s.end,x,y);
      const low=plotSeries(s.rows,"lower",s.end===undefined?end:s.end,x,y);
      const poly=up.concat(low.reverse()).map(p=>p.join(",")).join(" ");
      html+='<polygon points="'+poly+'" fill="#cadaf0" opacity=".65"/>';
    });
  }
  series.forEach(s=>{
    const seriesEnd=s.end===undefined?end:s.end;
    const coordinates=plotSeries(s.rows,"S",seriesEnd,x,y);
    html+='<path d="'+pathD(coordinates)+'" stroke="'+s.color+'" stroke-width="'+(s.dash?2.5:4)+'" fill="none" '+(s.dash?'stroke-dasharray="8 7"':'')+'/>';
    if(s.censors){
      s.rows.forEach(r=>{
        if(!r.c)return;
        const xx=x(r.t),yy=y(r.S);
        html+='<path d="M'+xx+','+(yy-8)+' v16" stroke="'+s.color+'" stroke-width="2.5"/>';
        if(r.c>1)html+='<text x="'+(xx+7)+'" y="'+(yy-11)+'" fill="'+s.color+'" font-size="12">c='+r.c+'</text>';
      });
    }
    if(s.events){
      s.rows.filter(r=>r.d).forEach(r=>{
        html+='<circle cx="'+x(r.t)+'" cy="'+y(r.S)+'" r="4" fill="'+s.color+'"><title>Month '+r.t+': '+r.d+' event(s); at risk '+r.n+'; survival '+pct(r.S)+'</title></circle>';
      });
    }
  });
  svg.innerHTML=html;
}

/* Module 1: transparent individual-level calculation and growing curve. */
function drawPatients() {
  const row=MAIN[activeStep];
  $("#patients").innerHTML=PATIENTS.map(p=>{
    const now=p.t===row.t,earlier=p.t<row.t;
    const sym=now||earlier ? (p.status==="event"?"×":"│") : "●";
    const label=now||earlier ? (p.status==="event"?"Event at "+p.t:"Censored at "+p.t) : "At risk";
    return '<div class="p '+(now?"active ":"")+(earlier?"done":"")+'"><strong>'+p.id+'</strong><div class="sym">'+sym+'</div><div class="mini">'+label+'</div></div>';
  }).join("");
}
function drawMainTable(){
  const row0='<tr><td>0</td><td>8 (enrolled)</td><td>0</td><td>0</td><td>8 − 0 − 0 = <strong>8</strong></td><td>(8 − 0)/8 = <strong>100%</strong></td><td>100% × 100% = <strong>100%</strong></td><td>G = 0</td><td>No event yet</td></tr>';
  $("#rows").innerHTML=row0+MAIN.map((r,i)=>{
    const seen=i<=activeStep;
    const first='<td><button class="rowbtn" data-step="'+i+'" '+(!seen?'disabled':'')+' aria-label="Show month '+r.t+' calculation">'+r.t+'</button></td>';
    return '<tr class="'+(i===activeStep?'current':i>activeStep?'future':'')+'">'+first+
      (seen?equationCells(r,8):'<td colspan="8">Continue the patient-by-patient lesson to reveal this calculation.</td>')+
      '</tr>';
  }).join('');
}

function drawMainCalc(){
  const r=MAIN[activeStep];
  $("#instruction").innerHTML='<span class="badge">Month '+r.t+'</span> &nbsp;'+
    (r.d?(r.d===1?"One event occurs.":"Two events occur at exactly the same month."):"A patient is censored, with no event.");
  const riskLine="8 − "+r.earlierEvents+" previous events − "+r.earlierCensors+" previous censorings = "+r.n;
  const survivalLine=r.d ? "("+r.n+" − "+r.d+")/"+r.n+" = "+(r.n-r.d)+"/"+r.n+" = "+pct(r.factor)
    : "No event: conditional survival is 100%.";
  const afterLine=r.n+" − "+r.d+" events − "+r.c+" censored = "+r.after;
  $("#calc").innerHTML='<div class="calcbox"><strong>Risk set just before month '+r.t+'</strong><div>'+riskLine+'</div>'+
    '<p><strong>At this time:</strong> '+r.d+' event(s), '+r.c+' censored</p>'+
    '<div>Conditional survival: '+survivalLine+'</div>'+
    '<p><strong>Overall KM:</strong> '+pct(r.before)+' × '+pct(r.factor)+' = <span class="big">'+pct(r.S)+'</span></p>'+
    '<div class="mini">Remaining for later times: '+afterLine+'</div></div>';
  const stages=[
    ["1. Who could have the event?",riskLine],
    ["2. What is observed?",r.d+" event(s), "+r.c+" censored"],
    ["3. What fraction survives this time?",stepEq(r)],
    ["4. Multiply by the previous KM",survivalEq(r)]
  ];
  $("#stepMath").innerHTML='<h3>The calculation, one piece at a time</h3>'+
    '<div class="formula-chain">'+stages.map(s=>'<div class="formula-step"><span class="mini">'+s[0]+'</span><div class="math-step">'+s[1]+'</div></div>').join("")+'</div>'+
    '<p class="mini"><strong>All observations at this time:</strong> events cause a drop; censoring never causes an immediate drop. Same-time censoring stays in this event-time denominator.</p>'+
    '<p><strong>Change in Greenwood G:</strong> '+varianceEq(r)+'. <strong>Pointwise 95% CI:</strong> '+pct(r.ci[0])+' to '+pct(r.ci[1])+'.</p>';
  $("#productBuild").innerHTML=cumulativeProducts(MAIN,activeStep);
  $("#productExplanation").innerHTML=r.d
    ? 'Highlight: the new month-'+r.t+' factor is <strong>'+pct(r.factor)+'</strong>. Multiply it by the survival already accumulated (<strong>'+pct(r.before)+'</strong>), not by 100% again.'
    : 'At month '+r.t+' there are <strong>zero events</strong>, so the multiplication has no new factor and the KM estimate stays <strong>'+pct(r.S)+'</strong>. The next event uses a smaller denominator.';
  $("#mainInsight").textContent=r.d ? "Current KM drop = "+pct(r.before)+" × "+r.d+"/"+r.n+" = "+pct(r.before-r.S)+" percentage points. It uses "+r.n+" people at risk."
    : "There is no event: neither the KM estimate nor Greenwood G changes now. The reduced risk set will matter at the next event.";
}

function drawMainPlot() {
  const completed=MAIN.slice(0,activeStep+1);
  plotSurvival("#chart",[{rows:completed,color:"#315c9a",band:true,censors:true,events:true,end:MAIN[activeStep].t}],10,$("#showCI").checked);
  const checkpoints=[0,2,4,6,8,10];
  const current=MAIN[activeStep].t;
  $("#riskstrip").innerHTML=checkpoints.map(t=>{
    const risk=PATIENTS.filter(p=>p.t>=t).length;
    return '<div>Month '+t+'<strong>'+(t<=current?risk:"?")+'</strong>at risk</div>';
  }).join("");
}
function renderMain(){
  drawPatients();drawMainCalc();drawMainTable();drawMainPlot();
  $("#prev").disabled=activeStep===0;
  $("#next").disabled=activeStep===MAIN.length-1;
  $("#next").textContent=activeStep===MAIN.length-1?"Finished ✓":"Next step →";
  $("#progress").textContent="Step "+(activeStep+1)+" of "+MAIN.length;
}
$("#next").addEventListener("click",()=>{if(activeStep<MAIN.length-1){activeStep++;renderMain()}});
$("#prev").addEventListener("click",()=>{if(activeStep>0){activeStep--;renderMain()}});
$("#restart").addEventListener("click",()=>{activeStep=0;renderMain()});
$("#showCI").addEventListener("change",drawMainPlot);
$("#rows").addEventListener("click",e=>{
  const b=e.target.closest("button[data-step]");
  if(b&&!b.disabled){activeStep=Number(b.dataset.step);renderMain()}
});

/* Module 2: an additional event following the SAME first four events.
   Censoring changes only the next risk-set size. */
function riskRecords(nextN){
  const obs=[1,2,3,4,8].map(t=>({t,status:"event"}));
  for(let i=0;i<16-nextN;i++)obs.push({t:6,status:"censor"});
  for(let i=0;i<nextN-1;i++)obs.push({t:10,status:"censor"});
  return obs;
}
function drawRisk(){
  const n=Number($("#riskN").value);
  const ref=km(riskRecords(16),20);
  const selected=km(riskRecords(n),20);
  const prev=selected.find(r=>r.t===4), now=selected.find(r=>r.t===8);
  const reference=ref.find(r=>r.t===8);
  const dG=1/(n*(n-1)),dGref=1/(16*15);
  const width=r=>r.ci[1]-r.ci[0];
  $("#riskValue").textContent=n;
  $("#riskFlow").innerHTML='<div class="story-strip">'+
    '<div><small>At enrolment</small><strong>20</strong><span>people</span></div>'+
    '<b>→</b><div><small>4 earlier events</small><strong>16</strong><span>still at risk</span></div>'+
    '<b>→</b><div><small>Month 6: censored</small><strong>'+ (16-n)+'</strong><span>leave follow-up</span></div>'+
    '<b>→</b><div class="story-focus"><small>At month 8</small><strong>'+n+'</strong><span>at risk, 1 event</span></div>'+
    '</div>';
  $("#riskNumbers").innerHTML=
    '<div class="metric"><div class="mini">Survival before the 5th event</div><div class="value">'+pct(prev.S)+'</div><div class="mini">Same in both scenarios</div></div>'+
    '<div class="metric"><div class="mini">New absolute KM drop</div><div class="value">'+pct(prev.S-now.S)+'</div><div class="mini">'+pct(prev.S)+' × 1/'+n+'</div></div>'+
    '<div class="metric"><div class="mini">Added Greenwood variance term</div><div class="value">'+g5(dG)+'</div><div class="mini">1/('+n+' × '+(n-1)+')</div></div>'+
    '<div class="metric"><div class="mini">95% CI width after event</div><div class="value">'+pct(width(now))+'</div><div class="mini">'+pct(now.ci[1])+' − '+pct(now.ci[0])+'</div></div>';
  $("#riskEquation").innerHTML=
    '<h3>Same next event, different denominator</h3>'+
    '<div class="equation-comparison">'+
    '<div><strong>Reference: 16 still at risk</strong><div>'+pct(reference.before)+' × (16 − 1)/16 = <strong>'+pct(reference.S)+'</strong></div>'+
    '<div>KM drop: '+pct(reference.before)+' × 1/16 = <strong>'+pct(reference.before-reference.S)+'</strong></div>'+
    '<div>New G term: 1/(16 × 15) = <strong>'+g5(dGref)+'</strong></div>'+
    '<div>95% CI: '+pct(reference.ci[0])+' to '+pct(reference.ci[1])+' (width '+pct(width(reference))+')</div></div>'+
    '<div class="emphasis"><strong>After '+(16-n)+' censorings: '+n+' still at risk</strong>'+
    '<div>'+pct(now.before)+' × ('+n+' − 1)/'+n+' = <strong>'+pct(now.S)+'</strong></div>'+
    '<div>KM drop: '+pct(now.before)+' × 1/'+n+' = <strong>'+pct(now.before-now.S)+'</strong></div>'+
    '<div>New G term: 1/('+n+' × '+(n-1)+') = <strong>'+g5(dG)+'</strong></div>'+
    '<div>95% CI: '+pct(now.ci[0])+' to '+pct(now.ci[1])+' (width '+pct(width(now))+')</div></div>'+
    '</div>';
  $("#riskNarrative").innerHTML='The <strong>fifth event</strong> occurs after the same four earlier events in both scenarios. With '+n+' at risk, the event creates a <strong>'+pct(prev.S-now.S)+'</strong> percentage-point KM drop, versus <strong>'+pct(reference.before-reference.S)+'</strong> with 16 at risk. The added Greenwood term is <strong>'+g5(dG)+'</strong> versus <strong>'+g5(dGref)+'</strong>, and the resulting 95% CI is '+pct(width(now))+' points wide versus '+pct(width(reference))+' points. <strong>Smaller risk sets can make a later event more influential and the survival estimate less precise.</strong>';
  plotSurvival("#riskPlot",[
    {rows:ref,color:"#157a78",dash:true,events:false},
    {rows:selected,color:"#315c9a",band:true,censors:true,events:true}
  ],10,true);
}
$("#riskN").addEventListener("input",drawRisk);

/* Module 3: same count of events, changed order relative to early censoring. */
const timingSchedules={early:[1,2,2,3,3,4],late:[7,8,9,10,10,11]};
function timingRecords(which,earlyCensoring){
  const obs=timingSchedules[which].map(t=>({t,status:"event"}));
  if(earlyCensoring){
    for(let i=0;i<4;i++)obs.push({t:5,status:"censor"});
    for(let i=0;i<4;i++)obs.push({t:6,status:"censor"});
    for(let i=0;i<6;i++)obs.push({t:12,status:"censor"});
  }else{
    for(let i=0;i<14;i++)obs.push({t:12,status:"censor"});
  }
  return obs;
}
function findLastEvent(rows){return rows.filter(r=>r.d).slice(-1)[0]}
function drawTiming(){
  const which=$("#timing").value,earlyCensoring=$("#timingCensor").checked;
  const early=km(timingRecords("early",earlyCensoring),20);
  const late=km(timingRecords("late",earlyCensoring),20);
  const runs={early,late};
  const rows=runs[which],first=rows.find(r=>r.d),last=findLastEvent(rows);
  const ef=early.find(r=>r.d),lf=late.find(r=>r.d);
  const eEnd=findLastEvent(early),lEnd=findLastEvent(late);
  const width=r=>pct(r.ci[1]-r.ci[0]);
  $("#timingTimeline").innerHTML='<div class="equation-comparison">'+
    '<div class="'+(which==="early"?'emphasis':'')+'"><h3>Early concentration</h3><p>20 participants → <strong>6 events in months 1–4</strong> → '+(earlyCensoring?'8 censored at months 5–6':'14 censored at month 12')+'.</p>'+
    '<p>First event: ('+ef.n+' − 1)/'+ef.n+' = <strong>'+pct(ef.factor)+'</strong></p><p>Whole KM multiplication: <span class="math-expression">'+fullProductEq(early)+'</span></p></div>'+
    '<div class="'+(which==="late"?'emphasis':'')+'"><h3>Late concentration</h3><p>20 participants → '+(earlyCensoring?'8 censored at months 5–6 → ':'')+'<strong>6 events in months 7–11</strong> → '+(earlyCensoring?'6':'14')+' censored at month 12.</p>'+
    '<p>First event: ('+lf.n+' − 1)/'+lf.n+' = <strong>'+pct(lf.factor)+'</strong></p><p>Whole KM multiplication: <span class="math-expression">'+fullProductEq(late)+'</span></p></div></div>';
  plotSurvival("#timingPlot",[
    {rows:early,color:"#157a78",events:which==="early",censors:which==="early",band:which==="early"},
    {rows:late,color:"#7456a6",events:which==="late",censors:which==="late",band:which==="late"}
  ],12,true);
  $("#timingComparison").innerHTML='<table><thead><tr><th>Scenario</th><th>Risk set at first event</th><th>First step (1 event)</th><th>KM after all 6 events</th><th>Pointwise 95% CI at final event</th></tr></thead><tbody>'+
    '<tr><td><strong>Early events</strong></td><td>'+riskBeforeEq(ef,20)+'</td><td>'+stepEq(ef)+'</td><td>'+survivalEq(eEnd)+'</td><td>'+ciEq(eEnd)+'</td></tr>'+
    '<tr><td><strong>Late events</strong></td><td>'+riskBeforeEq(lf,20)+'</td><td>'+stepEq(lf)+'</td><td>'+survivalEq(lEnd)+'</td><td>'+ciEq(lEnd)+'</td></tr></tbody></table>';
  $("#timingNumbers").innerHTML=
    '<div class="metric"><div class="mini">Selected scenario: first event</div><div class="value">'+first.n+' at risk</div><div class="mini">Month '+first.t+'</div></div>'+
    '<div class="metric"><div class="mini">After sixth event</div><div class="value">'+pct(last.S)+'</div><div class="mini">'+pct(last.before)+' × '+pct(last.factor)+'</div></div>'+
    '<div class="metric"><div class="mini">Width of 95% CI</div><div class="value">'+width(last)+'</div><div class="mini">'+pct(last.ci[1])+' − '+pct(last.ci[0])+'</div></div>';
  $("#timingCompare").innerHTML=earlyCensoring
    ? '<strong>What explains the difference?</strong> In the early scenario, six events happen <strong>before</strong> the eight censorings. In the late scenario, the same eight patients are censored <strong>before</strong> the six events. The next event therefore has a smaller denominator (first event: '+ef.n+' versus '+lf.n+'). The final estimates are '+pct(eEnd.S)+' versus '+pct(lEnd.S)+'. Event timing matters here because it changes the ordering relative to censoring.'
    : '<strong>What changes when you remove the eight early censorings?</strong> Both groups retain 20 participants at the first event. The six events occur at different times, so the curves fall at different months. After all six events, both reach '+pct(eEnd.S)+' with identical confidence intervals. <strong>Later events are not automatically less precise.</strong>';
  $("#timingRows").innerHTML=rows.map(r=>'<tr><td>'+r.t+'</td>'+equationCells(r,20)+'</tr>').join('');
}
$("#timing").addEventListener("change",drawTiming);
$("#timingCensor").addEventListener("change",drawTiming);

/* Module 4: distinguish censoring before the event from censoring tied with it. */
function censorRecords(before,tied){
  const obs=[{t:6,status:"event"},{t:9,status:"event"}];
  for(let i=0;i<before;i++)obs.push({t:3,status:"censor"});
  for(let i=0;i<tied;i++)obs.push({t:6,status:"censor"});
  for(let i=0;i<10-before-tied;i++)obs.push({t:12,status:"censor"});
  return obs;
}
function drawCensor(){
  const before=Number($("#beforeCensor").value),tied=Number($("#sameCensor").value);
  $("#beforeValue").textContent=before;
  $("#sameValue").textContent=tied;
  const rows=km(censorRecords(before,tied),12);
  const baseline=km(censorRecords(0,0),12);
  const at6=rows.find(r=>r.t===6),at9=rows.find(r=>r.t===9);
  const hypothetical=km(censorRecords(before+tied,0),12).find(r=>r.t===6);
  const denominatorWrong=at6.n-tied;
  plotSurvival("#censorPlot",[
    {rows:baseline,color:"#157a78",dash:true},
    {rows,color:"#315c9a",band:true,censors:true,events:true}
  ],12,true);
  $("#censorTimeline").innerHTML='<div class="story-strip">'+
    '<div><small>Start</small><strong>12</strong><span>at risk</span></div>'+
    '<b>→</b><div><small>Month 3: censored</small><strong>'+before+'</strong><span>leave before event</span></div>'+
    '<b>→</b><div class="story-focus"><small>Month 6</small><strong>1 + '+tied+'</strong><span>1 event + '+tied+' censored</span></div>'+
    '<b>→</b><div><small>Month 9</small><strong>1</strong><span>next event</span></div></div>';
  $("#censorNumbers").innerHTML=
    '<div class="metric"><div class="mini">Immediately before month 6</div><div class="value">'+at6.n+' at risk</div><div class="mini">12 − '+before+' = '+at6.n+'</div></div>'+
    '<div class="metric"><div class="mini">Survival at month 6</div><div class="value">'+pct(at6.S)+'</div><div class="mini">'+stepEq(at6)+'</div></div>'+
    '<div class="metric"><div class="mini">Survival at month 9</div><div class="value">'+pct(at9.S)+'</div><div class="mini">'+survivalEq(at9)+'</div></div>';
  $("#censorMath").innerHTML='<h3>Follow the risk set through both event times</h3><div class="formula-chain">'+
    '<div class="formula-step"><span class="mini">A. Censoring at month 3 occurs <strong>before</strong> event</span><div class="math-step">12 − '+before+' = <strong>'+at6.n+' at risk at month 6</strong></div><small>KM survival stays 100% at month 3.</small></div>'+
    '<div class="formula-step emphasis"><span class="mini">B. Month 6: process <strong>event first</strong></span><div class="math-step">'+stepEq(at6)+'</div><small>'+tied+' simultaneous censoring(s) are included in the denominator.</small></div>'+
    '<div class="formula-step"><span class="mini">C. Only <strong>after</strong> month 6, remove all exits</span><div class="math-step">'+riskAfterEq(at6)+'</div><small>People remaining for later times.</small></div>'+
    '<div class="formula-step"><span class="mini">D. Month 9: calculate the next event</span><div class="math-step">'+survivalEq(at9)+'</div><small>'+stepEq(at9)+' based on '+at9.n+' at risk.</small></div>'+
    '</div>';
  $("#censorTie").innerHTML=tied
    ? '<strong>The critical tie rule:</strong> '+at6.n+' people are at risk at the beginning of month 6. One experiences the event; '+tied+' others are censored at the same month. The correct survival is <strong>'+stepEq(at6)+'</strong>. Censoring first would incorrectly use '+denominatorWrong+' in the denominator and give ('+denominatorWrong+' − 1)/'+denominatorWrong+' = '+pct((denominatorWrong-1)/denominatorWrong)+'. After the event and tied censorings, '+riskAfterEq(at6)+' people remain for month 9.'
    : '<strong>No simultaneous censoring at present:</strong> the month-6 event uses '+at6.n+' people in its denominator. Increase the second slider to create an event and censoring at exactly the same month.';
  $("#censorComparison").innerHTML='<h3>Does censoring at the same time as the event change its denominator?</h3>'+
    '<div class="equation-comparison">'+
      '<div class="emphasis"><strong>Actual: '+tied+' censored at month 6</strong><p>At risk just before month 6: <strong>'+at6.n+'</strong></p><p>First KM step: '+stepEq(at6)+'</p><p>The same-time censorings affect the next event.</p></div>'+
      '<div><strong>Counterfactual: move those '+tied+' censorings to month 3</strong><p>At risk just before month 6: <strong>'+hypothetical.n+'</strong></p><p>First KM step: '+stepEq(hypothetical)+'</p><p>These are now censored before the event and no longer contribute to its risk set.</p></div>'+
    '</div>'+
    '<p class="mini">The counterfactual holds the total number of events and censorings fixed and changes only the censoring time of the '+tied+' people.</p>';
  $("#censorRows").innerHTML=rows.map(r=>'<tr><td>'+r.t+'</td>'+equationCells(r,12)+'</tr>').join("");
}
$("#beforeCensor").addEventListener("input",drawCensor);
$("#sameCensor").addEventListener("input",drawCensor);

renderMain();
drawRisk();
drawTiming();
drawCensor();
