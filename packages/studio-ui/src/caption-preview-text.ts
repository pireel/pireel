import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { sceneLanguage, type DubbingLanguageCode } from '@pireel/studio-engine/scene-languages';

const samples: Record<DubbingLanguageCode, string> = {
  en: 'Every|word|matters', zh: '让|每句话|都被|看见', ja: 'すべての|言葉を|大切に',
  ko: '모든|말이|소중해요', yue: '每句|說話|都重要', es: 'Cada|palabra|importa',
  fr: 'Chaque|mot|compte', de: 'Jedes|Wort|zählt', pt: 'Cada|palavra|importa',
  ru: 'Каждое|слово|важно', it: 'Ogni|parola|conta', ar: 'كل|كلمة|مهمة',
  id: 'Setiap|kata|berarti', vi: 'Từng|lời nói|đều|quan trọng', th: 'ทุกคำ|มีความหมาย',
  ms: 'Setiap|perkataan|bermakna', hi: 'हर|शब्द|महत्वपूर्ण है', tl: 'Mahalaga|ang bawat|salita',
  tr: 'Her|kelime|önemlidir', nl: 'Elk|woord|telt', uk: 'Кожне|слово|важливе',
  pl: 'Każde|słowo|ma znaczenie', ro: 'Fiecare|cuvânt|contează', el: 'Κάθε|λέξη|μετράει',
  cs: 'Na každém|slově|záleží', fi: 'Jokainen|sana|merkitsee', bg: 'Всяка|дума|е важна',
  da: 'Hvert|ord|tæller', he: 'כל|מילה|חשובה', fa: 'هر|کلمه|مهم است',
  sk: 'Na každom|slove|záleží', sv: 'Varje|ord|räknas', hr: 'Svaka|riječ|je važna',
  hu: 'Minden|szó|számít', nb: 'Hvert|ord|teller', sl: 'Vsaka|beseda|šteje',
  ca: 'Cada|paraula|compta', nn: 'Kvart|ord|tel', ta: 'ஒவ்வொரு|சொல்லும்|முக்கியம்',
  af: 'Elke|woord|tel',
};

/** Preview language follows the dubbing target; interface labels still follow the UI locale. */
export function dubbingCaptionSample(options: CaptionTaskOptions): string | undefined {
  const language = options.dubbing && sceneLanguage(options.dubbing.language);
  return language ? samples[language.code] : undefined;
}
