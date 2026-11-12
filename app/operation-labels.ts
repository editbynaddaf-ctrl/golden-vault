// Human-readable, Persian game reports. Never render raw SQL/JSON metadata to players.
export const actionLabels: Record<string,string> = {
  thief:'🥷 سرقت', killer:'⚔️ ترور', guardian:'🛡️ محافظت',
  spy_role:'👁️ شناسایی نقش', spy_key:'🔍 استعلام کلید',
  spy_shop:'🛒 استعلام خریدهای حریف', attack:'⚔️ فرمان حمله',
  golden_day:'☀️ روز طلایی', activate_equipment:'🎒 فعال‌سازی تجهیز',
};
export const roleLabels: Record<string,string> = {
  commander:'فرمانده',thief:'سارق',killer:'قاتل',guardian:'محافظ',spy:'جاسوس',
};
export const equipmentLabels: Record<string,string> = {
  team_shield:'سپر تیمی',key_duel:'دوئل کلیدها',
  three_key_scanner:'اسکنر سه کلید',parity_oracle:'گوی زوج و فرد',
};
const outcomeLabels: Record<string,string> = {
  protected:'محافظت با موفقیت برقرار شد.',
  blocked_by_protection:'عملیات به دلیل محافظت، خنثی شد.',
  guardian_immune:'عملیات ناموفق بود؛ محافظ مصونیت دائمی دارد.',
  commander_penalty_pending_sales:'سرقت از فرمانده ناموفق بود؛ جریمه مربوط به فروش اعمال می‌شود.',
  guardian_penalty_pending_sales:'ترور محافظ ناموفق بود؛ جریمه مربوط به فروش اعمال می‌شود.',
  robbery_success_pending_sales:'سرقت موفق بود؛ نتیجه مالی آن وابسته به فروش ثبت‌شده است.',
  assassination_success_pending_sales:'ترور موفق بود؛ قدرت هدف غیرفعال و اثر مالی بر اساس فروش محاسبه می‌شود.',
  assassination_failed:'ترور ناموفق بود.',
  robbery_success:'سرقت با موفقیت انجام شد.',
  assassination_success:'ترور با موفقیت انجام شد.',
  canceled_by_assassination:'این عملیات به دلیل ترور اجراکننده لغو شد.',
  awaiting_sales:'نتیجه اولیه مشخص است؛ محاسبه سکه وابسته به فروش روز است.',
  invalid_target:'هدف نامعتبر بود و عملیات انجام نشد.',
  game_ended:'با پایان بازی، این عملیات لغو شد.',
};
export function asRecord(input:unknown):Record<string,unknown>|null {
  if (typeof input==='string') {
    try { input=JSON.parse(input); } catch { return null; }
  }
  return input !== null && typeof input==='object' && !Array.isArray(input)
    ? input as Record<string,unknown> : null;
}
function safeNum(n:unknown):number|null {
  return typeof n==='number' && Number.isFinite(n) ? n : null;
}
export function statusLabel(status:string) {
  return ({resolved:'نتیجه مشخص شده',pending:'در انتظار بررسی',
    canceled:'لغو شده',cancelled:'لغو شده',hidden:'نتیجه هنوز قابل نمایش نیست'} as Record<string,string>)[status]||'وضعیت نامشخص';
}
export function operationDescription(kind:string,actor:string,target:string|null){
  const who=actor||'بازیکن';
  switch(kind){
    case 'thief': return `${who} برای سرقت از ${target||'حریف'} اقدام کرد.`;
    case 'killer': return `${who} برای ترور ${target||'حریف'} اقدام کرد.`;
    case 'guardian': return `${who} از ${target||'هم‌تیمی'} محافظت کرد.`;
    case 'spy_role': return `${who} نقش ${target||'یک بازیکن حریف'} را استعلام کرد.`;
    case 'spy_key': return `${who} درباره پیدا شدن کلید توسط تیم حریف استعلام گرفت.`;
    case 'spy_shop': return `${who} خریدهای تیم حریف را بررسی کرد.`;
    case 'attack': return `${who} فرمان حمله تیمی صادر کرد.`;
    case 'golden_day': return `${who} روز طلایی تیم را فعال کرد.`;
    default: return `${who} یک عملیات ثبت کرد.`;
  }
}
export function operationResults(raw:unknown,status:string,kind:string):string[] {
  if(status==='pending')return ['این عملیات هنوز بررسی نشده است.'];
  if(status==='canceled'||status==='cancelled')return ['این عملیات لغو شده است.'];
  const d=asRecord(raw);
  if(!d)return [status==='resolved'?'عملیات بررسی شده است؛ جزئیات بیشتری ثبت نشده.':'هنوز نتیجه‌ای ثبت نشده است.'];
  const lines:string[]=[];
  const outcome=typeof d.outcome==='string'?d.outcome:null;
  if(outcome) lines.push(outcomeLabels[outcome]||'نتیجه عملیات ثبت شده است.');
  if(typeof d.role==='string')
    lines.push(`نقش شناسایی‌شده: ${roleLabels[d.role]||'نامشخص'}.`);
  if(typeof d.found==='boolean')
    lines.push(d.found?'تیم حریف کلید صحیح را پیدا کرده بود.':'در زمان استعلام، تیم حریف هنوز کلید صحیح را پیدا نکرده بود.');
  const equipment=asRecord(d.equipment);
  if(equipment){
    const purchases=Object.entries(equipment)
      .filter(([,v])=>safeNum(v)!==null)
      .map(([name,v])=>`${equipmentLabels[name]||'تجهیز'}: ${v} عدد`);
    lines.push(purchases.length?`خریدهای حریف: ${purchases.join('، ')}.`:'تا زمان استعلام، خریدی برای حریف ثبت نشده بود.');
  }
  const attack=asRecord(d.attack_details);
  if(attack){
    const own=safeNum(attack.own_sales);
    const opponent=safeNum(attack.opponent_sales);
    if(own!==null && opponent!==null)
      lines.push(`مقایسه فروش روز حمله: تیم حمله‌کننده ${own} میلیون تومان، تیم حریف ${opponent} میلیون تومان.`);
    if(typeof attack.success==='boolean')
      lines.push(attack.success?'فرمان حمله موفق شد.':'فرمان حمله موفق نشد.');
    const bonus=safeNum(attack.bonus_coins);
    if(bonus!==null)lines.push(`سکه منتقل‌شده بابت حمله: ${bonus} سکه.`);
  }
  const penalty=asRecord(d.penalty_details);
  if(penalty){
    if(typeof penalty.reason==='string'){
      const reasons:Record<string,string>={
        target_commander:'هدف، فرمانده بود',target_guardian:'هدف، محافظ بود',
      };
      if(reasons[penalty.reason])lines.push(`دلیل جریمه: ${reasons[penalty.reason]}.`);
    }
    const amount=safeNum(penalty.base_coins_transferred);
    if(amount!==null)lines.push(`سکه‌های پایه انتقال‌یافته: ${amount} سکه.`);
  }
  if(typeof d.financial_settled==='boolean')
    lines.push(d.financial_settled?'اثر مالی این عملیات تسویه شده است.':'تسویه مالی این عملیات هنوز نهایی نشده است.');
  if(!lines.length)lines.push(kind.startsWith('spy_')?'استعلام انجام شده است.':'عملیات بررسی شده است؛ جزئیات بیشتری ثبت نشده.');
  return lines;
}
export function eventDescription(summary:string,details:unknown):string[] {
  const d=asRecord(details);
  if(!d)return [];
  const lines:string[]=[];
  const equipment=typeof d.equipment==='string'?equipmentLabels[d.equipment]:null;
  if(equipment)lines.push(`تجهیز: ${equipment}.`);
  const cost=safeNum(d.cost);
  if(cost!==null)lines.push(`هزینه: ${cost} سکه.`);
  const amount=safeNum(d.amount);
  if(amount!==null)lines.push(`مقدار: ${amount} سکه.`);
  // Victory and shop events already have a Persian summary. Do not expose IDs or JSON.
  return lines;
}
