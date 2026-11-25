import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModelPickerProps = {
  label: string;
  value: string;
  models: string[];
  placeholder: string;
  wide?: boolean;
  onChange: (value: string) => void;
};

export function ModelPicker({ label, value, models, placeholder, wide, onChange }: ModelPickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const ignorePointerClick = useRef(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const options = models.filter(model => model.toLowerCase().includes(value.trim().toLowerCase()));
  const expanded = open && options.length > 0;

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !input.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const field = input.current;
      if (!field) return;
      const rect = field.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const below = bottom - rect.bottom - 14;
      const above = rect.top - top - 14;
      const upward = below < 150 && above > below;
      const maxHeight = Math.max(44, Math.min(280, upward ? above : below));
      setPosition({ left: rect.left, width: rect.width, top: upward ? rect.top - 6 : rect.bottom + 6, maxHeight });
      list.current?.setAttribute("data-upward", String(upward));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [expanded]);

  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (model: string) => {
    gesture.current = null;
    onChange(model);
    setOpen(false);
    setActive(-1);
  };

  return <div className={wide ? "model-picker settings-wide" : "model-picker"}>
    <label htmlFor={id}><span>{label}</span></label>
    <input ref={input} id={id} role="combobox" aria-autocomplete="list"
      aria-expanded={expanded} aria-controls={expanded ? id + "-list" : undefined}
      aria-activedescendant={expanded && active >= 0 ? id + "-option-" + active : undefined}
      value={value} placeholder={placeholder} autoComplete="off" spellCheck={false}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onClick={() => setOpen(true)}
      onBlur={() => { if (!gesture.current) setOpen(false); }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
          event.preventDefault();
          setOpen(true);
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive(index => Math.max(0, Math.min(options.length - 1, index + step)));
        } else if (event.key === "Enter" && expanded && active >= 0) {
          event.preventDefault();
          choose(options[active]);
        }
      }}
    />
    {expanded && createPortal(<ul ref={list} id={id + "-list"} className="model-picker-options"
      role="listbox" aria-label={label + " suggestions"} style={position}>
      {options.map((model, index) => <li key={model} id={id + "-option-" + index}
        role="option" aria-selected={index === active}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          ignorePointerClick.current = false;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          // Cancelling a touch can suppress its click on mobile. Let it finish
          // normally, keeping the list open if the field blurs during the tap.
          if (event.pointerType === "mouse") event.preventDefault();
        }}
        onPointerMove={event => {
          const start = gesture.current;
          if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
        }}
        onPointerCancel={() => { gesture.current = null; ignorePointerClick.current = true; }}
        onPointerUp={event => {
          const start = gesture.current;
          if (start?.id === event.pointerId) ignorePointerClick.current = start.moved;
        }}
        onClick={event => {
          if (!ignorePointerClick.current || event.detail === 0) choose(model);
        }}>{model}</li>)}
    </ul>, document.body)}
  </div>;
}
