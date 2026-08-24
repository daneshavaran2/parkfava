import { useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n";
import { LANGUAGE_OPTIONS } from "./language-selector.types";
import { LanguageFlag } from "./flags";

/**
 * Language picker for the site header: shows the active language (flag +
 * name) closed, opens a popover listing every supported language on click.
 * Wired directly to the site's one i18n system (react-i18next + the
 * cookie/localStorage persistence already implemented in
 * src/i18n/LanguageProvider.tsx) — no parallel translation or storage logic.
 *
 * The flag is a visual cue for the language, not a country selector: only
 * the two languages src/i18n has locale files for are listed.
 */
export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const current: Lang = i18n.language?.startsWith("en") ? "en" : "fa";
  const currentOption = LANGUAGE_OPTIONS.find((l) => l.code === current) ?? LANGUAGE_OPTIONS[0];

  function handleSelect(code: Lang) {
    if (code !== current) setAppLanguage(code);
    setOpen(false);
  }

  function handleItemKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = (index + dir + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length;
      itemRefs.current[next]?.focus();
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="lang-select-trigger"
          aria-label={t("common.language")}
          aria-haspopup="listbox"
        >
          <span className="lang-select-flag">
            <LanguageFlag lang={currentOption.code} size={32} />
          </span>
          <span className="lang-select-label">{currentOption.nativeLabel}</span>
          <span className="lang-select-chevron">
            <ChevronDown size={16} strokeWidth={2.4} />
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="lang-select-content"
          role="listbox"
          aria-label={t("common.language")}
          align="start"
          sideOffset={10}
        >
          {LANGUAGE_OPTIONS.map((opt, i) => {
            const selected = opt.code === current;
            return (
              <button
                key={opt.code}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={selected}
                className="lang-select-item"
                onClick={() => handleSelect(opt.code)}
                onKeyDown={(e) => handleItemKeyDown(e, i)}
              >
                <span className="lang-select-flag lang-select-flag--sm">
                  <LanguageFlag lang={opt.code} size={28} />
                </span>
                <span className="lang-select-label">{opt.nativeLabel}</span>
                {selected && <Check className="lang-select-item-check" size={16} strokeWidth={2.6} />}
              </button>
            );
          })}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
