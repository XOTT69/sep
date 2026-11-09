(() => {
  const $ = (id) => document.getElementById(id);
  const UETR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const reasons = {
    AC01:["Некоректний номер рахунку","Account number is invalid"],
    AC02:["Некоректний ідентифікатор рахунку","Account identification is invalid"],
    AC03:["Некоректний формат рахунку","Account format is invalid"],
    AC04:["Рахунок закритий","Account number closed"],
    AC06:["Рахунок заблокований","Account blocked"],
    AC07:["Рахунок закритий","Creditor account closed"],
    AC13:["Тип рахунку не дозволяє цю операцію","Invalid debtor account type"],
    AG01:["Операція заборонена для цього рахунку","Transaction forbidden"],
    AG02:["Некоректний код операції","Invalid bank operation code"],
    AM04:["Недостатньо коштів","Insufficient funds"],
    AM05:["Дублікат платежу","Duplication"],
    BE04:["Відсутні або некоректні дані отримувача","Missing or invalid creditor address"],
    FF01:["Некоректний формат повідомлення","Invalid file format"],
    MD07:["Отримувач/платник помер","End customer deceased"],
    MS03:["Причину не уточнено агентом","Not specified reason (agent-generated)"],
    NARR:["Текстова причина","Narrative"],
    RR01:["Відсутні або некоректні дані платника","Missing debtor account or identification"],
    RR02:["Відсутні або некоректні дані ідентифікації платника","Missing debtor name or address"],
    RR03:["Відсутні або некоректні дані ідентифікації отримувача","Missing creditor name or address"],
    RR04:["Регуляторна причина","Regulatory reason"],
    TECH:["Технічна помилка","Technical problem"],
    CUST:["Скасування за запитом клієнта","Requested by customer"]
  };
  const clean = (node) => (node?.textContent || "").trim();
  const localName = (node) => (node.localName || node.nodeName || "").replace(/^.*:/,"");
  const descendants = (node, name) => Array.from(node.getElementsByTagName("*")).filter(x => localName(x) === name);
  const firstText = (node, names) => {
    for (const name of names) { const found = descendants(node,name)[0]; if(found && clean(found)) return clean(found); }
    return "";
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const show = (el, html) => {el.innerHTML=html;el.classList.remove("hidden");};
  const hide = (el) => el.classList.add("hidden");

  $("lookup-form").addEventListener("submit", e => {
    e.preventDefault();
    const uetr=$("uetr").value.trim(), amount=$("amount").value.trim().replace(",",".");
    const out=$("lookup-result");
    if(!UETR_RE.test(uetr)){show(out,'<div class="result-title warning">Перевір формат UETR</div>Очікується UUID формату xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.');return;}
    if(!amount || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount)<=0){show(out,'<div class="result-title warning">Вкажи коректну суму платежу</div>Для запиту ТрекСЕП потрібні одночасно UETR та сума.');return;}
    const url="https://tracksep.bank.gov.ua/";
    show(out,'<div class="result-title">Дані підготовлено</div><div>UETR: <b>'+escapeHtml(uetr)+'</b><br>Сума: <b>'+escapeHtml(amount)+' UAH</b></div><p class="muted">Автоматичний запит до НБУ поки не підключений: публічний інтерфейс не надає підтвердженого стороннього API. Відкрий ТрекСЕП і введи ці два значення.</p><div class="result-actions"><a href="'+url+'" target="_blank" rel="noopener">Відкрити ТрекСЕП ↗</a><a href="#" id="copy-lookup">Скопіювати UETR та суму</a></div>');
    $("copy-lookup").addEventListener("click",ev=>{ev.preventDefault();navigator.clipboard?.writeText("UETR: "+uetr+"\nСума: "+amount+" UAH");ev.target.textContent="Скопійовано ✓";});
  });

  $("xml-file").addEventListener("change", async e => {
    const file=e.target.files?.[0]; if(!file)return;
    $("xml-input").value=await file.text();
    $("form-hint").textContent="Завантажено: "+file.name;
  });
  $("clear-btn").addEventListener("click",()=>{$("xml-input").value="";$("xml-file").value="";hide($("analysis-output"));});
  $("analyze-btn").addEventListener("click",()=>{
    const raw=$("xml-input").value.trim(),out=$("analysis-output");
    if(!raw){show(out,'<span class="warning">Додай XML-текст або обери файл.</span>');return;}
    const parser=new DOMParser(),doc=parser.parseFromString(raw,"application/xml");
    if(doc.querySelector("parsererror")){show(out,'<span class="warning">Не вдалося розібрати XML. Перевір, чи файл містить коректне XML-повідомлення.</span>');return;}
    const all=Array.from(doc.getElementsByTagName("*"));
    const tags=all.map(localName);
    const type=["pacs.004","pacs.002","trck.002"].find(t=>raw.includes(t)) || (tags.some(t=>t==="RtrRsnInf")?"pacs.004":tags.some(t=>t==="UETR"||t==="Status")?"Повідомлення про статус":"XML");
    const uetr=firstText(doc,["UETR"]);
    const reasonsFound=[];
    for(const n of all.filter(x=>localName(x)==="RtrRsnInf")){
      const codeNode=descendants(n,"Cd")[0] || descendants(n,"Prtry")[0];
      const code=clean(codeNode);
      const info=descendants(n,"AddtlInf").map(clean).filter(Boolean).join("; ");
      const origin=firstText(n,["Nm","Id"]);
      if(code||info) reasonsFound.push({code,info,origin});
    }
    const statusNodes=all.filter(x=>["TxSts","Sts","Status"].includes(localName(x)));
    const statuses=statusNodes.map(n=>({status:clean(n),parent:n.parentElement})).filter(x=>x.status);
    const events=[];
    for(const n of all.filter(x=>["TxInfAndSts","OrgnlTxRef","StsRsnInf"].includes(localName(x)))){
      const status=firstText(n,["TxSts","Sts","Status"]);
      const date=firstText(n,["AccptncDtTm","CreDtTm","IntrBkSttlmDt","DtTm"]);
      const agent=firstText(n,["Nm"]);
      if(status||date)events.push({status,date,agent});
    }
    let html='<div class="result-title">Результат аналізу · '+escapeHtml(type)+'</div>';
    html+='<div class="muted">Повідомлення розібране локально у браузері. Це аналіз наданого XML, не онлайн-відповідь НБУ.</div>';
    if(uetr)html+='<p>UETR: <b>'+escapeHtml(uetr)+'</b></p>';
    if(reasonsFound.length){
      html+='<div class="reason"><strong>Знайдено інформацію про причину повернення</strong>';
      reasonsFound.forEach(r=>{const d=reasons[r.code]||null;html+='<p><b>Код: '+escapeHtml(r.code||"не вказаний")+'</b>'+(d?' — '+escapeHtml(d[0]):'')+'</p>';if(r.info)html+='<p>Додаткова інформація: '+escapeHtml(r.info)+'</p>';if(r.origin)html+='<p>Джерело/ініціатор: '+escapeHtml(r.origin)+'</p>';});
      html+='<p class="muted small">Тлумачення коду довідкове. Остаточне значення звіряйте зі специфікацією та правилами банку.</p></div>';
    } else if(type==="pacs.004" || raw.includes("RtrRsnInf")) html+='<p class="warning">У повідомленні pacs.004 не знайдено заповненого RtrRsnInf із кодом або текстом причини.</p>';
    else html+='<p class="muted">У цьому XML не знайдено структури причини повернення RtrRsnInf. Сам факт статусу не дозволяє визначити помилку IBAN чи ЄДРПОУ.</p>';
    if(statuses.length){html+='<h3>Знайдені статуси</h3>';statuses.slice(0,30).forEach(s=>html+='<div class="status-row"><span class="status-time">Статус</span><b>'+escapeHtml(s.status)+'</b></div>');}
    if(events.length){html+='<h3>Події повідомлення</h3>';events.slice(0,30).forEach(ev=>html+='<div class="status-row"><span class="status-time">'+escapeHtml(ev.date||"Час не вказаний")+'</span><div><b>'+escapeHtml(ev.status||"Подія")+'</b>'+(ev.agent?'<div class="muted">'+escapeHtml(ev.agent)+'</div>':'')+'</div></div>');}
    show(out,html);
  });
})();