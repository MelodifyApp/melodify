export interface StudioSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectKeyboardState {
    open: boolean;
    activeIndex: number;
    options: readonly StudioSelectOption[];
    selectedValue: string;
}

export type SelectKeyAction =
    | { type: "none" }
    | { type: "open"; activeIndex: number; preventDefault: true }
    | { type: "move"; activeIndex: number; preventDefault: true }
    | {
          type: "select";
          activeIndex: number;
          preventDefault: true;
          restoreFocus: true;
      }
    | {
          type: "close";
          preventDefault: boolean;
          restoreFocus: boolean;
      };

export interface SelectPositionInput {
    top: number;
    bottom: number;
    left: number;
    width: number;
    viewportWidth: number;
    viewportHeight: number;
    desiredHeight?: number;
}

export interface SelectPosition {
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
    placement: "top" | "bottom";
}

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;
const MAX_MENU_HEIGHT = 320;
const MIN_MENU_HEIGHT = 96;

export function firstEnabledIndex(
    options: readonly StudioSelectOption[],
    start = 0
): number {
    if (options.length === 0) return -1;
    for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (!options[index].disabled) return index;
    }
    return -1;
}

export function lastEnabledIndex(
    options: readonly StudioSelectOption[]
): number {
    if (options.length === 0) return -1;
    for (let offset = options.length - 1; offset >= 0; offset -= 1) {
        if (!options[offset].disabled) return offset;
    }
    return -1;
}

export function stepEnabledIndex(
    options: readonly StudioSelectOption[],
    current: number,
    direction: 1 | -1
): number {
    if (options.length === 0) return -1;
    if (current < 0 || current >= options.length) {
        return direction === 1
            ? firstEnabledIndex(options)
            : lastEnabledIndex(options);
    }
    for (let step = 1; step <= options.length; step += 1) {
        const index =
            (current + direction * step + options.length) % options.length;
        if (!options[index].disabled) return index;
    }
    return -1;
}

export function openIndex(
    options: readonly StudioSelectOption[],
    value: string,
    direction: 1 | -1
): number {
    const selected = options.findIndex((option) => option.value === value);
    if (selected < 0) {
        return direction === 1 ? firstEnabledIndex(options) : lastEnabledIndex(options);
    }
    if (!options[selected].disabled) return selected;
    return stepEnabledIndex(options, selected, direction);
}

export function selectKeyAction(
    key: string,
    state: SelectKeyboardState
): SelectKeyAction {
    const { open, activeIndex, options, selectedValue } = state;

    if (key === "Enter" || key === " " || key === "Spacebar") {
        if (!open) {
            return {
                type: "open",
                activeIndex: openIndex(options, selectedValue, 1),
                preventDefault: true,
            };
        }
        const index =
            activeIndex >= 0 && !options[activeIndex]?.disabled
                ? activeIndex
                : openIndex(options, selectedValue, 1);
        if (index < 0) return { type: "none" };
        return {
            type: "select",
            activeIndex: index,
            preventDefault: true,
            restoreFocus: true,
        };
    }

    if (key === "ArrowDown") {
        if (!open) {
            return {
                type: "open",
                activeIndex: openIndex(options, selectedValue, 1),
                preventDefault: true,
            };
        }
        return {
            type: "move",
            activeIndex: stepEnabledIndex(options, activeIndex, 1),
            preventDefault: true,
        };
    }

    if (key === "ArrowUp") {
        if (!open) {
            return {
                type: "open",
                activeIndex: openIndex(options, selectedValue, -1),
                preventDefault: true,
            };
        }
        return {
            type: "move",
            activeIndex: stepEnabledIndex(options, activeIndex, -1),
            preventDefault: true,
        };
    }

    if (key === "Home") {
        return open
            ? {
                  type: "move",
                  activeIndex: firstEnabledIndex(options),
                  preventDefault: true,
              }
            : { type: "none" };
    }

    if (key === "End") {
        return open
            ? {
                  type: "move",
                  activeIndex: lastEnabledIndex(options),
                  preventDefault: true,
              }
            : { type: "none" };
    }

    if (key === "Escape") {
        return open
            ? { type: "close", preventDefault: true, restoreFocus: true }
            : { type: "none" };
    }

    if (key === "Tab") {
        return open
            ? { type: "close", preventDefault: false, restoreFocus: false }
            : { type: "none" };
    }

    return { type: "none" };
}

export interface OutsidePointerInput {
    open: boolean;
    inside: boolean;
    targetFocusable: boolean;
}

export function outsidePointerAction(input: OutsidePointerInput): {
    close: boolean;
    restoreFocus: boolean;
} {
    if (!input.open || input.inside) {
        return { close: false, restoreFocus: false };
    }
    return {
        close: true,
        restoreFocus: !input.targetFocusable,
    };
}

export function fitSelectPosition(input: SelectPositionInput): SelectPosition {
    const maxWidth = Math.max(
        160,
        input.viewportWidth - VIEWPORT_MARGIN * 2
    );
    const width = Math.max(160, Math.min(input.width, maxWidth));
    const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(input.left, input.viewportWidth - width - VIEWPORT_MARGIN)
    );
    const availableBelow = Math.max(
        0,
        input.viewportHeight - input.bottom - TRIGGER_GAP - VIEWPORT_MARGIN
    );
    const availableAbove = Math.max(
        0,
        input.top - TRIGGER_GAP - VIEWPORT_MARGIN
    );
    const wanted = Math.min(
        Math.max(input.desiredHeight ?? 0, MIN_MENU_HEIGHT),
        MAX_MENU_HEIGHT
    );
    const placement: "top" | "bottom" =
        availableBelow < wanted && availableAbove > availableBelow
            ? "top"
            : "bottom";
    const available = placement === "top" ? availableAbove : availableBelow;

    if (placement === "top") {
        return {
            left,
            width,
            bottom: Math.max(
                0,
                input.viewportHeight - input.top + TRIGGER_GAP
            ),
            maxHeight: Math.max(
                48,
                Math.min(MAX_MENU_HEIGHT, available)
            ),
            placement,
        };
    }

    return {
        left,
        width,
        top: input.bottom + TRIGGER_GAP,
        maxHeight: Math.max(48, Math.min(MAX_MENU_HEIGHT, available)),
        placement,
    };
}
