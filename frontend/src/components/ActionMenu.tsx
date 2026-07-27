import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "./Icons";

type MenuAlign = "start" | "end";
type MenuRole = "menu" | "dialog";

interface ActionMenuProps {
  label: string;
  icon: ReactNode;
  children: (closeMenu: (restoreFocus?: boolean) => void) => ReactNode;
  align?: MenuAlign;
  panelRole?: MenuRole;
  panelWidth?: number;
  buttonClassName?: string;
  rootClassName?: string;
  showLabel?: boolean;
  showChevron?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * A portal-backed action menu. Portalling keeps menus out of clipped toolbars,
 * while focus ownership, Escape, outside click, and arrow navigation stay
 * consistent wherever the trigger is used.
 */
export function ActionMenu({
  label,
  icon,
  children,
  align = "end",
  panelRole = "menu",
  panelWidth = 280,
  buttonClassName = "btn btn-quiet toolbar-menu-trigger",
  rootClassName,
  showLabel = true,
  showChevron = true,
  active = false,
  disabled = false,
  title,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const placePanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const anchor = trigger.getBoundingClientRect();
    const width = panel.offsetWidth || panelWidth;
    const height = panel.offsetHeight;
    let left = align === "end" ? anchor.right - width : anchor.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    let top = anchor.bottom + 7;
    if (top + height > window.innerHeight - 8 && anchor.top - height - 7 >= 8) {
      top = anchor.top - height - 7;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    setPosition({ top, left });
  }, [align, panelWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
    const frame = window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        '[data-menu-autofocus], [role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), select:not(:disabled), input:not(:disabled)',
      );
      first?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, placePanel]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== panelId) closeMenu(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("personaparlour:action-menu-open", handleOtherMenu);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("personaparlour:action-menu-open", handleOtherMenu);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open, closeMenu, panelId, placePanel]);

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
      const active = document.activeElement;
      const leavingBackward = event.shiftKey && active === focusable[0];
      const leavingForward = !event.shiftKey && active === focusable[focusable.length - 1];
      if (leavingBackward || leavingForward) {
        setOpen(false);
        setPosition(null);
        triggerRef.current?.focus();
      }
      return;
    }
    if (panelRole !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)',
      ) || [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (event.key === "End") next = items.length - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    else next = current < 0 || current === items.length - 1 ? 0 : current + 1;
    items[next]?.focus();
  };

  return (
    <span
      ref={rootRef}
      className={rootClassName}
      data-menu-open={open}
      style={{ display: "inline-flex" }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        data-active={active || open}
        disabled={disabled}
        title={title || label}
        aria-label={label}
        aria-haspopup={panelRole}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) {
            window.dispatchEvent(new CustomEvent("personaparlour:action-menu-open", { detail: panelId }));
          }
          setOpen((current) => !current);
        }}
      >
        {icon}
        {showLabel && <span className="action-menu-trigger-label">{label}</span>}
        {showChevron && (
          <span className="action-menu-trigger-chevron">
            <IconChevronDown size={12} />
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          id={panelId}
          ref={panelRef}
          className="action-menu-panel"
          role={panelRole}
          aria-label={label}
          onKeyDown={handlePanelKeyDown}
          style={{
            width: panelWidth,
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            visibility: position ? "visible" : "hidden",
          }}
        >
          {children((restoreFocus = true) => closeMenu(restoreFocus))}
        </div>,
        document.body,
      )}
    </span>
  );
}

interface MenuActionProps {
  closeMenu: (restoreFocus?: boolean) => void;
  icon: ReactNode;
  label: string;
  description?: string;
  trailing?: ReactNode;
  active?: boolean;
  /** Read-only on/off indicator for actions that open a settings surface. */
  status?: boolean;
  danger?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  restoreFocusOnClose?: boolean;
  onSelect: () => void;
}

export function MenuAction({
  closeMenu,
  icon,
  label,
  description,
  trailing,
  active,
  status,
  danger,
  disabled,
  closeOnSelect = true,
  restoreFocusOnClose = true,
  onSelect,
}: MenuActionProps) {
  const toggle = typeof active === "boolean";
  const hasStatus = typeof status === "boolean";
  const indicated = toggle ? active : status;
  return (
    <button
      type="button"
      role={toggle ? "menuitemcheckbox" : "menuitem"}
      aria-checked={toggle ? active : undefined}
      aria-label={hasStatus ? `${label} (${status ? "on" : "off"})` : undefined}
      className={`action-menu-item${danger ? " danger" : ""}`}
      data-active={indicated}
      disabled={disabled}
      onClick={() => {
        onSelect();
        if (closeOnSelect) closeMenu(restoreFocusOnClose);
      }}
    >
      <span className="action-menu-item-icon">{icon}</span>
      <span className="action-menu-item-copy">
        <span className="action-menu-item-label">{label}</span>
        {description && <span className="action-menu-item-description">{description}</span>}
      </span>
      {toggle || hasStatus
        ? <IconCheck className="action-menu-check" size={14} />
        : trailing && <span className="action-menu-item-trailing">{trailing}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="action-menu-separator" role="separator" />;
}
