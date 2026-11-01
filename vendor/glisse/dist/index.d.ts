
import { ButtonHTMLAttributes, CSSProperties, ElementType, ForwardRefExoticComponent, HTMLAttributes, InputHTMLAttributes, JSX, ReactNode, RefAttributes } from "react";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shown before the label. On its own, the button is a circle; give it an `aria-label`. */
  icon?: ReactNode;
  /** `glass` is clear; `filled` fills it with the accent colour, for the primary action. */
  variant?: "glass" | "filled";
  /** Marks an action that deletes or can't be undone. Shorthand for a red `tint`. */
  destructive?: boolean;
  /** Any CSS colour. Tints a glass button's label, or a filled button's fill. */
  tint?: string;
}
export declare const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>>;
type GlassProps = HTMLAttributes<HTMLDivElement>;
export declare const Glass: ForwardRefExoticComponent<GlassProps & RefAttributes<HTMLDivElement>>;
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown before the text, such as a person or envelope glyph. */
  icon?: ReactNode;
}
export declare const Input: ForwardRefExoticComponent<InputProps & RefAttributes<HTMLInputElement>>;
interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
type MenuEntry = MenuItem | "separator";
interface MenuProps {
  items: MenuEntry[];
  /** Names the trigger and the menu for assistive technology. */
  "aria-label": string;
  /** The trigger's icon. Defaults to an ellipsis. */
  icon?: ReactNode;
  /** The trigger edge the menu lines up with as it opens across it. */
  align?: "start" | "end";
  className?: string;
  style?: CSSProperties;
}
export declare function Menu({ items, "aria-label": label, icon, align, className, style }: MenuProps): JSX.Element;
type SearchFieldProps = Omit<InputProps, "type">;
/** An `Input` for searching: a magnifier icon, a "Search" placeholder and a clear button. */
export declare const SearchField: ForwardRefExoticComponent<SearchFieldProps & RefAttributes<HTMLInputElement>>;
interface SegmentedControlItem {
  value: string;
  label: ReactNode;
}
interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  items: SegmentedControlItem[];
  /** The selected segment's `value`, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
}
/**
 * A choice between a few options, as iOS 26's segmented control: a thumb on a
 * track that, held or dragged, lifts into a lens over the labels.
 */
export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;
interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}
export declare const Slider: ForwardRefExoticComponent<SliderProps & RefAttributes<HTMLInputElement>>;
interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "defaultValue" | "defaultChecked" | "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
export declare const Switch: ForwardRefExoticComponent<SwitchProps & RefAttributes<HTMLButtonElement>>;
interface TabBarItem {
  value: string;
  label: ReactNode;
  /** An icon drawn above the label, as in an iOS tab bar. */
  icon?: ReactNode;
  /** Renders the tab as a link. Clicking it navigates; the bar still tracks selection. */
  href?: string;
}
interface TabBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  items: TabBarItem[];
  /** The selected tab's `value`, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  /** The component used for tabs with an `href`, such as Next.js's `Link`. */
  link?: ElementType;
}
/**
 * A row of tabs on glass, as iOS 26's tab bar: the selection springs between
 * them, follows a drag, and lifts into a lens while held. Tabs with an `href`
 * are links, and the bar is then navigation.
 */
export declare function TabBar(props: TabBarProps): JSX.Element;
export type { ButtonProps, GlassProps, InputProps, MenuEntry, MenuItem, MenuProps, SearchFieldProps, SegmentedControlItem, SegmentedControlProps, SliderProps, SwitchProps, TabBarItem, TabBarProps };