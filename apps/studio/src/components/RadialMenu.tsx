import { X } from 'lucide-react';
/**
 * Concentric Radial Pie Menu (Signature Demo Right-Click UX).
 * Renders a crisp monochrome dashed halo ring, dark central dismiss core,
 * and evenly distributed animated action petals clamped inside viewport edges.
 */
import type { ReactNode } from 'react';

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface RadialMenuProps {
  x: number;
  y: number;
  items: RadialMenuItem[];
  onClose: () => void;
}

export function RadialMenu({ x, y, items, onClose }: RadialMenuProps) {
  if (items.length === 0) return null;

  const radius = items.length <= 3 ? 74 : items.length <= 5 ? 88 : 98;
  const padX = radius + 72;
  const padY = radius + 44;
  const cx = Math.min(window.innerWidth - padX, Math.max(padX, x));
  const cy = Math.min(window.innerHeight - padY, Math.max(padY, y));
  const startAngle = -Math.PI / 2;

  return (
    <>
      <div
        className="fixed inset-0 z-[79]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        aria-label="画布快捷径向菜单"
        className="radial-menu"
        style={{ left: cx, top: cy }}
      >
        <div className="radial-ring-halo" style={{ width: radius * 2, height: radius * 2 }} />
        <button type="button" aria-label="关闭菜单" onClick={onClose} className="radial-core">
          <X size={14} />
        </button>
        {items.map((item, idx) => {
          const angle = startAngle + (idx / items.length) * Math.PI * 2;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                item.onSelect();
                onClose();
              }}
              className={`radial-petal${item.danger ? ' danger' : ''}`}
              style={{ left: px, top: py }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
