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
function drawMainTable() {
  const row0='<tr><td>0</td><td>8</td><td>0</td><td>0</td><td>8</td><td>100.0%</td><td>100.0%</td><td><strong>100.0%</strong></td><td>Not needed yet</td></tr>';
  $("#rows").innerHTML=row0+MAIN.map((r,i)=>{
    const seen=i<=activeStep;
    const val=x=>seen?x:"?";
    const first='<td><button class="rowbtn" data-step="'+i+'" '+(!seen?'disabled':'')+' aria-label="Show month '+r.t+' calculation">'+r.t+'</button></td>';
    return '<tr class="'+(i===activeStep?"current":i>activeStep?"future":"")+'">'+first+
      '<td>'+val(r.n)+'</td><td>'+val(r.d)+'</td><td>'+val(r.c)+'</td><td>'+val(r.after)+'</td>'+
      '<td>'+val(pct(r.factor))+'</td><td>'+val(pct(r.before))+'</td>'+
      '<td><strong>'+val(pct(r.S))+'</strong></td><td>'+val(pct(r.ci[0])+" to "+pct(r.ci[1]))+'</td></tr>';
  }).join("");
}
function drawMainCalc() {
  const r=MAIN[activeStep];
  $("#instruction").innerHTML='<span class="badge">Month '+r.t+'</span> &nbsp;'+
    (r.d?(r.d===1?"One event occurs.":"Two events occur at exactly the same month."):"One patient is censored, with no event.");
  const riskLine="8 - "+r.earlierEvents+" previous events - "+r.earlierCensors+" previous censorings = "+r.n;
  const survivalLine=r.d ? "("+r.n+" - "+r.d+") / "+r.n+" = "+(r.n-r.d)+"/"+r.n+" = "+pct(r.factor)
    : "No event: multiply by 1. Survival stays unchanged.";
  const afterLine=r.n+" - "+r.d+" events - "+r.c+" censored = "+r.after;
  $("#calc").innerHTML='<div class="calcbox"><strong>Risk set just before month '+r.t+'</strong><div>'+riskLine+'</div>'+
    '<p><strong>At month '+r.t+':</strong> '+r.d+' event(s), '+r.c+' censoring(s)</p>'+
    '<div>Conditional survival: '+survivalLine+'</div>'+
    '<p><strong>Accumulated KM:</strong> '+pct(r.before)+' × '+pct(r.factor)+' = <span class="big">'+pct(r.S)+'</span></p>'+
    '<div class="mini">At risk immediately after this time: '+afterLine+'</div></div>';
  const stages=[
    ["1. Before this time",riskLine+" people"],
    ["2. What occurs",r.d+" event(s), "+r.c+" censoring(s)"],
    ["3. Survive this step",r.d?(r.n-r.d)+"/"+r.n+" = "+pct(r.factor):"100% (no event)"],
    ["4. Carry survival forward",pct(r.before)+" × "+pct(r.factor)+" = "+pct(r.S)]
  ];
  $("#stepMath").innerHTML='<h3>The calculation, one piece at a time</h3>'+
    '<div class="formula-chain">'+stages.map(s=>'<div class="formula-step"><span class="mini">'+s[0]+'</span><div class="num">'+s[1]+'</div></div>').join("")+'</div>'+
    '<p class="mini">At-risk counts are measured <strong>immediately before</strong> the time point. The updated KM estimate multiplies the previous estimate by this time point’s conditional survival. At a censor-only time, multiply by 1.</p>'+
    '<p><strong>Pointwise 95% confidence interval:</strong> '+pct(r.ci[0])+' to '+pct(r.ci[1])+'. '+
    (r.d?"This event changes both survival and its estimated uncertainty.":"Censoring by itself has not changed the interval. Its impact can appear at subsequent events.")+'</p>';
  $("#mainInsight").textContent=r.d ? "The current drop is "+pct(r.before-r.S)+" percentage points. It uses "+r.n+" people at risk just before this time."
    : "No event means no KM drop and no Greenwood variance update, even though the risk set falls from "+r.n+" to "+r.after+".";
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

/* Module 2: one event in different risk-set sizes. */
function drawRisk(){
  const n=Number($("#riskN").value);
  const n0=40;
  const S=(n-1)/n,g=1/(n*(n-1)),ci=confidence(S,g);
  const S0=(n0-1)/n0,g0=1/(n0*(n0-1)),ci0=confidence(S0,g0);
  $("#riskValue").textContent=n;
  $("#riskNumbers").innerHTML=
    '<div class="metric"><div class="mini">Conditional survival</div><div class="value">'+pct(S)+'</div><div class="mini">('+n+' − 1) / '+n+'</div></div>'+
    '<div class="metric"><div class="mini">KM step down</div><div class="value">'+pct(1/n)+'</div><div class="mini">1 / '+n+' at risk</div></div>'+
    '<div class="metric"><div class="mini">Pointwise 95% CI</div><div class="value">'+pct(ci[0])+'</div><div class="mini">to '+pct(ci[1])+'</div></div>';
  $("#riskNarrative").innerHTML='One event among <strong>'+n+'</strong> people lowers survival by <strong>'+pct(1/n)+'</strong>. The same single event among <strong>40</strong> people lowers survival by <strong>2.5%</strong>. A smaller denominator creates a larger step and a less precise estimate at that event. This is a single-event illustration, not a rule that every decrease in the risk count immediately widens a CI.';
  const svg=$("#riskPlot"), start=77,end=730,px=v=>start+(end-start)*v;
  let h='';
  [0,.25,.5,.75,1].forEach(v=>{
    h+='<line x1="'+px(v)+'" y1="34" x2="'+px(v)+'" y2="218" stroke="#e4e9f1"/>'+
      '<text x="'+px(v)+'" y="245" fill="#56647a" text-anchor="middle" font-size="13">'+pct(v)+'</text>';
  });
  [{y:105,ci,S,color:"#315c9a",label:n+" at risk"},
    {y:185,ci:ci0,S:S0,color:"#157a78",label:"40 at risk"}].forEach(r=>{
    h+='<text x="80" y="'+(r.y-30)+'" font-size="14" fill="'+r.color+'" font-weight="700">'+r.label+'</text>'+
      '<line x1="'+px(r.ci[0])+'" x2="'+px(r.ci[1])+'" y1="'+r.y+'" y2="'+r.y+'" stroke="'+r.color+'" stroke-width="5"/>'+
      '<line x1="'+px(r.ci[0])+'" x2="'+px(r.ci[0])+'" y1="'+(r.y-9)+'" y2="'+(r.y+9)+'" stroke="'+r.color+'" stroke-width="2"/>'+
      '<line x1="'+px(r.ci[1])+'" x2="'+px(r.ci[1])+'" y1="'+(r.y-9)+'" y2="'+(r.y+9)+'" stroke="'+r.color+'" stroke-width="2"/>'+
      '<circle cx="'+px(r.S)+'" cy="'+r.y+'" r="7" fill="'+r.color+'"/>';
  });
  h+='<text x="390" y="270" text-anchor="middle" font-size="14" fill="#56647a">Survival probability, 95% pointwise CI</text>';
  svg.innerHTML=h;
}
$("#riskN").addEventListener("input",drawRisk);

/* Module 3: event timing with the same total number of events. */
const timingSchedules={
  early:[1,2,2,3,3,4],
  spread:[2,4,6,8,9,11],
  late:[7,8,9,10,10,11]
};
function timingRecords(which,earlyCensoring){
  const obs=timingSchedules[which].map(t=>({t,status:"event"}));
  if(earlyCensoring){
    for(let i=0;i<4;i++)obs.push({t:5,status:"censor"});
    for(let i=0;i<4;i++)obs.push({t:6,status:"censor"});
    for(let i=0;i<6;i++)obs.push({t:12,status:"censor"});
  } else {
    for(let i=0;i<14;i++)obs.push({t:12,status:"censor"});
  }
  return obs;
}
function findLastEvent(rows){return rows.filter(r=>r.d).slice(-1)[0]}
function drawTiming(){
  const which=$("#timing").value,earlyCensoring=$("#timingCensor").checked;
  const options=["early","spread","late"];
  const runs={};
  options.forEach(s=>runs[s]=km(timingRecords(s,earlyCensoring),20));
  const colors={early:"#157a78",spread:"#b87824",late:"#7456a6"};
  const series=options.map(s=>({rows:runs[s],color:s===which?"#315c9a":colors[s],
    dash:s!==which,band:s===which,censors:s===which,events:s===which}));
  plotSurvival("#timingPlot",series,12,true);
  const rows=runs[which],end=findLastEvent(rows);
  const earlyFinal=findLastEvent(runs.early),lateFinal=findLastEvent(runs.late);
  $("#timingNumbers").innerHTML=
    '<div class="metric"><div class="mini">First event, patients at risk</div><div class="value">'+rows.find(r=>r.d).n+'</div><div class="mini">month '+rows.find(r=>r.d).t+'</div></div>'+
    '<div class="metric"><div class="mini">Last event, patients at risk</div><div class="value">'+end.n+'</div><div class="mini">month '+end.t+'</div></div>'+
    '<div class="metric"><div class="mini">Survival after last event</div><div class="value">'+pct(end.S)+'</div><div class="mini">95% CI: '+pct(end.ci[0])+' to '+pct(end.ci[1])+'</div></div>';
  $("#timingCompare").innerHTML=
    '<strong>Same 20 patients and 6 events.</strong> Survival after all events: early concentration <strong>'+pct(earlyFinal.S)+
    '</strong> (95% CI '+pct(earlyFinal.ci[0])+' to '+pct(earlyFinal.ci[1])+'); late concentration <strong>'+pct(lateFinal.S)+
    '</strong> (95% CI '+pct(lateFinal.ci[0])+' to '+pct(lateFinal.ci[1])+'). '+
    (earlyCensoring
      ?'Eight individuals are censored at months 5 and 6 in both scenarios. Early events occur while the risk set is still large, whereas late events occur after these censorings. This is why the final KM estimates differ despite the same six events.'
      :'All non-event observations are censored at month 12. Here event timing changes the shape and timing of the drops, but not final survival or its CI when all six events have occurred.');
  $("#timingRows").innerHTML=rows.map(r=>'<tr><td>'+r.t+'</td><td>'+r.n+'</td><td>'+r.d+'</td><td>'+r.c+'</td><td>'+pct(r.factor)+'</td><td><strong>'+pct(r.S)+'</strong></td><td>'+pct(r.ci[0])+' to '+pct(r.ci[1])+'</td></tr>').join("");
}
$("#timing").addEventListener("change",drawTiming);
$("#timingCensor").addEventListener("change",drawTiming);

/* Module 4: before-time and same-time censoring. */
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
  plotSurvival("#censorPlot",[
    {rows:baseline,color:"#157a78",dash:true},
    {rows,color:"#315c9a",band:true,censors:true,events:true}
  ],12,true);
  $("#censorNumbers").innerHTML=
    '<div class="metric"><div class="mini">Risk set at month 6</div><div class="value">'+at6.n+'</div><div class="mini">12 − '+before+' earlier censorings</div></div>'+
    '<div class="metric"><div class="mini">After the month-6 event</div><div class="value">'+pct(at6.S)+'</div><div class="mini">('+at6.n+' − 1) / '+at6.n+'</div></div>'+
    '<div class="metric"><div class="mini">After the month-9 event</div><div class="value">'+pct(at9.S)+'</div><div class="mini">at risk at month 9: '+at9.n+'</div></div>';
  $("#censorMath").innerHTML=
    '<div class="formula-chain">'+
    '<div class="formula-step"><span class="mini">1. Month 3, before the first event</span><div class="num">12 − '+before+' = '+at6.n+'</div><div class="mini">Censoring has no immediate KM drop</div></div>'+
    '<div class="formula-step"><span class="mini">2. Month 6, event first</span><div class="num">('+at6.n+' − 1)/'+at6.n+' = '+pct(at6.S)+'</div><div class="mini">'+tied+' same-time censoring(s) still count in '+at6.n+'</div></div>'+
    '<div class="formula-step"><span class="mini">3. After month 6</span><div class="num">'+at6.n+' − 1 − '+tied+' = '+at9.n+'</div><div class="mini">Remove the event AND same-time censorings</div></div>'+
    '<div class="formula-step"><span class="mini">4. Month 9, next event</span><div class="num">'+pct(at6.S)+' × '+(at9.n-1)+'/'+at9.n+' = '+pct(at9.S)+'</div><div class="mini">The smaller risk set now changes the drop</div></div>'+
    '</div>';
  $("#censorTie").innerHTML=
    '<strong>When an event and censoring share month 6:</strong> the denominator is '+at6.n+
    ', not '+(at6.n-tied)+'. The '+tied+' same-time censored participant(s) are removed <strong>after</strong> the event-time survival fraction is calculated. '+
    'At month 6, the pointwise 95% CI is '+pct(at6.ci[0])+' to '+pct(at6.ci[1])+
    '. Same-time censoring does not change this CI immediately, but it changes the month-9 risk set and can affect the later estimate and CI.';
  $("#censorRows").innerHTML=rows.map(r=>'<tr><td>'+r.t+'</td><td>'+r.n+'</td><td>'+r.d+'</td><td>'+r.c+'</td><td>'+r.after+'</td><td>'+pct(r.factor)+'</td><td>'+pct(r.S)+'</td><td>'+pct(r.ci[0])+' to '+pct(r.ci[1])+'</td></tr>').join("");
}
$("#beforeCensor").addEventListener("input",drawCensor);
$("#sameCensor").addEventListener("input",drawCensor);

renderMain();
drawRisk();
drawTiming();
drawCensor();
