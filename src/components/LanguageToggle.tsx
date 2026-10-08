import { Languages } from 'lucide-react';
import { useLanguage } from '@/lib/language';

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2.5 py-2 text-[11px] font-black text-ink-600 shadow-sm transition hover:border-primary-300 hover:text-primary-700"
      aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={language === 'ar' ? 'English' : 'العربية'}
    >
      <Languages size={15} />
      {language === 'ar' ? 'EN' : 'ع'}
    </button>
  );
}
