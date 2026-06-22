import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';

/** Curated set of lucide icons relevant to grouping cloud/architecture blocks. */
const GROUP_ICONS = [
  'lucide:server',
  'lucide:database',
  'lucide:cloud',
  'lucide:box',
  'lucide:boxes',
  'lucide:layers',
  'lucide:folder',
  'lucide:network',
  'lucide:shield',
  'lucide:globe',
  'lucide:cpu',
  'lucide:container',
  'lucide:users',
  'lucide:building-2',
  'lucide:lock',
  'lucide:key-round',
  'lucide:git-branch',
  'lucide:workflow',
  'lucide:hard-drive',
  'lucide:router',
  'lucide:component',
  'lucide:cog',
  'lucide:zap',
  'lucide:webhook',
];

type Props = {
  value?: string;
  onPick: (icon: string | undefined) => void;
};

/** Dropdown to set (or clear) a group's header icon. */
export function GroupIconPicker({ value, onPick }: Readonly<Props>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // capture phase: the balloon stops propagation of pointer events.
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  return (
    <div className="gip-root" ref={ref}>
      <button
        type="button"
        className="btn-icon gip-trigger"
        title={t('picker.groupIcon')}
        aria-label={t('picker.groupIcon')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={value ?? 'lucide:shapes'} width={16} height={16} />
        <Icon className="gip-caret" icon="mdi:chevron-down" width={11} height={11} />
      </button>

      {open && (
        <div className="gip-pop" role="menu">
          <button
            type="button"
            className="gip-cell gip-none"
            data-active={!value}
            title={t('picker.groupIcon.none')}
            aria-label={t('picker.groupIcon.noneLabel')}
            onClick={() => {
              onPick(undefined);
              setOpen(false);
            }}
          >
            <Icon icon="mdi:close" width={15} height={15} />
          </button>
          {GROUP_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className="gip-cell"
              data-active={value === ic}
              title={ic.replace('lucide:', '')}
              onClick={() => {
                onPick(ic);
                setOpen(false);
              }}
            >
              <Icon icon={ic} width={16} height={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
