import {
    forwardRef,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type {
    AriaAttributes,
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../shared/utils";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { Field, type FieldPresentation } from "./Field";
import {
    fitSelectPosition,
    openIndex,
    outsidePointerAction,
    selectKeyAction,
    type SelectPosition,
    type StudioSelectOption,
} from "./selectLogic";

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface SelectProps extends FieldPresentation {
    id?: string;
    value: string;
    options: readonly StudioSelectOption[];
    onChange: (value: string, option: StudioSelectOption) => void;
    placeholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    menuClassName?: string;
    defaultOpen?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: AriaAttributes["aria-invalid"];
}

function targetIsFocusable(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
        target.closest(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )
    );
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
    (
        {
            id,
            value,
            options,
            onChange,
            placeholder = "",
            emptyLabel = "No options",
            label,
            helper,
            error,
            required,
            disabled,
            wrapperClassName,
            className,
            menuClassName,
            defaultOpen = false,
            "aria-describedby": describedBy,
            "aria-invalid": invalid,
        },
        ref
    ) => {
        const generated = useId();
        const fieldId = id || `studio-select-${generated.replace(/:/g, "")}`;
        const labelId = `${fieldId}-label`;
        const valueId = `${fieldId}-value`;
        const listboxId = `${fieldId}-listbox`;
        const triggerRef = useRef<HTMLButtonElement>(null);
        const menuRef = useRef<HTMLDivElement>(null);
        const keyboardActivationRef = useRef(0);
        const [open, setOpen] = useState(defaultOpen);
        const [activeIndex, setActiveIndex] = useState(() =>
            defaultOpen ? openIndex(options, value, 1) : -1
        );
        const [menuPosition, setMenuPosition] =
            useState<SelectPosition | null>(null);

        const setTriggerRef = useCallback(
            (node: HTMLButtonElement | null) => {
                triggerRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
            },
            [ref]
        );

        const selectedOption = options.find(
            (option) => option.value === value
        );
        const display = selectedOption?.label ?? placeholder;

        const chooseOption = useCallback(
            (index: number) => {
                const option = options[index];
                if (!option || option.disabled) return;
                onChange(option.value, option);
                setOpen(false);
                setActiveIndex(index);
                triggerRef.current?.focus();
            },
            [onChange, options]
        );

        const openMenu = useCallback(
            (preferredIndex?: number) => {
                setActiveIndex(
                    preferredIndex ?? openIndex(options, value, 1)
                );
                setOpen(true);
            },
            [options, value]
        );

        const handleTriggerClick = () => {
            if (disabled) return;
            if (open) setOpen(false);
            else openMenu();
        };

        const handleTriggerKeyDown = (
            event: ReactKeyboardEvent<HTMLButtonElement>
        ) => {
            if (disabled) return;
            if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "Spacebar"
            ) {
                keyboardActivationRef.current = Date.now();
            }
            const action = selectKeyAction(event.key, {
                open,
                activeIndex,
                options,
                selectedValue: value,
            });
            if (action.type === "none") return;
            if (action.preventDefault) event.preventDefault();
            switch (action.type) {
                case "open":
                    openMenu(action.activeIndex);
                    break;
                case "move":
                    setActiveIndex(action.activeIndex);
                    break;
                case "select":
                    chooseOption(action.activeIndex);
                    break;
                case "close":
                    setOpen(false);
                    if (action.restoreFocus) triggerRef.current?.focus();
                    break;
            }
        };

        useIsomorphicLayoutEffect(() => {
            if (!open || typeof window === "undefined") return;
            const updatePosition = () => {
                const trigger = triggerRef.current;
                if (!trigger) return;
                const rect = trigger.getBoundingClientRect();
                setMenuPosition(
                    fitSelectPosition({
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        width: rect.width,
                        viewportWidth: window.innerWidth,
                        viewportHeight: window.innerHeight,
                        desiredHeight: Math.min(
                            320,
                            options.length * 34 + 12
                        ),
                    })
                );
            };
            updatePosition();
            window.addEventListener("resize", updatePosition);
            document.addEventListener("scroll", updatePosition, true);
            return () => {
                window.removeEventListener("resize", updatePosition);
                document.removeEventListener("scroll", updatePosition, true);
            };
        }, [open, options.length]);

        useEffect(() => {
            if (!open || activeIndex < 0) return;
            const active = document.getElementById(
                `${listboxId}-${activeIndex}`
            );
            active?.scrollIntoView({ block: "nearest" });
        }, [activeIndex, listboxId, open]);

        useEffect(() => {
            if (disabled) setOpen(false);
        }, [disabled]);

        useEffect(() => {
            if (!open || typeof document === "undefined") return;
            const onPointerDown = (event: PointerEvent) => {
                const target = event.target;
                const inside =
                    (triggerRef.current?.contains(target as Node) ?? false) ||
                    (menuRef.current?.contains(target as Node) ?? false);
                const action = outsidePointerAction({
                    open,
                    inside,
                    targetFocusable: targetIsFocusable(target),
                });
                if (!action.close) return;
                setOpen(false);
                if (action.restoreFocus) {
                    event.preventDefault();
                    triggerRef.current?.focus();
                }
            };
            document.addEventListener("pointerdown", onPointerDown, true);
            return () =>
                document.removeEventListener(
                    "pointerdown",
                    onPointerDown,
                    true
                );
        }, [open]);

        const portalHost =
            open && typeof document !== "undefined"
                ? document.querySelector<HTMLElement>(".studio-app") ||
                  document.body
                : null;
        const portalTheme =
            typeof document !== "undefined"
                ? triggerRef.current
                      ?.closest<HTMLElement>("[data-studio-theme]")
                      ?.getAttribute("data-studio-theme") ?? undefined
                : undefined;

        const menuStyle: CSSProperties | undefined = menuPosition
            ? {
                  left: menuPosition.left,
                  width: menuPosition.width,
                  top: menuPosition.top,
                  bottom: menuPosition.bottom,
                  maxHeight: menuPosition.maxHeight,
              }
            : undefined;

        const menu = open ? (
            <div
                className="studio studio-select-layer"
                data-studio-theme={portalTheme}
            >
                <div
                    ref={menuRef}
                    id={listboxId}
                    className={cn("studio-select-menu", menuClassName)}
                    role="listbox"
                    aria-labelledby={labelId}
                    style={menuStyle}
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {options.length > 0 ? (
                        options.map((option, index) => {
                            const selected = option.value === value;
                            return (
                                <div
                                    key={`${option.value}-${index}`}
                                    id={`${listboxId}-${index}`}
                                    className="studio-select-option"
                                    role="option"
                                    aria-selected={selected}
                                    aria-disabled={
                                        option.disabled || undefined
                                    }
                                    data-active={
                                        activeIndex === index || undefined
                                    }
                                    data-disabled={
                                        option.disabled || undefined
                                    }
                                    onMouseEnter={() => {
                                        if (!option.disabled) {
                                            setActiveIndex(index);
                                        }
                                    }}
                                    onClick={() => chooseOption(index)}
                                >
                                    <span className="studio-select-option-label">
                                        {option.label}
                                    </span>
                                    <span
                                        className="studio-select-check"
                                        aria-hidden="true"
                                    >
                                        {selected && <CheckIcon />}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <div
                            className="studio-select-empty"
                            role="presentation"
                        >
                            {emptyLabel}
                        </div>
                    )}
                </div>
            </div>
        ) : null;

        return (
            <Field
                id={fieldId}
                label={label}
                helper={helper}
                error={error}
                required={required}
                disabled={disabled}
                describedBy={describedBy}
                invalid={invalid}
                className={wrapperClassName}
            >
                {(control) => {
                    const controlProps = { ...control };
                    delete controlProps.required;
                    return (
                        <>
                            <button
                                {...controlProps}
                                ref={setTriggerRef}
                                type="button"
                                role="combobox"
                                aria-haspopup="listbox"
                                aria-expanded={open}
                                aria-controls={listboxId}
                                aria-labelledby={`${labelId} ${valueId}`}
                                aria-activedescendant={
                                    open && activeIndex >= 0
                                        ? `${listboxId}-${activeIndex}`
                                        : undefined
                                }
                                aria-required={required || undefined}
                                className={cn(
                                    "studio-input",
                                    "studio-select-trigger",
                                    className
                                )}
                                disabled={disabled || control.disabled}
                                data-open={open || undefined}
                                onClick={(event) => {
                                    if (
                                        event.detail === 0 &&
                                        Date.now() -
                                            keyboardActivationRef.current <
                                            400
                                    ) {
                                        return;
                                    }
                                    handleTriggerClick();
                                }}
                                onKeyDown={handleTriggerKeyDown}
                            >
                                <span
                                    id={valueId}
                                    className="studio-select-value"
                                    data-placeholder={
                                        !selectedOption || undefined
                                    }
                                >
                                    {display}
                                </span>
                                <ChevronDownIcon className="studio-select-chevron" />
                            </button>
                            {menu &&
                                (portalHost
                                    ? createPortal(menu, portalHost)
                                    : menu)}
                        </>
                    );
                }}
            </Field>
        );
    }
);

Select.displayName = "Select";
